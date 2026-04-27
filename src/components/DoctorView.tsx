import React, { useState, useEffect } from 'react';
import { PatientRecord } from '@/src/types';
import { NeuCard } from './NeuCard';
import { NeuButton } from './NeuButton';
import { Navigation, Clock, User, ShieldCheck, Loader2, MapPin, Activity, X, Camera } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { verifyMedicalLicense } from '../services/aiService';
import { GPSTracker } from './GPSTracker';
import { MapView } from './MapView';

interface DoctorViewProps {
  patients: PatientRecord[];
}

export function DoctorView({ patients }: DoctorViewProps) {
  const [selectedPatient, setSelectedPatient] = useState<PatientRecord | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [showRoute, setShowRoute] = useState(false);

  useEffect(() => {
    if (selectedPatient) {
      const updatedMatch = patients.find(p => p.id === selectedPatient.id);
      if (updatedMatch && JSON.stringify(updatedMatch) !== JSON.stringify(selectedPatient)) {
        setSelectedPatient(updatedMatch);
      }
    }
  }, [patients, selectedPatient]);

  const sortedPatients = [...patients].sort((a, b) => a.esiScore - b.esiScore);

  return (
    <div className="max-w-xl mx-auto p-4 relative">
      <div className="flex justify-between items-end mb-6 px-2 border-b border-text-muted/10 pb-4">
        <h1 className="text-3xl font-serif text-text font-bold tracking-tight">Triage Feed</h1>
        <span className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1">
          <Clock className="w-3 h-3" /> Live Mesh
        </span>
      </div>

      <div className="mb-6">
        <h3 className="font-serif text-xl font-bold flex items-center gap-2 mb-3">
          <MapPin className="w-5 h-5 text-accent" /> Tactical Overview
        </h3>
        <MapView 
          onItemAction={(id, type) => {
            if (type === 'incident') {
              const patient = patients.find(p => p.id === id);
              if (patient) setSelectedPatient(patient);
            }
          }}
          actionLabel="Review Patient"
        />
      </div>

      <div className="flex flex-col gap-4">
        {sortedPatients.length === 0 ? (
          <NeuCard className="text-center py-12 border-dashed border-text-muted/10">
            <p className="text-sm font-medium uppercase tracking-wider text-text-muted opacity-70">No emergency beacons detected on the mesh.</p>
          </NeuCard>
        ) : (
          sortedPatients.map((p) => (
            <motion.div key={p.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
              <NeuCard 
                className="cursor-pointer hover:border-accent transition-all bg-background/40 hover:bg-background/80"
                glow={p.esiScore === 1 ? 'red' : p.esiScore === 2 ? 'yellow' : 'none'}
                onClick={() => setSelectedPatient(p)}
              >
                <div className="flex justify-between items-center mb-3">
                  <span className="font-bold text-sm text-text">ESI Level {p.esiScore}</span>
                  <div className="flex items-center gap-3">
                    {p.hasPendingWrites && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border text-orange-500 border-orange-500/20 bg-orange-500/10 flex items-center gap-1" title="Offline - Waiting to Sync">
                         <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></div> Syncing
                      </span>
                    )}
                    {p.eta && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border text-amber-500 border-amber-500/20 bg-amber-500/10">
                        ETA: {p.eta}
                      </span>
                    )}
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${
                      p.status === 'Critical' ? 'text-red-500 border-red-500/20 bg-red-500/10' : 
                      p.status === 'Dispatched' ? 'text-amber-500 border-amber-500/20 bg-amber-500/10' :
                      p.status === 'En Route' ? 'text-blue-500 border-blue-500/20 bg-blue-500/10' :
                      'text-emerald-500 border-emerald-500/20 bg-emerald-500/10'
                    }`}>{p.status}</span>
                    <span className="text-[10px] font-mono text-text-muted">
                      {new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-text-muted font-sans truncate">{p.symptoms}</p>
                <div className="mt-4 pt-4 border-t border-text-muted/10 flex justify-between items-center">
                  <div className="flex gap-2 items-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-background px-2 py-1 text-text-muted rounded-sm border border-text-muted/20">
                      {p.specialty}
                    </span>
                    {p.location && (
                      <span className="text-[10px] text-text-muted font-mono flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {p.location.lat.toFixed(2)}, {p.location.lng.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <span className="text-accent text-[10px] uppercase font-bold flex items-center gap-1 hover:underline">
                    Review <Navigation className="w-3 h-3" />
                  </span>
                </div>
              </NeuCard>
            </motion.div>
          ))
        )}
      </div>

      <AnimatePresence>
        {selectedPatient && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md overflow-y-auto"
          >
            <div className="max-w-2xl mx-auto p-4 py-8 flex flex-col gap-6">
              <NeuButton onClick={() => {
                setSelectedPatient(null);
                setIsTracking(false);
                setShowRoute(false);
              }} className="self-start text-[10px]">
                <X className="w-3 h-3 mr-1 inline" /> Close Patient details
              </NeuButton>

              <NeuCard glow={selectedPatient.esiScore === 1 ? 'red' : selectedPatient.esiScore === 2 ? 'yellow' : 'none'} className="bg-background shadow-xl">
                <div className="flex justify-between items-start mb-6 pb-6 border-b border-text-muted/10">
                  <div>
                    <h2 className="text-3xl font-serif font-bold tracking-tight text-text flex items-center gap-2">
                      <User className="text-accent w-6 h-6" /> Patient #{selectedPatient.id.slice(0, 8)}
                    </h2>
                    <p className="text-[10px] tracking-widest uppercase text-text-muted mt-2">{selectedPatient.specialty} Required</p>
                    {selectedPatient.location && (
                      <div className="flex items-center gap-1 text-xs text-text-muted mt-2 font-mono px-2 py-1 bg-background rounded inline-flex border border-text-muted/10 shadow-inner">
                        <MapPin className="w-3 h-3 text-accent" /> {selectedPatient.location.lat.toFixed(4)}, {selectedPatient.location.lng.toFixed(4)}
                      </div>
                    )}
                  </div>
                  <div className="bg-red-500/10 border border-red-500/30 text-red-500 font-bold px-4 py-2 text-sm tracking-widest uppercase rounded">
                    ESI {selectedPatient.esiScore}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="p-4 border border-text-muted/10 bg-background/50 rounded-xl">
                    <h3 className="text-xs font-bold uppercase text-text mb-2 flex items-center gap-2 text-text-muted">
                      History / Info
                    </h3>
                    <ul className="text-xs space-y-1 text-text-muted font-mono">
                      <li><strong>Reported:</strong> {new Date(selectedPatient.timestamp).toLocaleString()}</li>
                      {selectedPatient.lastUpdatedAt && <li><strong>Last Update:</strong> {new Date(selectedPatient.lastUpdatedAt).toLocaleString()}</li>}
                      {selectedPatient.reporterId && <li><strong>Reported By:</strong> {selectedPatient.reporterId}</li>}
                    </ul>
                  </div>
                  
                  <div className="p-4 border border-text-muted/10 bg-background/50 rounded-xl">
                    <h3 className="text-xs font-bold uppercase text-text mb-2 flex items-center gap-2 text-text-muted">
                      Responder Status
                    </h3>
                    <ul className="text-xs space-y-1 text-text-muted">
                      <li><strong>Assigned To:</strong> {selectedPatient.assignedResponderId || <span className="italic text-red-500">Unassigned</span>}</li>
                      <li><strong>Current Status:</strong> <span className="font-bold text-text">{selectedPatient.status}</span></li>
                      {selectedPatient.eta && <li><strong>ETA:</strong> {selectedPatient.eta}</li>}
                    </ul>
                  </div>
                </div>

                <div className="mb-6 p-6 border border-text-muted/10 bg-background/50 rounded-xl shadow-inner">
                  <h3 className="text-xs font-bold uppercase text-text mb-2 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-accent" /> Symptoms / Narrative
                  </h3>
                  <p className="text-sm font-sans text-text-muted whitespace-pre-wrap">{selectedPatient.symptoms}</p>
                </div>

                {selectedPatient.mediaBase64 && selectedPatient.mediaMimeType && (
                  <div className="mb-6 p-6 border border-text-muted/10 bg-background/50 rounded-xl space-y-4">
                    <h3 className="text-xs font-bold uppercase text-text mb-2 flex items-center gap-2">
                      <Camera className="w-4 h-4 text-accent" /> Attached Media
                    </h3>
                    <div className="relative w-full max-h-[300px] rounded-xl overflow-hidden bg-black/10 border border-text-muted/20">
                      {selectedPatient.mediaMimeType.startsWith('image') ? (
                        <img 
                          src={`data:${selectedPatient.mediaMimeType};base64,${selectedPatient.mediaBase64}`} 
                          alt="Emergency context" 
                          className="w-full h-full object-contain" 
                        />
                      ) : (
                        <video 
                          src={`data:${selectedPatient.mediaMimeType};base64,${selectedPatient.mediaBase64}`} 
                          controls 
                          className="w-full h-full object-contain" 
                        />
                      )}
                    </div>
                  </div>
                )}

                <div className="mb-8">
                  <h3 className="font-serif text-lg font-bold text-text flex items-center gap-2 mb-4">
                    <ShieldCheck className="w-4 h-4 text-accent" />
                    AI Clinical Reasoning
                  </h3>
                  <div className="markdown-body p-6 border border-text-muted/10 bg-background/50 shadow-inner rounded-xl text-sm leading-relaxed font-sans">
                    <Markdown>{selectedPatient.reasoning}</Markdown>
                  </div>
                </div>

                <div className="mb-6 p-6 border border-text-muted/10 bg-background/50 rounded-xl space-y-4 shadow-inner">
                  <h3 className="text-xs font-bold uppercase text-text flex items-center gap-2 border-b border-text-muted/10 pb-2">
                    <ShieldCheck className="w-4 h-4 text-accent" /> Status Management
                  </h3>
                  
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {['Critical', 'Dispatched', 'En Route', 'Secure'].map((status) => (
                       <NeuButton 
                         key={status}
                         active={selectedPatient.status === status}
                         onClick={async () => {
                           try {
                             const { db } = await import('@/src/lib/firebase');
                             const { doc, setDoc } = await import('firebase/firestore');
                             await setDoc(doc(db, 'triage_records', selectedPatient.id), { status }, { merge: true });
                           } catch(err) {
                             console.error(err);
                             const { handleFirestoreError, OperationType } = await import('@/src/lib/firestoreErrors');
                             handleFirestoreError(err, OperationType.WRITE, `triage_records/${selectedPatient.id}`);
                           }
                         }}
                         className="flex-[1_0_auto] text-[10px] uppercase font-bold text-center justify-center py-2 px-3 min-w-[80px]"
                       >
                         {status}
                       </NeuButton>
                    ))}
                  </div>

                  <div className="flex flex-col gap-2 mt-4 max-w-sm">
                    <div className="flex gap-2 items-center">
                      <input 
                        type="text" 
                        placeholder="Assign Responder ID" 
                        className="flex-1 glass-input py-2 px-3 text-sm"
                        id="responderIdInput"
                        defaultValue={selectedPatient.assignedResponderId || ''}
                      />
                      <NeuButton 
                        onClick={async () => {
                          const input = document.getElementById('responderIdInput') as HTMLInputElement;
                          const responderId = input.value.trim();
                          if (!responderId) return alert('Enter a responder ID');
                          
                          const confirmed = window.confirm(`Are you sure you want to dispatch responder '${responderId}' to this patient?`);
                          if (!confirmed) return;

                          try {
                            const { db } = await import('@/src/lib/firebase');
                            const { doc, setDoc } = await import('firebase/firestore');
                            await setDoc(doc(db, 'triage_records', selectedPatient.id), { 
                               assignedResponderId: responderId,
                               status: 'Dispatched' 
                            }, { merge: true });
                            alert("Responder Dispatched");
                          } catch(err) {
                            console.error(err);
                            const { handleFirestoreError, OperationType } = await import('@/src/lib/firestoreErrors');
                            handleFirestoreError(err, OperationType.WRITE, `triage_records/${selectedPatient.id}`);
                          }
                        }}
                        className="font-bold text-sm bg-accent/10 border-accent/20 text-accent hover:bg-accent/20 py-2"
                      >
                        Dispatch
                      </NeuButton>
                    </div>

                    {(selectedPatient.status === 'Dispatched' || selectedPatient.status === 'En Route') && (
                      <div className="flex gap-2 items-center mt-2 pt-2 border-t border-text-muted/10">
                        <input 
                          type="text" 
                          placeholder="Update ETA (e.g. 5 mins)" 
                          className="flex-1 glass-input py-2 px-3 text-sm"
                          id="etaInput"
                          defaultValue={selectedPatient.eta || ''}
                        />
                        <NeuButton 
                          onClick={async () => {
                            const input = document.getElementById('etaInput') as HTMLInputElement;
                            const eta = input.value.trim();
                            if (!eta) return alert('Enter an ETA');
                            try {
                              const { db } = await import('@/src/lib/firebase');
                              const { doc, setDoc } = await import('firebase/firestore');
                              await setDoc(doc(db, 'triage_records', selectedPatient.id), { 
                                 eta,
                                 status: 'En Route'
                              }, { merge: true });
                              alert("ETA Updated");
                            } catch(err) {
                              console.error(err);
                              const { handleFirestoreError, OperationType } = await import('@/src/lib/firestoreErrors');
                              handleFirestoreError(err, OperationType.WRITE, `triage_records/${selectedPatient.id}`);
                            }
                          }}
                          className="font-bold text-sm bg-blue-500/10 border-blue-500/20 text-blue-500 hover:bg-blue-500/20 py-2 whitespace-nowrap"
                        >
                          Update ETA
                        </NeuButton>
                      </div>
                    )}
                  </div>
                </div>

                {!isTracking ? (
                  <div className="flex gap-2 pt-4 border-t border-text-muted/10">
                    <NeuButton 
                      className="flex-1 justify-center text-sm font-bold bg-accent/10 text-accent border-accent/20 hover:bg-accent/20"
                      onClick={() => {
                        if (selectedPatient.location) {
                          setIsTracking(true);
                        } else {
                          alert("Patient location unavailable.");
                        }
                      }}
                    >
                      <Navigation className="w-4 h-4 mr-2" />
                      Launch GPS Tracker
                    </NeuButton>
                    {selectedPatient.location && selectedPatient.assignedResponderId && (
                      <NeuButton 
                        className="flex-1 justify-center text-sm font-bold bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20"
                        onClick={() => {
                          setIsTracking(true);
                          setShowRoute(true);
                        }}
                      >
                        <Navigation className="w-4 h-4 mr-2" />
                        Display Route
                      </NeuButton>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 pt-4 border-t border-text-muted/10 animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <h3 className="font-serif font-bold text-lg text-text flex items-center gap-2">
                          <Navigation className="w-5 h-5 text-accent" /> Live Tracking
                        </h3>
                        {selectedPatient.location && selectedPatient.assignedResponderId && (
                          <NeuButton onClick={() => setShowRoute(!showRoute)} className="px-3 py-1 text-xs">
                            {showRoute ? 'Hide Route' : 'Show Route'}
                          </NeuButton>
                        )}
                      </div>
                      <NeuButton onClick={() => { setIsTracking(false); setShowRoute(false); }} className="px-3 py-1 text-xs">
                        <X className="w-3 h-3 mr-1 inline" /> Close Tracker
                      </NeuButton>
                    </div>
                    {selectedPatient.location && <GPSTracker patientLocation={selectedPatient.location} responderId={selectedPatient.assignedResponderId} showRoute={showRoute} />}
                  </div>
                )}
              </NeuCard>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

