import React, { useState, useEffect } from 'react';
import { NeuCircleButton } from './NeuCircleButton';
import { NeuCard } from './NeuCard';
import { NeuButton } from './NeuButton';
import { processTriage } from '@/src/services/aiService';
import { processOfflineTriage, initOfflineModel, isOfflineEngineReady, sendOfflineChatMessage } from '@/src/services/offlineAiService';
import { PatientRecord } from '@/src/types';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, CheckCircle2, Loader2, Mic, MapPin, WifiOff, Download, MessageSquare, Send, AlertCircle, X } from 'lucide-react';
import { db, auth } from '@/src/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/src/lib/firestoreErrors';

interface CitizenViewProps {
  onTriageComplete: (record: PatientRecord) => void;
}

export function CitizenView({ onTriageComplete }: CitizenViewProps) {
  const [sosActive, setSosActive] = useState(false);
  const [symptoms, setSymptoms] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [triageResult, setTriageResult] = useState<PatientRecord | null>(null);
  const [usedOfflineModel, setUsedOfflineModel] = useState<boolean>(false);
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [manualLocation, setManualLocation] = useState('');
  const [offlineStatus, setOfflineStatus] = useState<{ active: boolean, progress: string, percent?: number }>({ active: false, progress: '' });
  const [showSosConfirm, setShowSosConfirm] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setMediaFile(file);
      setMediaPreview(URL.createObjectURL(file));
    }
  };

  useEffect(() => {
    const fetchDefaultSos = async () => {
      if (!auth.currentUser) return;
      try {
        const { getDoc } = await import('firebase/firestore');
        const docRef = doc(db, 'users', auth.currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().sosMessage) {
          setSymptoms(docSnap.data().sosMessage);
        }
      } catch (err) {
        console.error("Failed to load default SOS message", err);
      }
    };
    fetchDefaultSos();
  }, []);
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'assistant' | 'system', content: string}[]>(() => {
    try {
      const saved = localStorage.getItem('offlineChatMessages');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load chat history', e);
    }
    return [
      { role: 'system', content: 'You are an offline Triage Assistant. Evaluate symptoms, inform the patient of their likely ESI score (1 to 5), and strictly provide important First Aid Guidance.' }
    ];
  });
  
  useEffect(() => {
    try {
      localStorage.setItem('offlineChatMessages', JSON.stringify(chatMessages));
    } catch (e) {
      console.error('Failed to save chat history', e);
    }
  }, [chatMessages]);

  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);


  useEffect(() => {
    if (sosActive && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => console.error("Error getting location:", error),
        { enableHighAccuracy: true }
      );
    }
  }, [sosActive]);

  const handleDownloadOfflineEngine = async () => {
    try {
      setOfflineStatus({ active: true, progress: 'Initializing...', percent: 0 });
      await initOfflineModel((info) => {
        setOfflineStatus({ active: true, progress: info.text, percent: info.progress });
      });
      setOfflineStatus({ active: true, progress: 'Ready', percent: 1 });
    } catch (e) {
      console.error(e);
      setOfflineStatus({ active: false, progress: 'Failed to load', percent: 0 });
    }
  };

  const handleSos = () => {
    setShowSosConfirm(true);
  };

  const confirmSos = () => {
    setShowSosConfirm(false);
    setSosActive(true);
    setTriageResult(null);
  };

  const handleSubmit = async () => {
    if (!symptoms.trim()) return;
    setAnalyzing(true);
    let locationContext = '';
    if (location) {
      locationContext = `\n[User Location: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}]`;
    } else if (manualLocation.trim()) {
      locationContext = `\n[User Location (Manual): ${manualLocation.trim()}]`;
    }

    let demographics = '';
    try {
      if (auth.currentUser) {
        const { getDoc } = await import('firebase/firestore');
        const docRef = doc(db, 'users', auth.currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const d = docSnap.data();
          if (d.fullName) demographics += `\n[Name: ${d.fullName}]`;
          if (d.phone) demographics += `\n[Phone: ${d.phone}]`;
          if (d.birthdate) demographics += `\n[Birthdate: ${d.birthdate}]`;
        }
      }
    } catch(e) {
      console.warn("Failed to attach demographics", e);
    }
    
    try {
      let result;
      let usedOffline = false;
      let mediaBase64 = undefined;
      let mediaMimeType = undefined;

      if (mediaFile) {
        const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = error => reject(error);
        });
        mediaBase64 = await toBase64(mediaFile);
        mediaMimeType = mediaFile.type;
      }

      if (!navigator.onLine) {
        if (isOfflineEngineReady()) {
          console.log("Using local Gemma engine because network is unavailable...");
          result = await processOfflineTriage(symptoms + locationContext + demographics);
          usedOffline = true;
        } else {
          throw new Error("No network and offline AI is not downloaded. Please download the Edge AI Engine below.");
        }
      } else {
        // We are online, use Gemini
        try {
          console.log("Using online Gemini engine...");
          result = await processTriage(symptoms + locationContext + demographics, mediaBase64, mediaMimeType);
        } catch (e) {
          // Fallback if online but Gemini fails
          if (isOfflineEngineReady()) {
            console.log("Online Gemini failed, using local Gemma engine...");
            result = await processOfflineTriage(symptoms + locationContext + demographics);
            usedOffline = true;
          } else {
            throw e;
          }
        }
      }
      
      const record: PatientRecord = {
        id: Math.random().toString(36).substring(7),
        symptoms,
        ...result,
        timestamp: Date.now(),
        location: location || undefined,
        status: 'Critical',
        mediaBase64,
        mediaMimeType
      };

      try {
        await setDoc(doc(db, 'triage_records', record.id), {
          ...record,
          userId: auth.currentUser ? auth.currentUser.uid : 'anonymous'
        });

        // Broadcast to NGOs and Admins
        const { collection } = await import('firebase/firestore');
        await setDoc(doc(collection(db, 'broadcasts'), `sos_${record.id}`), {
          type: `Emergency: ${result.specialty || 'General'}`,
          message: symptoms,
          severity: result.esiScore && result.esiScore <= 2 ? 'Critical' : 'High',
          timestamp: Date.now(),
          location: location || manualLocation || 'Unknown GPS',
        });

      } catch (dbErr) {
        console.error('Failed to save to backend:', dbErr);
        handleFirestoreError(dbErr, OperationType.WRITE, 'triage_records');
      }

      setTriageResult(record);
      setUsedOfflineModel(usedOffline);
      onTriageComplete(record);
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Failed to process triage.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatting) return;

    const newMessages = [...chatMessages, { role: 'user' as const, content: chatInput }];
    setChatMessages(newMessages);
    setChatInput('');
    setIsChatting(true);

    try {
      const responseText = await sendOfflineChatMessage(newMessages);
      setChatMessages([...newMessages, { role: 'assistant', content: responseText }]);
    } catch (err) {
      console.error(err);
      setChatMessages([...newMessages, { role: 'assistant', content: 'An error occurred or engine is not ready.' }]);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="flex flex-col items-center max-w-md mx-auto p-4 min-h-[70vh]">
      <AnimatePresence mode="wait">
        {!sosActive ? (
          <motion.div
            key="sos"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex-1 flex flex-col items-center justify-center w-full"
          >
            <NeuCircleButton
              size={240}
              className="text-4xl text-red-500 font-serif italic tracking-tighter mb-12"
              onClick={handleSos}
              glow="red"
            >
              SOS
            </NeuCircleButton>
            <p className="text-text-muted text-[10px] tracking-[0.3em] uppercase text-center font-semibold">
              Emergency Assistance
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="triage"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full flex-1 flex flex-col"
          >
            <NeuCard className="mb-6 flex flex-col gap-4">
              <h2 className="text-xl font-semibold text-text flex items-center gap-2">
                <Mic className="text-accent w-5 h-5" /> Specify Symptoms
              </h2>
              {location ? (
                <div className="flex items-center gap-2 text-xs text-emerald-500 font-mono bg-emerald-500/10 px-3 py-1.5 rounded-md inline-flex w-fit">
                  <MapPin className="w-3 h-3" /> Location Acquired Automatically
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <span className="text-xs text-text-muted font-mono tracking-wider">GPS Unavailable. Enter Location:</span>
                  <input
                    type="text"
                    value={manualLocation}
                    onChange={(e) => setManualLocation(e.target.value)}
                    placeholder="Enter current address, landmark, or coordinates"
                    className="w-full p-3 glass-input font-sans text-sm"
                  />
                </div>
              )}
              <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex flex-col gap-4">
                <textarea
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  placeholder="Describe injuries, condition, or immediate danger..."
                  className="w-full h-32 p-4 glass-input resize-none font-sans text-sm"
                  required
                  minLength={4}
                />

                <div className="flex flex-col gap-2">
                  <label htmlFor="mediaUpload" className="cursor-pointer">
                    <div className="flex items-center justify-center p-4 border border-dashed border-text-muted/30 rounded-xl bg-background/50 hover:bg-background/80 transition-colors">
                      <Camera className="w-5 h-5 text-accent mr-2" />
                      <span className="text-sm text-text-muted font-medium">Attach Photo / Video (Optional)</span>
                    </div>
                  </label>
                  <input 
                    id="mediaUpload" 
                    type="file" 
                    accept="image/*,video/*" 
                    className="hidden" 
                    onChange={handleMediaChange} 
                  />
                  {mediaPreview && (
                    <div className="relative w-full h-32 mt-2 rounded-xl border border-text-muted/20 overflow-hidden bg-black/5">
                      {mediaFile?.type.startsWith('image') ? (
                        <img src={mediaPreview} alt="Preview" className="w-full h-full object-contain" />
                      ) : (
                        <video src={mediaPreview} className="w-full h-full object-contain" controls />
                      )}
                      <button 
                        type="button" 
                        onClick={() => { setMediaFile(null); setMediaPreview(null); }} 
                        className="absolute top-2 right-2 bg-background/80 text-text p-1.5 rounded-full hover:bg-background"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex gap-4">
                  <NeuButton type="button" className="flex-1" onClick={() => setSosActive(false)}>
                    Cancel
                  </NeuButton>
                  <NeuButton 
                    type="submit"
                    className="flex-1" 
                    active
                     disabled={analyzing}
                  >
                    {analyzing ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Broadcast'}
                  </NeuButton>
                </div>
              </form>
            </NeuCard>

            {triageResult && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <NeuCard className="mb-6 border border-red-500/30 overflow-hidden relative">
                  <div className="absolute top-0 right-0 p-2 opacity-10 font-serif italic text-6xl text-red-500 font-bold">!</div>
                  <div className="flex items-center gap-2 text-red-500 font-bold mb-2 text-xs uppercase tracking-widest">
                    <CheckCircle2 className="w-4 h-4" /> Broadcast Sent
                  </div>
                  {usedOfflineModel && (
                    <div className="mb-3 inline-flex items-center gap-1.5 bg-accent/10 text-accent text-xs font-bold px-2 py-1 rounded">
                      <WifiOff className="w-3 h-3" /> Processed via Edge AI
                    </div>
                  )}
                  <p className="text-sm text-text mt-4">
                    Priority: <span className="font-bold text-red-500">ESI Level {triageResult.esiScore}</span> ({triageResult.specialty})
                  </p>
                  
                  <details className="mt-4 group border border-text-muted/20 rounded-xl overflow-hidden bg-background">
                    <summary className="bg-background/50 p-3 text-xs text-text font-bold cursor-pointer select-none flex items-center gap-2 hover:bg-background transition-colors data-[open]:border-b border-text-muted/10">
                      <AlertCircle className="w-4 h-4 text-accent" /> AI Triage & Reasoning Details
                    </summary>
                    <div className="p-4 space-y-4 text-sm text-text leading-relaxed">
                      <div>
                        <h4 className="font-mono text-[10px] text-text-muted uppercase tracking-widest mb-1">Clinical Reasoning</h4>
                        <div className="p-3 bg-red-500/5 rounded-lg border border-red-500/10 text-sm text-text">
                          {triageResult.reasoning || "Reasoning unavailable."}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <h4 className="font-mono text-[10px] text-text-muted uppercase tracking-widest mb-1">Recommended Specialty</h4>
                          <p className="font-medium text-accent">{triageResult.specialty}</p>
                        </div>
                        <div>
                          <h4 className="font-mono text-[10px] text-text-muted uppercase tracking-widest mb-1">ESI Score</h4>
                          <p className="font-medium text-red-500">Level {triageResult.esiScore}</p>
                        </div>
                      </div>
                    </div>
                  </details>

                  <p className="text-xs text-text-muted mt-4 font-medium">Waiting for emergency responder...</p>
                </NeuCard>

                <NeuCard>
                  <h3 className="text-lg font-bold text-text mb-4 border-b border-text-muted/20 pb-2">
                    Immediate First Aid
                  </h3>
                  <div className="text-sm text-text-muted leading-relaxed space-y-4">
                    {triageResult.firstAidGuidance && triageResult.firstAidGuidance.length > 0 ? (
                      triageResult.firstAidGuidance.map((step, idx) => (
                        <React.Fragment key={idx}>
                          <p className="flex gap-4 items-start"><span className="text-accent font-mono font-bold mt-0.5">0{idx + 1}</span> <span>{step}</span></p>
                          {idx < triageResult.firstAidGuidance!.length - 1 && <hr className="border-text-muted/10 border-t-2" />}
                        </React.Fragment>
                      ))
                    ) : triageResult.esiScore <= 2 ? (
                      <>
                        <p className="flex gap-4 items-start"><span className="text-accent font-mono font-bold mt-0.5">01</span> Keep the patient completely still.</p>
                        <hr className="border-text-muted/10 border-t-2" />
                        <p className="flex gap-4 items-start"><span className="text-accent font-mono font-bold mt-0.5">02</span> Apply direct pressure to any bleeding.</p>
                        <hr className="border-text-muted/10 border-t-2" />
                        <p className="flex gap-4 items-start"><span className="text-accent font-mono font-bold mt-0.5">03</span> Do not attempt to move unless in immediate danger.</p>
                      </>
                    ) : (
                      <>
                        <p className="flex gap-4 items-start"><span className="text-accent font-mono font-bold mt-0.5">01</span> Find a safe resting place.</p>
                        <hr className="border-text-muted/10 border-t-2" />
                        <p className="flex gap-4 items-start"><span className="text-accent font-mono font-bold mt-0.5">02</span> Keep the patient hydrated if conscious.</p>
                        <hr className="border-text-muted/10 border-t-2" />
                        <p className="flex gap-4 items-start"><span className="text-accent font-mono font-bold mt-0.5">03</span> Monitor breathing patterns until help arrives.</p>
                      </>
                    )}
                  </div>
                </NeuCard>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <NeuCard className="mt-8 relative overflow-hidden flex items-center justify-between p-4 border border-text-muted/10 bg-background/50">
          {offlineStatus.active && offlineStatus.progress !== 'Ready' && offlineStatus.percent !== undefined && (
            <div className="absolute bottom-0 left-0 h-1 bg-accent/10 w-full">
              <div 
                className="h-full bg-accent transition-all duration-300 ease-out" 
                style={{ width: `${Math.max(0, Math.min(100, offlineStatus.percent * 100))}%` }} 
              />
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full transition-colors duration-300 ${offlineStatus.progress === 'Ready' || isOfflineEngineReady() ? 'bg-emerald-500/20 text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'bg-accent/10 text-accent'}`}>
              {offlineStatus.progress === 'Ready' || isOfflineEngineReady() ? <CheckCircle2 className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-text flex items-center gap-2">
                Edge AI Engine
                {(offlineStatus.progress === 'Ready' || isOfflineEngineReady()) && (
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded font-mono uppercase tracking-wider">Ready</span>
                )}
              </p>
              <p className="text-xs font-mono text-text-muted mt-0.5 line-clamp-1 max-w-[200px] sm:max-w-[250px]">
                {offlineStatus.progress === 'Ready' || isOfflineEngineReady()
                  ? 'Works without internet connection'
                  : offlineStatus.progress 
                    ? offlineStatus.progress
                    : (!navigator.onLine ? 'Network required to download AI Engine' : 'Download for network-less triage')
                }
              </p>
            </div>
          </div>
          {!(offlineStatus.progress === 'Ready' || isOfflineEngineReady()) && !offlineStatus.active && navigator.onLine && (
            <NeuButton className="text-xs py-1.5 px-3 whitespace-nowrap ml-2" onClick={handleDownloadOfflineEngine}>
              <Download className="w-4 h-4 mr-2" />
              Download
            </NeuButton>
          )}
          {offlineStatus.active && offlineStatus.progress !== 'Ready' && (
            <div className="flex flex-col items-end gap-1 ml-2">
              <Loader2 className="w-5 h-5 animate-spin text-accent" />
              {offlineStatus.percent !== undefined && (
                <span className="text-[10px] font-mono text-text-muted">{Math.round(offlineStatus.percent * 100)}%</span>
              )}
            </div>
          )}
        </NeuCard>

        {(isOfflineEngineReady() || chatMessages.length > 1) && (
          <NeuCard className={`mt-6 flex flex-col gap-4 w-full ${!isOfflineEngineReady() ? 'opacity-80' : ''}`} glow="yellow">
            <h2 className="text-lg font-semibold text-text flex items-center justify-between border-b border-text-muted/10 pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="text-accent w-5 h-5" /> Edge AI Assistant
              </div>
              {!isOfflineEngineReady() && (
                <span className="text-xs text-red-500 font-mono bg-red-500/10 px-2 py-1 rounded">Engine Offline</span>
              )}
            </h2>
            
            <div className="flex-1 w-full max-h-[300px] overflow-y-auto space-y-3 p-2 bg-background/40 rounded-lg border border-text-muted/10">
              {chatMessages.filter(m => m.role !== 'system').map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                    msg.role === 'user' 
                      ? 'bg-accent text-white rounded-br-none' 
                      : 'bg-background border border-text-muted/20 text-text rounded-bl-none'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatMessages.length === 1 && (
                <p className="text-xs text-text-muted text-center pt-4">No chat history. Initialize the offline model to begin.</p>
              )}
              {isChatting && (
                <div className="flex justify-start">
                  <div className="bg-background border border-text-muted/20 text-text-muted p-3 rounded-2xl rounded-bl-none">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleChatSubmit} className="flex gap-2">
              <input 
                type="text" 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about symptoms..."
                className="flex-1 glass-input p-3 rounded-xl text-sm font-sans"
                disabled={!isOfflineEngineReady()}
                required
              />
              <NeuButton type="submit" active disabled={isChatting || !isOfflineEngineReady()} className="px-4">
                <Send className="w-4 h-4" />
              </NeuButton>
            </form>
          </NeuCard>
        )}

      <AnimatePresence>
        {showSosConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm"
            >
              <NeuCard className="flex flex-col gap-6" glow="red">
                <div className="flex items-center gap-3 text-red-500">
                  <AlertCircle className="w-8 h-8" />
                  <h3 className="text-xl font-bold">Activate SOS?</h3>
                </div>
                <p className="text-text font-sans">
                  Are you sure you want to activate SOS? This will send your location and initiate emergency triage.
                </p>
                <div className="flex gap-4">
                  <NeuButton className="flex-1" onClick={() => setShowSosConfirm(false)}>
                    No
                  </NeuButton>
                  <NeuButton 
                    active 
                    className="flex-1 bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white border-red-500/50"
                    onClick={confirmSos}
                  >
                    Yes
                  </NeuButton>
                </div>
              </NeuCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
