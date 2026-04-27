import React, { useState, useEffect } from 'react';
import { NeuCard } from './NeuCard';
import { ShieldAlert, Users, Activity, Settings, Database, ServerCrash, AlertTriangle, AlertCircle, Info, Send, CheckCircle2, Megaphone, Plus, Save } from 'lucide-react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { NeuButton } from './NeuButton';
import { MapView } from './MapView';

const DEFAULT_TEMPLATES = [
  { id: 'evac', name: 'Evacuation Warning', type: 'Evacuation', severity: 'Critical', defaultMessage: 'Please evacuate the area immediately. Use designated safe routes.' },
  { id: 'shelter', name: 'Shelter Open', type: 'Shelter', severity: 'Low', defaultMessage: 'A new emergency shelter has been opened. Food and water are available.' },
  { id: 'medical', name: 'Medical Help Needed', type: 'Medical', severity: 'High', defaultMessage: 'Medical professionals are required at the central triage location.' },
  { id: 'supplies', name: 'Supplies Distribution', type: 'Supplies', severity: 'Medium', defaultMessage: 'Emergency supplies are being distributed at the main depot.' },
] as const;

export function AdminView() {
  const [criticalIncidentsCount, setCriticalIncidentsCount] = useState(0);
  const [activeIncidents, setActiveIncidents] = useState<any[]>([]);
  const [activeBroadcasts, setActiveBroadcasts] = useState<any[]>([]);
  const [dbStatus, setDbStatus] = useState<'online' | 'offline'>('online');
  const [totalUsersCount, setTotalUsersCount] = useState(0);

  // Broadcast Composer States
  const [customTemplates, setCustomTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('evac');
  const [bType, setBType] = useState<string>('Evacuation');
  const [bSeverity, setBSeverity] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Critical');
  const [bMessage, setBMessage] = useState<string>('Please evacuate the area immediately. Use designated safe routes.');
  const [isConfirming, setIsConfirming] = useState(false);
  const [hasExplicitlyConfirmed, setHasExplicitlyConfirmed] = useState(false);
  const [isConfirmingClearAll, setIsConfirmingClearAll] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  
  // Monitoring States
  const [monitoringAlertId, setMonitoringAlertId] = useState<string | null>(null);

  // System Config States
  const [triageStrictness, setTriageStrictness] = useState<'Lenient' | 'Standard' | 'Strict'>('Standard');
  const [autoDispatch, setAutoDispatch] = useState<boolean>(true);
  const [savingConfig, setSavingConfig] = useState<string | null>(null);

  // Assigment States
  const [assigningResponderFor, setAssigningResponderFor] = useState<string | null>(null);
  const [responderIdInput, setResponderIdInput] = useState('');

  useEffect(() => {
    // Load custom templates
    const saved = localStorage.getItem('customBroadcastTemplates');
    if (saved) {
      try {
        setCustomTemplates(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load custom templates', e);
      }
    }

    // Listen to users count
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setTotalUsersCount(snapshot.size);
    }, (error) => {
      console.error(error);
      setDbStatus('offline');
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    // Listen to critical incidents
    const qIncidents = query(collection(db, 'triage_records'), where('esiScore', '<=', 2));
    const unsubIncidents = onSnapshot(qIncidents, (snapshot) => {
      setCriticalIncidentsCount(snapshot.size);
      const incidents: any[] = [];
      snapshot.forEach(doc => {
        incidents.push({ id: doc.id, ...doc.data() });
      });
      setActiveIncidents(incidents);
    }, (error) => {
      console.error(error);
      setDbStatus('offline');
      handleFirestoreError(error, OperationType.LIST, 'triage_records');
    });

    // Listen to active broadcasts
    const qBroadcasts = query(collection(db, 'broadcasts'), orderBy('timestamp', 'desc'));
    const unsubBroadcasts = onSnapshot(qBroadcasts, (snapshot) => {
      const broadcasts: any[] = [];
      snapshot.forEach(doc => {
        broadcasts.push({ id: doc.id, ...doc.data() });
      });
      setActiveBroadcasts(broadcasts.slice(0, 5)); // Keep latest 5
    }, (error) => {
      console.error(error);
      setDbStatus('offline');
      handleFirestoreError(error, OperationType.LIST, 'broadcasts');
    });

    // Listen to system config
    const unsubConfig = onSnapshot(doc(db, 'resources', 'system_config'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.triageStrictness) setTriageStrictness(data.triageStrictness);
        if (data.autoDispatch !== undefined) setAutoDispatch(data.autoDispatch);
      }
    });

    return () => {
      unsubUsers();
      unsubIncidents();
      unsubBroadcasts();
      unsubConfig();
    };
  }, []);

  const allTemplates = [...DEFAULT_TEMPLATES, ...customTemplates, { id: 'custom_new', name: 'Custom Broadcast...', type: 'Custom', severity: 'Medium', defaultMessage: '' }];

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    if (templateId === 'custom_new') {
      setBType('Custom');
      setBSeverity('Medium');
      setBMessage('');
    } else {
      const tmpl = allTemplates.find(t => t.id === templateId);
      if (tmpl) {
        setBType(tmpl.type);
        setBSeverity(tmpl.severity as 'Low' | 'Medium' | 'High' | 'Critical');
        setBMessage(tmpl.defaultMessage || '');
      }
    }
  };

  const saveCustomTemplate = () => {
    if (!newTemplateName.trim()) return;
    const newTmpl = {
      id: `tmpl_${Date.now()}`,
      name: newTemplateName,
      type: bType,
      severity: bSeverity,
      defaultMessage: bMessage
    };
    const updated = [...customTemplates, newTmpl];
    setCustomTemplates(updated);
    localStorage.setItem('customBroadcastTemplates', JSON.stringify(updated));
    setIsSavingTemplate(false);
    setNewTemplateName('');
    setSelectedTemplate(newTmpl.id);
  };

  const handleSendBroadcast = async () => {
    if (!bType) return;
    setIsSending(true);
    try {
      const id = `bdc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      await setDoc(doc(collection(db, 'broadcasts'), id), {
        type: bType,
        severity: bSeverity,
        message: bMessage,
        timestamp: Date.now(),
        senderId: auth.currentUser?.uid || 'Admin'
      });
      setIsConfirming(false);
      setHasExplicitlyConfirmed(false);
      // Reset to default
      handleTemplateChange('evac');
    } catch (err) {
      console.error(err);
      alert('Failed to send broadcast.');
      handleFirestoreError(err, OperationType.WRITE, 'broadcasts');
    } finally {
      setIsSending(false);
    }
  };

  const handleStrictnessChange = async (level: 'Lenient' | 'Standard' | 'Strict') => {
    setTriageStrictness(level);
    setSavingConfig('strictness');
    try {
      await setDoc(doc(db, 'resources', 'system_config'), { triageStrictness: level }, { merge: true });
      setTimeout(() => setSavingConfig(null), 1000);
    } catch (err) {
      console.error(err);
      setSavingConfig(null);
      handleFirestoreError(err, OperationType.WRITE, 'resources/system_config');
    }
  };

  const handleClearAlert = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'broadcasts', id));
      if (monitoringAlertId === id) setMonitoringAlertId(null);
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.DELETE, `broadcasts/${id}`);
    }
  };

  const handleClearIncident = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'triage_records', id));
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.DELETE, `triage_records/${id}`);
    }
  };

  const handleClearAllAlerts = async () => {
    try {
      for (const alert of activeBroadcasts) {
        await deleteDoc(doc(db, 'broadcasts', alert.id));
      }
      setMonitoringAlertId(null);
      setIsConfirmingClearAll(false);
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.DELETE, 'broadcasts');
    }
  };

  const handleAssignResponderInit = (incidentId: string) => {
    setAssigningResponderFor(incidentId);
    setResponderIdInput('');
  };

  const handleAssignResponderSubmit = async (incidentId: string) => {
    if (!responderIdInput.trim()) return;
    try {
      await setDoc(doc(db, 'triage_records', incidentId), { assignedResponderId: responderIdInput.trim() }, { merge: true });
      setAssigningResponderFor(null);
      setResponderIdInput('');
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, `triage_records/${incidentId}`);
    }
  };

  const toggleAutoDispatch = async () => {
    const newVal = !autoDispatch;
    setAutoDispatch(newVal);
    setSavingConfig('autodispatch');
    try {
      await setDoc(doc(db, 'resources', 'system_config'), { autoDispatch: newVal }, { merge: true });
      setTimeout(() => setSavingConfig(null), 1000);
    } catch (err) {
      console.error(err);
      setSavingConfig(null);
      handleFirestoreError(err, OperationType.WRITE, 'resources/system_config');
    }
  };

  return (
    <div className="space-y-6">
      <header className="mb-8">
        <h2 className="text-2xl font-serif text-accent flex items-center gap-3">
          <ShieldAlert className="w-6 h-6" />
          Global Command Center
        </h2>
        <p className="text-text-muted mt-2 text-sm">System administration and global crisis monitoring overview.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <NeuCard className="p-6 text-center">
          <Users className="w-8 h-8 text-accent mx-auto mb-2 opacity-80" />
          <h3 className="text-3xl font-bold text-text">{totalUsersCount}</h3>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider mt-1">Total Users</p>
        </NeuCard>
        <NeuCard className="p-6 text-center">
          <Activity className="w-8 h-8 text-red-500 mx-auto mb-2 opacity-80" />
          <h3 className="text-3xl font-bold text-text">{criticalIncidentsCount}</h3>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider mt-1">Critical Incidents</p>
        </NeuCard>
        <NeuCard className="p-6 text-center">
          {dbStatus === 'online' ? (
            <Database className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
          ) : (
            <ServerCrash className="w-8 h-8 text-red-500 mx-auto mb-2 opacity-80 animate-pulse" />
          )}
          <h3 className={`text-3xl font-bold ${dbStatus === 'online' ? 'text-text' : 'text-red-500'}`}>
            {dbStatus === 'online' ? '99.9%' : 'OFFLINE'}
          </h3>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider mt-1">System Status</p>
        </NeuCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <NeuCard className="p-6">
          <h3 className="text-lg font-bold text-text mb-4 border-b border-text-muted/20 pb-2 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-accent" />
              Send Emergency Broadcast
            </span>
            {!isConfirming && selectedTemplate === 'custom_new' && !isSavingTemplate && (
              <button 
                onClick={() => setIsSavingTemplate(true)}
                className="text-xs flex items-center gap-1 text-accent hover:text-accent/80 transition-colors"
              >
                <Save className="w-4 h-4" /> Save as Template
              </button>
            )}
          </h3>
          
          <div className="space-y-4">
            {!isConfirming ? (
              <>
                {isSavingTemplate && (
                  <div className="p-3 bg-accent/10 border border-accent/20 rounded-md mb-4 flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Template Name..." 
                      value={newTemplateName}
                      onChange={e => setNewTemplateName(e.target.value)}
                      className="flex-1 bg-background border border-text-muted/20 text-text p-2 text-sm rounded outline-none focus:border-accent"
                    />
                    <NeuButton onClick={saveCustomTemplate} disabled={!newTemplateName.trim()} className="px-4 py-2">Save</NeuButton>
                    <NeuButton variant="glass" onClick={() => setIsSavingTemplate(false)} className="px-3 py-2">Cancel</NeuButton>
                  </div>
                )}
                <div>
                  <label className="text-xs font-bold font-mono text-text-muted uppercase tracking-widest mb-2 block">Template</label>
                  <select 
                    value={selectedTemplate}
                    onChange={(e) => handleTemplateChange(e.target.value)}
                    className="w-full bg-background border border-text-muted/20 text-text p-3 rounded-md outline-none focus:border-accent"
                  >
                    {allTemplates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold font-mono text-text-muted uppercase tracking-widest mb-2 block">Type / Category</label>
                    <input 
                      type="text"
                      value={bType}
                      onChange={(e) => setBType(e.target.value)}
                      className="w-full bg-background border border-text-muted/20 text-text p-3 rounded-md outline-none focus:border-accent"
                      placeholder="e.g. Medical"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold font-mono text-text-muted uppercase tracking-widest mb-2 block">Severity</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                        {bSeverity === 'Critical' && <AlertTriangle className="w-4 h-4 text-red-500" />}
                        {bSeverity === 'High' && <AlertTriangle className="w-4 h-4 text-orange-500" />}
                        {bSeverity === 'Medium' && <AlertCircle className="w-4 h-4 text-amber-500" />}
                        {bSeverity === 'Low' && <Info className="w-4 h-4 text-blue-500" />}
                      </div>
                      <select 
                        value={bSeverity}
                        onChange={(e) => setBSeverity(e.target.value as any)}
                        className={`w-full bg-background border text-text p-3 pl-10 rounded-md outline-none transition-colors
                          ${bSeverity === 'Critical' ? 'border-red-500/50 focus:border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)] text-red-500 font-bold' :
                          bSeverity === 'High' ? 'border-orange-500/50 focus:border-orange-500 text-orange-500 font-bold' :
                          bSeverity === 'Medium' ? 'border-amber-500/50 focus:border-amber-500 text-amber-500' :
                          'border-blue-500/50 focus:border-blue-500 text-blue-500'}
                        `}
                      >
                        <option value="Low" className="text-text">Low (Advisory)</option>
                        <option value="Medium" className="text-text">Medium (Caution)</option>
                        <option value="High" className="text-text">High (Immediate Threat)</option>
                        <option value="Critical" className="text-text">Critical (Catastrophic)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold font-mono text-text-muted uppercase tracking-widest mb-2 block">Message / Instructions</label>
                  <textarea 
                    value={bMessage}
                    onChange={(e) => setBMessage(e.target.value)}
                    className="w-full bg-background border border-text-muted/20 text-text p-3 rounded-md outline-none focus:border-accent resize-none h-24"
                    placeholder="Enter specific instructions or details..."
                  ></textarea>
                </div>

                <NeuButton 
                  onClick={() => setIsConfirming(true)}
                  className="w-full mt-4 flex items-center justify-center gap-2"
                  disabled={!bMessage.trim() || !bType.trim()}
                >
                  <Send className="w-5 h-5" />
                  Review Broadcast
                </NeuButton>
              </>
            ) : (
              <div className="p-4 border border-red-500/50 bg-red-500/5 rounded-lg space-y-4">
                <div className="flex items-center gap-3 text-red-500">
                  <AlertTriangle className="w-6 h-6 animate-pulse" />
                  <h4 className="font-bold">Confirm Broadcast Dispatch</h4>
                </div>
                <p className="text-sm text-text-muted">
                  You are about to dispatch a global emergency broadcast. This will interrupt regular operations for active users.
                </p>
                <div className="bg-background p-3 rounded border border-text-muted/10 text-sm space-y-2">
                  <p><strong>Type:</strong> {bType}</p>
                  <p><strong>Severity:</strong> <span className={bSeverity === 'Critical' ? 'text-red-500 font-bold' : ''}>{bSeverity}</span></p>
                  <div>
                    <strong>Message:</strong>
                    <p className="text-text-muted mt-1 bg-text-muted/5 p-2 rounded">{bMessage}</p>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer mt-2 select-none group">
                  <input 
                    type="checkbox" 
                    checked={hasExplicitlyConfirmed} 
                    onChange={(e) => setHasExplicitlyConfirmed(e.target.checked)}
                    className="w-4 h-4 rounded border-text-muted text-red-500 focus:ring-red-500" 
                  />
                  <span className="text-sm text-text-muted font-medium group-hover:text-text transition-colors">
                    I explicitly confirm the dispatch of this emergency broadcast
                  </span>
                </label>
                <div className="flex gap-3 pt-2">
                  <NeuButton 
                    onClick={() => { setIsConfirming(false); setHasExplicitlyConfirmed(false); }} 
                    className="flex-1"
                    variant="glass"
                  >
                    Cancel
                  </NeuButton>
                  <NeuButton 
                    onClick={handleSendBroadcast} 
                    className="flex-1 bg-red-500/10 text-red-500 hover:bg-red-500/20"
                    disabled={isSending || !hasExplicitlyConfirmed}
                  >
                    {isSending ? 'Dispatching...' : 'Dispatch Now'}
                  </NeuButton>
                </div>
              </div>
            )}
          </div>
        </NeuCard>

        <div className="space-y-6">
          <NeuCard className="p-6">
            <div className="flex items-center justify-between border-b border-text-muted/20 pb-2 mb-4">
              <h3 className="text-lg font-bold text-text">Active Broadcasts & Critical Incidents</h3>
              {activeBroadcasts.length > 0 && (
                isConfirmingClearAll ? (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-red-500">Are you sure?</span>
                    <button 
                      onClick={handleClearAllAlerts}
                      className="text-xs px-2 py-1 bg-red-500/20 text-red-500 font-bold border border-red-500/30 rounded hover:bg-red-500/30 transition-colors"
                    >
                      Yes, Clear All
                    </button>
                    <button 
                      onClick={() => setIsConfirmingClearAll(false)}
                      className="text-xs px-2 py-1 text-text-muted hover:text-text transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setIsConfirmingClearAll(true)}
                    className="text-xs px-3 py-1 bg-red-500/10 border border-red-500/20 text-red-500 rounded font-bold hover:bg-red-500/20 transition-colors"
                  >
                    Clear All Broadcasts
                  </button>
                )
              )}
            </div>
            <div className="space-y-3">
              {activeBroadcasts.length === 0 && activeIncidents.length === 0 ? (
                <p className="text-sm text-text-muted italic">No active broadcasts or incidents.</p>
              ) : (
                <>
                {activeBroadcasts.map(broadcast => {
                  const isMonitoring = monitoringAlertId === broadcast.id;
                  return (
                    <div key={broadcast.id} className={`flex flex-col gap-2 p-3 rounded-lg border transition-all ${
                      isMonitoring ? 'bg-background shadow-md border-accent/50' : 'bg-surface border-border'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${isMonitoring ? 'animate-pulse' : ''} ${
                            broadcast.severity === 'Critical' ? 'bg-red-500' :
                            broadcast.severity === 'High' ? 'bg-orange-500' :
                            broadcast.severity === 'Medium' ? 'bg-amber-500' : 'bg-blue-500'
                          }`}></div>
                          <div>
                            <p className="text-sm font-bold text-text">{broadcast.type} Alert (Broadcast)</p>
                            <p className="text-xs text-text-muted">Reported {new Date(broadcast.timestamp).toLocaleTimeString()}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => setMonitoringAlertId(isMonitoring ? null : broadcast.id)}
                            className={`text-xs font-bold px-3 py-1 rounded border transition-colors ${
                              isMonitoring 
                                ? 'bg-accent text-white border-accent' 
                                : broadcast.severity === 'Critical' ? 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20' :
                                  broadcast.severity === 'High' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20 hover:bg-orange-500/20' :
                                  broadcast.severity === 'Medium' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20' : 
                                  'bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20'
                          }`}>
                            {isMonitoring ? 'Monitoring...' : 'Monitor'}
                          </button>
                          <button 
                            onClick={(e) => handleClearAlert(broadcast.id, e)}
                            className="text-text-muted hover:text-red-500 transition-colors p-1"
                            title="Clear Alert"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                          </button>
                        </div>
                      </div>
                      
                      {isMonitoring && broadcast.message && (
                        <div className="mt-2 text-sm text-text bg-background border border-border p-3 rounded-md">
                          <p className="font-bold text-xs uppercase tracking-wider text-text-muted mb-1">Broadcast Content</p>
                          <p>{broadcast.message}</p>
                          <div className="mt-3 flex gap-4 text-xs font-medium text-text-muted">
                            <span className="flex items-center gap-1"><Activity className="w-3 h-3"/> Active global event</span>
                            <span className="flex items-center gap-1"><Users className="w-3 h-3"/> Reached {totalUsersCount} devices</span>
                          </div>
                        </div>
                      )}
                      
                      {!isMonitoring && broadcast.message && (
                        <p className="text-xs text-text-muted ml-5 border-l-2 border-border pl-2 line-clamp-1">{broadcast.message}</p>
                      )}
                    </div>
                  );
                })}

                {activeIncidents.map(incident => (
                  <div key={incident.id} className="flex flex-col gap-2 p-3 rounded-lg border bg-surface border-border transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-red-500"></div>
                        <div>
                          <p className="text-sm font-bold text-text">Critical Triage: {incident.specialty}</p>
                          <p className="text-xs text-text-muted">Reported {new Date(incident.timestamp).toLocaleTimeString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {incident.assignedResponderId ? (
                          <span className="text-xs font-bold px-3 py-1 rounded border bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                            Assigned: {incident.assignedResponderId}
                          </span>
                        ) : (
                          assigningResponderFor === incident.id ? (
                            <div className="flex items-center gap-2">
                              <input 
                                type="text"
                                value={responderIdInput}
                                onChange={(e) => setResponderIdInput(e.target.value)}
                                placeholder="Responder ID..."
                                className="text-xs p-1 rounded bg-background border border-text-muted/20 text-text outline-none focus:border-accent w-24"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleAssignResponderSubmit(incident.id);
                                  if (e.key === 'Escape') setAssigningResponderFor(null);
                                }}
                              />
                              <button 
                                onClick={() => handleAssignResponderSubmit(incident.id)}
                                className="text-xs font-bold px-2 py-1 rounded bg-accent text-white hover:bg-accent/80 transition-colors"
                              >
                                Save
                              </button>
                              <button 
                                onClick={() => setAssigningResponderFor(null)}
                                className="text-xs font-bold px-2 py-1 rounded text-text-muted hover:text-text transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => handleAssignResponderInit(incident.id)}
                              className="text-xs font-bold px-3 py-1 rounded border bg-accent/10 text-accent border-accent/20 hover:bg-accent/20 transition-colors"
                            >
                              Assign Responder
                            </button>
                          )
                        )}
                        <button 
                          onClick={(e) => handleClearIncident(incident.id, e)}
                          className="text-text-muted hover:text-red-500 transition-colors p-1"
                          title="Clear Incident"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                      </div>
                    </div>
                    {incident.symptoms && (
                      <p className="text-xs text-text-muted ml-5 border-l-2 border-border pl-2 line-clamp-1">{incident.symptoms}</p>
                    )}
                  </div>
                ))}
                </>
              )}
            </div>
          </NeuCard>

          <NeuCard className="p-6">
            <h3 className="text-lg font-bold text-text mb-4 flex items-center justify-between border-b border-text-muted/20 pb-2">
              <span className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-text-muted" />
                System Configuration
              </span>
              {savingConfig && <span className="text-xs text-emerald-500 font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Saved</span>}
            </h3>
            <div className="space-y-6">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-text">AI Triage Strictness</p>
                    <p className="text-xs text-text-muted">Adjust Edge AI evaluation threshold</p>
                  </div>
                  <span className="text-sm font-bold text-accent">{triageStrictness}</span>
                </div>
                <div className="px-2 mt-2">
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="1"
                    value={triageStrictness === 'Lenient' ? 1 : triageStrictness === 'Standard' ? 2 : 3}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      handleStrictnessChange(val === 1 ? 'Lenient' : val === 2 ? 'Standard' : 'Strict');
                    }}
                    className="w-full h-2 rounded-lg cursor-pointer accent-accent"
                  />
                  <div className="flex justify-between text-[10px] uppercase tracking-wider text-text-muted mt-2 font-bold px-1 select-none">
                    <span onClick={() => handleStrictnessChange('Lenient')} className={`cursor-pointer ${triageStrictness === 'Lenient' ? 'text-accent' : 'hover:text-text'}`}>Lenient</span>
                    <span onClick={() => handleStrictnessChange('Standard')} className={`cursor-pointer ${triageStrictness === 'Standard' ? 'text-accent' : 'hover:text-text'}`}>Standard</span>
                    <span onClick={() => handleStrictnessChange('Strict')} className={`cursor-pointer ${triageStrictness === 'Strict' ? 'text-accent' : 'hover:text-text'}`}>Strict</span>
                  </div>
                </div>
              </div>
              <div 
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-background transition-colors hover:bg-surface cursor-pointer group" 
                onClick={toggleAutoDispatch}
              >
                <div>
                  <p className="text-sm font-bold text-text group-hover:text-accent transition-colors">Auto-Dispatch Drones</p>
                  <p className="text-xs text-text-muted">Automatically send recon based on ESI &lt; 2</p>
                </div>
                <div 
                  className={`w-14 h-7 flex items-center rounded-full relative transition-colors duration-300 p-1 cursor-pointer ring-2 ${autoDispatch ? 'bg-accent ring-accent/30' : 'bg-surface/50 ring-border'}`}>
                  <div 
                    className={`w-5 h-5 rounded-full shadow-md transition-all duration-300 transform ${autoDispatch ? 'bg-background translate-x-7' : 'bg-text-muted/50 translate-x-0'}`}
                  />
                </div>
              </div>
            </div>
          </NeuCard>
        </div>
      </div>

      <NeuCard className="p-6 mt-6">
        <h3 className="text-lg font-bold text-text mb-4 flex items-center gap-2 border-b border-text-muted/20 pb-2">
          <Activity className="w-5 h-5 text-accent" />
          Tactical Action Map
        </h3>
        <MapView 
          onItemAction={(id, type) => {
            if (type === 'incident') {
              handleAssignResponderInit(id);
              window.scrollTo({ top: 300, behavior: 'smooth' });
            } else {
              // Scroll to broadcasts list to manage it
               window.scrollTo({ top: 300, behavior: 'smooth' });
            }
          }} 
          actionLabel="Dispatch"
        />
      </NeuCard>
    </div>
  );
}

