import React, { useState, useEffect } from 'react';
import { NeuCard } from './NeuCard';
import { NeuButton } from './NeuButton';
import { CloudUpload, Activity, Package, CheckCircle2, Map as MapIcon, History, RefreshCcw, AlertTriangle, PhoneCall } from 'lucide-react';
import { motion } from 'motion/react';
import { doc, onSnapshot, setDoc, collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { Radio, AlertCircle, Info } from 'lucide-react';
import { MapView } from './MapView';

export function NGOView() {
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const [bloodLevel, setBloodLevel] = useState(15);
  const [oxygenLevel, setOxygenLevel] = useState(55);
  const [rationsLevel, setRationsLevel] = useState(85);

  const [showIncidents, setShowIncidents] = useState(true);
  const [showDepots, setShowDepots] = useState(true);
  const [showSafeZones, setShowSafeZones] = useState(true);
  const [dbSyncStatus, setDbSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [activeSelection, setActiveSelection] = useState<string | null>(null);
  const [showDepotModal, setShowDepotModal] = useState(false);
  const [resourceDetail, setResourceDetail] = useState<{name: string, value: number} | null>(null);
  const [criticalAlert, setCriticalAlert] = useState<string | null>(null);

  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastType, setBroadcastType] = useState('Medical');
  const [broadcastSeverity, setBroadcastSeverity] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Critical');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [criticalIncidents, setCriticalIncidents] = useState<any[]>([]);

  const handleInspectResource = (name: string, value: number) => {
    if (value < 25) {
      setCriticalAlert(name);
      setTimeout(() => setCriticalAlert(null), 4000);
    } else {
      setResourceDetail({ name, value });
    }
  };

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'resources', 'ngo_hq'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (typeof data.bloodLevel === 'number') setBloodLevel(data.bloodLevel);
        if (typeof data.oxygenLevel === 'number') setOxygenLevel(data.oxygenLevel);
        if (typeof data.rationsLevel === 'number') setRationsLevel(data.rationsLevel);
        setDbSyncStatus('synced');
      }
    }, (error) => {
      console.error('Firestore Error:', error);
      setDbSyncStatus('error');
      handleFirestoreError(error, OperationType.GET, 'resources/ngo_hq');
    });

    const q = query(
      collection(db, 'broadcasts'),
      where('severity', '==', 'Critical'),
      orderBy('timestamp', 'desc'),
      limit(3)
    );
    const unsubBroadcasts = onSnapshot(q, (snapshot) => {
      const incidents: any[] = [];
      snapshot.forEach((docSnap) => {
        incidents.push({ id: docSnap.id, ...docSnap.data() });
      });
      setCriticalIncidents(incidents);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'broadcasts'));

    return () => {
      unsub();
      unsubBroadcasts();
    };
  }, []);

  const handleResourceChange = (key: 'bloodLevel' | 'oxygenLevel' | 'rationsLevel', val: number) => {
    if (key === 'bloodLevel') setBloodLevel(val);
    if (key === 'oxygenLevel') setOxygenLevel(val);
    if (key === 'rationsLevel') setRationsLevel(val);
    
    setDbSyncStatus('syncing');
    setDoc(doc(db, 'resources', 'ngo_hq'), { [key]: val }, { merge: true })
      .catch((error) => {
        setDbSyncStatus('error');
        handleFirestoreError(error, OperationType.WRITE, 'resources/ngo_hq');
      });
  };

  const getResourceStatus = (level: number) => {
    if (level < 25) return { text: 'Critical', color: 'text-red-500', bg: 'bg-red-500' };
    if (level < 75) return { text: 'Stable', color: 'text-accent', bg: 'bg-accent' };
    return { text: 'Abundant', color: 'text-text-muted', bg: 'bg-text-muted' };
  };

  const ResourceBlock = ({ name, value, onChange, onInspect }: { name: string; value: number; onChange: (v: number) => void; onInspect: () => void }) => {
    const status = getResourceStatus(value);
    
    return (
      <div>
        <div className="flex justify-between text-xs uppercase tracking-widest font-sans text-text-muted mb-3 items-center">
          <span className="cursor-pointer hover:text-accent font-bold transition-colors" onClick={onInspect}>{name} <span className="underline ml-1 opacity-50 font-normal">View</span></span>
          <span className={`${status.color} font-bold`}>{status.text}</span>
        </div>
        <div className="bg-background/50 border border-text-muted/10 h-1.5 w-full relative rounded-full overflow-hidden">
          <div className={`absolute top-0 left-0 h-full ${status.bg} transition-all duration-300`} style={{ width: `${value}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="text-4xl font-bold font-mono text-text cursor-pointer hover:text-accent transition-colors" onClick={onInspect}>
            {value}<span className="text-sm text-text-muted ml-1 font-sans font-normal">%</span>
          </div>
          <input 
            type="number" 
            value={value} 
            onChange={(e) => onChange(e.target.value ? Math.min(100, Math.max(0, Number(e.target.value))) : 0)}
            className="w-20 bg-background border border-text-muted/20 text-text font-mono text-center py-2 rounded-md outline-none focus:border-accent text-sm tracking-widest transition-colors"
            min="0"
            max="100"
          />
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (syncing) {
      const interval = setInterval(() => {
        setSyncProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            setTimeout(() => {
              setSyncing(false);
              setSyncProgress(0);
            }, 2000);
            return 100;
          }
          return prev + 5;
        });
      }, 500);
      return () => clearInterval(interval);
    }
  }, [syncing]);

  const handleBroadcast = async () => {
    if (!broadcastType) return;
    setSendingBroadcast(true);
    try {
      const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
      await setDoc(doc(collection(db, 'broadcasts'), id), {
        id,
        type: broadcastType,
        severity: broadcastSeverity,
        timestamp: Date.now(),
        senderId: auth.currentUser?.uid || 'Unknown'
      });
      setShowBroadcastModal(false);
    } catch (error) {
      console.error('Firestore Error:', error);
      alert('Failed to send broadcast');
    } finally {
      setSendingBroadcast(false);
    }
  };

  const criticalResources = [];
  if (bloodLevel < 25) criticalResources.push("Universal Blood (O-)");
  if (oxygenLevel < 25) criticalResources.push("Oxygen Tanks");
  if (rationsLevel < 25) criticalResources.push("Field Rations");

  return (
    <div className="max-w-xl mx-auto p-4 flex flex-col gap-6">
      {criticalResources.length > 0 && (
        <div className="flex flex-col gap-3">
          {criticalResources.map((resource) => (
            <motion.div 
              key={resource}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="bg-red-600 border-2 border-red-400 p-4 rounded-lg shadow-[0_0_20px_rgba(220,38,38,0.6)] flex items-center gap-4 z-50 relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-red-400/20 animate-ping opacity-20" style={{ animationDuration: '2s' }}></div>
              <AlertTriangle className="w-8 h-8 text-white shrink-0 mt-0.5 animate-pulse relative z-10" />
              <div className="relative z-10">
                <h4 className="font-mono font-bold tracking-widest text-lg text-white uppercase">CRITICAL DEPLETION ALERT</h4>
                <p className="text-sm font-sans mt-0.5 text-white/90 font-bold">
                  {resource} levels have fallen critically low (below 25%). Immediate resupply required!
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {criticalIncidents.length > 0 && (
        <div className="flex flex-col gap-3">
          {criticalIncidents.map((incident) => (
            <motion.div 
              key={incident.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="bg-red-600/10 border-l-4 border-red-600 p-4 rounded-r-lg shadow-sm flex items-start gap-4"
            >
              <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5 animate-pulse" />
              <div>
                <h4 className="font-mono font-bold tracking-widest text-sm text-red-600 uppercase">Critical Incident: {incident.type}</h4>
                <p className="text-xs font-sans mt-1 text-text">
                  A critical {incident.type.toLowerCase()} has been reported. Immediate action required.
                </p>
                <div className="text-[10px] text-text-muted mt-2 font-mono">
                  {new Date(incident.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <div className="flex justify-between items-center border-b border-text-muted/10 pb-4 mb-2">
        <h1 className="text-4xl font-serif text-text font-bold tracking-tight px-2 flex items-center gap-4">
          <Activity className="text-accent w-8 h-8" /> Logistics Hub
        </h1>
        <NeuButton variant="primary" onClick={() => setShowBroadcastModal(true)} className="flex items-center gap-2">
          <Radio className="w-4 h-4" /> Broadcast
        </NeuButton>
      </div>

      <NeuCard>
        <h3 className="font-serif text-2xl font-bold text-text flex items-center gap-3 mb-8">
          <CloudUpload className="text-accent w-6 h-6" /> Satellite Failover Sync
        </h3>
        
        <div className="bg-background/50 border border-text-muted/10 h-2 w-full relative mb-4 rounded-full overflow-hidden">
          <motion.div 
            className="absolute top-0 left-0 h-full bg-accent"
            initial={{ width: 0 }}
            animate={{ width: `${syncProgress}%` }}
            transition={{ ease: 'linear' }}
          />
        </div>
        
        <div className="flex justify-between items-center text-xs tracking-widest font-mono uppercase text-text-muted mb-8 font-bold">
          <span>{syncProgress}% Synchronized</span>
          <span>1KB Constraint Mode</span>
        </div>

        <NeuButton 
          active={syncProgress > 0 && syncProgress < 100}
          className="w-full justify-center font-bold disabled:opacity-50"
          onClick={() => setSyncing(true)}
          disabled={syncing}
        >
          {syncProgress === 100 ? (
            <span className="text-accent flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> Complete</span>
          ) : syncing ? (
            'Transmitting Data...'
          ) : (
            'Initiate Satellite Pulse'
          )}
        </NeuButton>
      </NeuCard>

      <NeuCard className="space-y-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-2xl font-bold text-text flex items-center gap-3">
            <MapIcon className="text-accent w-6 h-6" /> Tactical Overview
          </h3>
          <span className="text-[10px] uppercase tracking-widest font-mono font-bold text-text-muted">Interactive Mode</span>
        </div>

        <MapView onItemAction={(id, type) => setActiveSelection(`[${type.toUpperCase()}] ${id}`)} actionLabel="View Details" />

        {/* Detail Panel */}
        {activeSelection && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 bg-background border border-text-muted/20 rounded-lg shadow-sm relative"
          >
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-mono font-bold text-sm text-accent flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Selection Details
              </h4>
              <button onClick={() => setActiveSelection(null)} className="text-text-muted hover:text-text transition-colors">
                ✕
              </button>
            </div>
            <p className="text-sm text-text font-sans tracking-wide leading-relaxed">
              Monitoring active node: <span className="font-bold text-accent">{activeSelection}</span>. 
              <br/>
              Logistics teams are coordinating with ground responders for this location. Ensure supply chains are maintained and route conditions are assessed.
            </p>
          </motion.div>
        )}
      </NeuCard>

      <NeuCard className="space-y-8">
        <div className="flex items-center justify-between mb-4 border-b border-text-muted/10 pb-4">
          <h3 className="font-serif text-2xl font-bold text-text flex items-center gap-3">
            <Package className="text-accent w-6 h-6" /> Resource Levels
          </h3>
          <div className="flex items-center gap-2">
            {dbSyncStatus === 'synced' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold tracking-widest uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3"/> DB Synced
              </span>
            )}
            {dbSyncStatus === 'syncing' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold tracking-widest uppercase bg-accent/10 text-accent border border-accent/20">
                <RefreshCcw className="w-3 h-3 animate-spin"/> Syncing
              </span>
            )}
            {dbSyncStatus === 'error' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono font-bold tracking-widest uppercase bg-red-500/10 text-red-500 border border-red-500/20">
                <AlertTriangle className="w-3 h-3"/> Sync Error
              </span>
            )}
          </div>
        </div>
        
        <div className="space-y-6">
          <ResourceBlock name="Universal Blood (O-)" value={bloodLevel} onChange={(v) => handleResourceChange('bloodLevel', v)} onInspect={() => handleInspectResource("Universal Blood (O-)", bloodLevel)} />
          <ResourceBlock name="Oxygen Tanks" value={oxygenLevel} onChange={(v) => handleResourceChange('oxygenLevel', v)} onInspect={() => handleInspectResource("Oxygen Tanks", oxygenLevel)} />
          <ResourceBlock name="Field Rations" value={rationsLevel} onChange={(v) => handleResourceChange('rationsLevel', v)} onInspect={() => handleInspectResource("Field Rations", rationsLevel)} />
        </div>
      </NeuCard>

      <NeuCard className="space-y-8">
        <div className="flex items-center justify-between mb-4 border-b border-text-muted/10 pb-4">
          <h3 className="font-serif text-2xl font-bold text-text flex items-center gap-3">
            <History className="text-accent w-6 h-6" /> Operation Log
          </h3>
          <span className="text-[10px] font-bold uppercase tracking-widest font-mono text-text-muted cursor-pointer hover:text-text transition-colors">View All</span>
        </div>
        
        <div className="space-y-6 flex flex-col pt-2">
          <div className="flex justify-between items-center">
            <div className="flex gap-4 items-center">
              <div className="text-[10px] font-mono font-bold text-accent">SYNC-04</div>
              <div className="text-sm text-text font-sans">Satellite failover pulse completed. 1KB transfer.</div>
            </div>
            <div className="text-[10px] font-bold text-text-muted font-mono">04m ago</div>
          </div>
          
          <div className="flex justify-between items-center">
            <div className="flex gap-4 items-center">
              <div className="text-[10px] font-mono font-bold text-text-muted">RSRC-12</div>
              <div className="text-sm text-text font-sans">Universal Blood (O-) marked as Critical.</div>
            </div>
            <div className="text-[10px] font-bold text-text-muted font-mono">2h ago</div>
          </div>

          <div className="flex justify-between items-center opacity-50">
            <div className="flex gap-4 items-center">
              <div className="text-[10px] font-mono font-bold text-text-muted">SYNC-03</div>
              <div className="text-sm text-text font-sans">Partial mesh sync. 8 nodes updated.</div>
            </div>
            <div className="text-[10px] font-bold text-text-muted font-mono">Yesterday</div>
          </div>
        </div>
      </NeuCard>

      {/* Critical Alert Toast */}
      {criticalAlert && (
        <motion.div 
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] bg-red-600 text-white px-6 py-4 rounded-lg shadow-[0_10px_40px_rgba(220,38,38,0.5)] flex items-center gap-4 border border-red-400"
        >
          <AlertTriangle className="w-6 h-6 animate-pulse" />
          <div>
            <h4 className="font-mono font-bold tracking-widest text-sm">CRITICAL DEPLETION</h4>
            <p className="text-xs font-sans mt-1">Automatic resupply requested for: {criticalAlert}</p>
          </div>
        </motion.div>
      )}

      {/* Resource Depot Modal */}
      {showDepotModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={() => setShowDepotModal(false)}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md"
          >
            <NeuCard variant="glass" className="border-accent/30">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-serif text-accent flex items-center gap-2 mb-1">
                    <Package className="w-6 h-6" /> HQ-RELAY
                  </h2>
                  <p className="text-xs font-mono font-bold text-text-muted uppercase tracking-widest">Primary Resource Depot</p>
                </div>
                <button onClick={() => setShowDepotModal(false)} className="text-text-muted hover:text-text">✕</button>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between items-center border-b border-text-muted/10 pb-2">
                  <span className="text-sm font-sans font-bold text-text-muted">Universal Blood (O-)</span>
                  <span className="font-mono font-bold text-text">{bloodLevel}%</span>
                </div>
                <div className="flex justify-between items-center border-b border-text-muted/10 pb-2">
                  <span className="text-sm font-sans font-bold text-text-muted">Oxygen Tanks</span>
                  <span className="font-mono font-bold text-text">{oxygenLevel}%</span>
                </div>
                <div className="flex justify-between items-center border-b border-text-muted/10 pb-2">
                  <span className="text-sm font-sans font-bold text-text-muted">Field Rations</span>
                  <span className="font-mono font-bold text-text">{rationsLevel}%</span>
                </div>
              </div>

              <div className="bg-background/80 border border-text-muted/10 p-4 rounded-lg shadow-inner">
                <h3 className="text-xs font-mono font-bold tracking-widest text-accent mb-3 flex items-center gap-2"><PhoneCall className="w-3 h-3"/> CONTACT LOGISTICS</h3>
                <p className="text-sm font-sans font-bold text-text mb-1 flex items-center justify-between">Commander Jane Doe <span className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded">ONLINE</span></p>
                <p className="text-xs font-mono text-text-muted font-bold">Uplink: 144.1 MHz (Encrypted)</p>
              </div>
            </NeuCard>
          </motion.div>
        </div>
      )}

      {/* Resource Detail Modal */}
      {resourceDetail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={() => setResourceDetail(null)}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm"
          >
            <NeuCard variant="glass">
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-xl font-serif font-bold text-text">{resourceDetail.name}</h2>
                <button onClick={() => setResourceDetail(null)} className="text-text-muted hover:text-text">✕</button>
              </div>
              <p className="text-sm text-text-muted mb-6 leading-relaxed">
                Current structural capacity is at <span className="font-bold text-text">{resourceDetail.value}%</span>. Levels are currently nominal and sufficient for ongoing triage operations. Monitor closely over the next operational cycle.
              </p>
              <NeuButton className="w-full font-bold" variant="primary" onClick={() => setResourceDetail(null)}>Acknowledge</NeuButton>
            </NeuCard>
          </motion.div>
        </div>
      )}
      {/* Broadcast Modal */}
      {showBroadcastModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={() => setShowBroadcastModal(false)}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md"
          >
            <NeuCard variant="glass" className="border-red-500/30">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-serif text-red-500 flex items-center gap-2 mb-1">
                    <Radio className="w-6 h-6 animate-pulse" /> Emergency Broadcast
                  </h2>
                  <p className="text-xs font-mono font-bold text-text-muted uppercase tracking-widest">Alert All Personnel</p>
                </div>
                <button onClick={() => setShowBroadcastModal(false)} className="text-text-muted hover:text-text">✕</button>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); handleBroadcast(); }} className="space-y-4 mb-6">
                <div>
                  <label className="text-xs font-bold font-mono text-text-muted uppercase tracking-widest mb-2 block">Incident Type</label>
                  <select 
                    value={broadcastType}
                    onChange={(e) => setBroadcastType(e.target.value)}
                    className="w-full bg-background border border-text-muted/20 text-text p-3 rounded-md outline-none focus:border-red-500"
                    required
                  >
                    <option value="Medical">Medical Emergency</option>
                    <option value="Fire">Fire / Explosion</option>
                    <option value="Structural Collapse">Structural Collapse</option>
                    <option value="Hazardous Material">Hazardous Material</option>
                    <option value="Hostile Threat">Hostile Threat</option>
                    <option value="Evacuation">Evacuation Order</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold font-mono text-text-muted uppercase tracking-widest mb-2 block">Severity Level</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                      {broadcastSeverity === 'Critical' && <AlertTriangle className="w-4 h-4 text-red-500" />}
                      {broadcastSeverity === 'High' && <AlertTriangle className="w-4 h-4 text-orange-500" />}
                      {broadcastSeverity === 'Medium' && <AlertCircle className="w-4 h-4 text-amber-500" />}
                      {broadcastSeverity === 'Low' && <Info className="w-4 h-4 text-blue-500" />}
                    </div>
                    <select 
                      value={broadcastSeverity}
                      onChange={(e) => setBroadcastSeverity(e.target.value as any)}
                      className={`w-full bg-background border text-text p-3 pl-10 rounded-md outline-none transition-colors
                        ${broadcastSeverity === 'Critical' ? 'border-red-500/50 focus:border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)] text-red-500 font-bold' :
                        broadcastSeverity === 'High' ? 'border-orange-500/50 focus:border-orange-500 text-orange-500 font-bold' :
                        broadcastSeverity === 'Medium' ? 'border-amber-500/50 focus:border-amber-500 text-amber-500' :
                        'border-blue-500/50 focus:border-blue-500 text-blue-500'}
                      `}
                      required
                    >
                      <option value="Low" className="text-text">Low (Advisory)</option>
                      <option value="Medium" className="text-text">Medium (Caution)</option>
                      <option value="High" className="text-text">High (Immediate Threat)</option>
                      <option value="Critical" className="text-text">Critical (Catastrophic)</option>
                    </select>
                  </div>
                </div>
                <NeuButton 
                  type="submit"
                  className="w-full font-bold bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white border-red-500/50 mt-4" 
                  disabled={sendingBroadcast}
                >
                  {sendingBroadcast ? 'Transmitting...' : 'Send Broadcast'}
                </NeuButton>
              </form>
            </NeuCard>
          </motion.div>
        </div>
      )}

    </div>
  );
}
