import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { NeuCard } from './NeuCard';
import { Filter, AlertCircle, Building2, ShieldPlus, LocateFixed } from 'lucide-react';
import { motion } from 'motion/react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';

// Fix Leaflet's default icon path issues
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const getResponderIcon = () => {
  const html = `
    <div class="flex items-center justify-center w-8 h-8 rounded-full border-2 border-white bg-blue-500 text-white shadow-lg font-bold text-[10px] tracking-tighter shadow-black/30">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-cross"><path d="M11 2a2 2 0 0 0-2 2v5H4a2 2 0 0 0-2 2v2c0 1.1.9 2 2 2h5v5c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2v-5h5a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-5V4a2 2 0 0 0-2-2h-2z"/></svg>
    </div>
  `;
  return new L.DivIcon({
    html,
    className: 'bg-transparent border-none',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

const getIncidentIcon = (severity: string, type: string, esiScore?: number) => {
  let bgClass = 'bg-blue-500 border-white text-white';
  let pulseClass = '';
  let size = 32;
  let label = severity.charAt(0);

  if (esiScore !== undefined) {
    label = esiScore.toString();
    switch (esiScore) {
      case 1:
        bgClass = 'bg-red-600 border-white text-white scale-110 ring-4 ring-red-600/30';
        pulseClass = 'animate-pulse';
        size = 36;
        break;
      case 2:
        bgClass = 'bg-orange-500 border-white text-white scale-105';
        size = 34;
        break;
      case 3:
        bgClass = 'bg-amber-500 border-white text-white';
        size = 32;
        break;
      case 4:
        bgClass = 'bg-yellow-400 border-white text-black';
        size = 30;
        break;
      case 5:
        bgClass = 'bg-emerald-500 border-white text-white';
        size = 28;
        break;
    }
  } else {
    // Fallback for broadcasts or cases where esiScore is missing
    bgClass = severity === 'Critical' ? 'bg-red-600 border-white text-white scale-110 ring-4 ring-red-600/30 animate-pulse' :
              severity === 'High' ? 'bg-orange-500 border-white text-white' :
              severity === 'Medium' ? 'bg-amber-500 border-white text-white' :
              'bg-blue-500 border-white text-white';
    size = severity === 'Critical' ? 36 : 32;
  }
                   
  const html = `
    <div class="flex items-center justify-center w-full h-full rounded-full border-2 shadow-lg ${bgClass} ${pulseClass} font-bold text-xs tracking-tighter shadow-black/30 transition-all duration-300">
      <div class="flex flex-col items-center leading-none">
        <span class="text-[10px] opacity-70">${type.charAt(0)}</span>
        <span>${label}</span>
      </div>
    </div>
  `;
  return new L.DivIcon({
    html,
    className: 'bg-transparent border-none',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  });
};

const getDepotIcon = (type: string) => {
  const html = `
    <div class="flex items-center justify-center w-8 h-8 rounded-md border-2 border-white bg-blue-600 text-white shadow-lg font-bold text-[10px] uppercase tracking-tighter shadow-black/30">
      ${type.substring(0, 3)}
    </div>
  `;
  return new L.DivIcon({
    html,
    className: 'bg-transparent border-none',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

const getSafeZoneIcon = () => {
  const html = `
    <div class="flex items-center justify-center w-8 h-8 rounded-full border-2 border-white bg-emerald-500 text-white shadow-lg font-bold text-xs uppercase shadow-black/30">
      SZ
    </div>
  `;
  return new L.DivIcon({
    html,
    className: 'bg-transparent border-none',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

// Dummy data for depots and safe zones, since they aren't fully dynamic yet
const INITIAL_DEPOTS = [
  { id: 'd1', pos: [51.508, -0.11], name: 'Central Depot A', type: 'Medical' },
  { id: 'd2', pos: [51.495, -0.08], name: 'Outpost B', type: 'Food' }
];

const INITIAL_SAFEZONES = [
  { id: 's1', pos: [51.515, -0.09], name: 'Shelter Alpha' },
  { id: 's2', pos: [51.49, -0.11], name: 'Medical Tent 1' }
];

export interface MapViewProps {
  onItemAction?: (id: string, itemType: 'incident' | 'broadcast') => void;
  actionLabel?: string;
  className?: string;
}

export function MapView({ onItemAction, actionLabel, className }: MapViewProps = {}) {
  const [showIncidents, setShowIncidents] = useState(true);
  const [showDepots, setShowDepots] = useState(true);
  const [showSafeZones, setShowSafeZones] = useState(true);
  const [showBroadcasts, setShowBroadcasts] = useState(true);
  const [incidentSeverityFilter, setIncidentSeverityFilter] = useState('All');
  const [depotTypeFilter, setDepotTypeFilter] = useState('All');
  
  const [incidents, setIncidents] = useState<any[]>([]);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [responderLocations, setResponderLocations] = useState<Record<string, {lat: number, lng: number}>>({});

  useEffect(() => {
    const q = query(collection(db, 'triage_records'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records: any[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.location) {
          records.push({
            id: doc.id,
            pos: [data.location.lat, data.location.lng],
            type: data.specialty || 'General',
            severity: data.esiScore === 1 ? 'Critical' : data.esiScore === 2 ? 'High' : data.esiScore === 3 ? 'Medium' : 'Low',
            ...data
          });
        }
      });
      setIncidents(records);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'triage_records'));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const qBroadcasts = query(collection(db, 'broadcasts'));
    const unsubscribe = onSnapshot(qBroadcasts, (snapshot) => {
      const records: any[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        // Check if broadcast has valid location coordinates
        if (data.location && typeof data.location === 'object' && typeof data.location.lat === 'number') {
          records.push({
            id: doc.id,
            pos: [data.location.lat, data.location.lng],
            type: data.type || 'Broadcast',
            severity: data.severity || 'Medium',
            ...data
          });
        }
      });
      setBroadcasts(records);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'broadcasts'));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const qResp = query(collection(db, 'responder_locations'));
    const unsubscribe = onSnapshot(qResp, (snapshot) => {
      const currentLocs: Record<string, {lat: number, lng: number}> = {};
      snapshot.forEach(docSnap => {
         const data = docSnap.data();
         if (data.location) {
           currentLocs[docSnap.id] = data.location;
         }
      });
      setResponderLocations(currentLocs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'responder_locations'));
    
    return () => unsubscribe();
  }, []);

  return (
      <div className="flex flex-col gap-4 relative w-full h-[500px] mt-4 rounded-xl overflow-hidden shadow-lg border border-text-muted/20">
      
      {/* Controls */}
      <div className="absolute top-4 right-4 z-[400] flex flex-col gap-3 max-w-[200px] w-full max-h-[460px] overflow-y-auto">
        <div className="flex flex-col gap-2 bg-background/90 backdrop-blur-sm p-3 rounded-xl border border-text-muted/20 shadow-md">
          <label className="flex items-center gap-2 cursor-pointer transition-colors text-sm font-semibold">
            <input type="checkbox" checked={showIncidents} onChange={e => setShowIncidents(e.target.checked)} className="accent-red-500 w-4 h-4"/>
            <AlertCircle className="w-4 h-4 text-red-500" /> Incidents
          </label>
          {showIncidents && (
            <select
              value={incidentSeverityFilter}
              onChange={e => setIncidentSeverityFilter(e.target.value)}
              className="w-full bg-background border border-text-muted/20 text-text p-1.5 text-xs rounded outline-none"
            >
              <option value="All">All Severities</option>
              <option value="Critical">Critical Only</option>
              <option value="High">High Only</option>
              <option value="Medium">Medium Only</option>
              <option value="Low">Low Only</option>
            </select>
          )}
        </div>

        <div className="bg-background/90 backdrop-blur-sm p-3 rounded-xl border border-text-muted/20 shadow-md">
          <label className="flex items-center gap-2 cursor-pointer transition-colors text-sm font-semibold">
            <input type="checkbox" checked={showBroadcasts} onChange={e => setShowBroadcasts(e.target.checked)} className="accent-blue-500 w-4 h-4"/>
            <AlertCircle className="w-4 h-4 text-blue-500" /> Broadcasts
          </label>
        </div>

        <div className="flex flex-col gap-2 bg-background/90 backdrop-blur-sm p-3 rounded-xl border border-text-muted/20 shadow-md">
          <label className="flex items-center gap-2 cursor-pointer transition-colors text-sm font-semibold">
            <input type="checkbox" checked={showDepots} onChange={e => setShowDepots(e.target.checked)} className="accent-blue-500 w-4 h-4"/>
            <Building2 className="w-4 h-4 text-blue-500" /> Depots
          </label>
          {showDepots && (
            <select
              value={depotTypeFilter}
              onChange={e => setDepotTypeFilter(e.target.value)}
              className="w-full bg-background border border-text-muted/20 text-text p-1.5 text-xs rounded outline-none"
            >
              <option value="All">All Types</option>
              <option value="Medical">Medical</option>
              <option value="Food">Food / Water</option>
              <option value="Equipment">Equipment</option>
            </select>
          )}
        </div>

        <div className="bg-background/90 backdrop-blur-sm p-3 rounded-xl border border-text-muted/20 shadow-md">
          <label className="flex items-center gap-2 cursor-pointer transition-colors text-sm font-semibold">
            <input type="checkbox" checked={showSafeZones} onChange={e => setShowSafeZones(e.target.checked)} className="accent-emerald-500 w-4 h-4"/>
            <ShieldPlus className="w-4 h-4 text-emerald-500" /> Safe Zones
          </label>
        </div>
      </div>

      <MapContainer center={[51.505, -0.09]} zoom={13} className="w-full h-full z-0 font-sans" attributionControl={false}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        
        {showIncidents && (
          <MarkerClusterGroup chunkedLoading maxClusterRadius={50}>
            {incidents
              .filter(inc => incidentSeverityFilter === 'All' || inc.severity === incidentSeverityFilter)
              .map((inc) => (
              <Marker key={inc.id} position={inc.pos as [number, number]} icon={getIncidentIcon(inc.severity, inc.type, inc.esiScore)}>
                <Popup>
                  <div className="p-1 min-w-[120px]">
                    <h3 className="font-bold text-red-600 mb-1 flex items-center gap-2"><AlertCircle className="w-4 h-4"/> Incident / Patient</h3>
                    <p className="text-sm m-0"><strong>Type:</strong> {inc.type}</p>
                    <p className="text-sm m-0"><strong>Severity:</strong> {inc.severity}</p>
                    {inc.symptoms && <p className="text-xs m-0 mt-1 line-clamp-2"><strong>Notes:</strong> {inc.symptoms}</p>}
                    {inc.assignedResponderId && (
                      <p className="text-xs text-blue-600 font-bold mt-1">Assigned: {inc.assignedResponderId}</p>
                    )}
                    {inc.eta && (
                      <p className="text-xs text-amber-600 font-bold mt-1">ETA: {inc.eta}</p>
                    )}
                    {onItemAction && (
                      <button 
                        onClick={() => onItemAction(inc.id, 'incident')}
                        className="mt-2 w-full py-1 px-2 text-xs font-bold text-white bg-accent hover:bg-accent/80 rounded transition-colors"
                      >
                        {actionLabel || 'Action'}
                      </button>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        )}

        {showBroadcasts && (
          <MarkerClusterGroup chunkedLoading maxClusterRadius={50}>
            {broadcasts.map((b) => (
              <Marker key={b.id} position={b.pos as [number, number]} icon={getIncidentIcon(b.severity, 'B')}>
                <Popup>
                  <div className="p-1 min-w-[120px]">
                    <h3 className="font-bold text-blue-600 mb-1 flex items-center gap-2"><AlertCircle className="w-4 h-4"/> Broadcast</h3>
                    <p className="text-sm m-0"><strong>Type:</strong> {b.type}</p>
                    <p className="text-sm m-0"><strong>Severity:</strong> {b.severity}</p>
                    {b.message && <p className="text-xs mt-1 text-text-muted bg-text-muted/10 p-1 rounded border overflow-hidden text-ellipsis line-clamp-3">{b.message}</p>}
                    {onItemAction && (
                      <button 
                        onClick={() => onItemAction(b.id, 'broadcast')}
                        className="mt-2 w-full py-1 px-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                      >
                        {actionLabel || 'Details'}
                      </button>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        )}

        {incidents.map((inc) => {
           if ((inc.status !== 'Dispatched' && inc.status !== 'En Route') || !inc.assignedResponderId) return null;
           const loc = responderLocations[inc.assignedResponderId];
           if (!loc) return null;
           
           return (
             <Marker key={`resp-${inc.assignedResponderId}-${inc.id}`} position={[loc.lat, loc.lng]} icon={getResponderIcon()}>
               <Popup>
                 <div className="p-1 min-w-[120px]">
                   <h3 className="font-bold text-blue-600 mb-1 flex items-center gap-2"><LocateFixed className="w-4 h-4"/> Responder</h3>
                   <p className="text-sm m-0"><strong>ID:</strong> {inc.assignedResponderId}</p>
                   {inc.eta && <p className="text-sm m-0 text-amber-600 font-bold"><strong>ETA:</strong> {inc.eta}</p>}
                   <p className="text-xs text-text-muted mt-1">En route to incident</p>
                 </div>
               </Popup>
             </Marker>
           );
        })}

        {showDepots && INITIAL_DEPOTS
          .filter(dep => depotTypeFilter === 'All' || dep.type === depotTypeFilter)
          .map((dep) => (
          <Marker key={dep.id} position={dep.pos as [number, number]} icon={getDepotIcon(dep.type)}>
            <Popup>
              <div className="p-1 min-w-[120px]">
                <h3 className="font-bold text-blue-600 mb-1 flex items-center gap-2"><Building2 className="w-4 h-4"/> Supply Depot</h3>
                <p className="text-sm m-0"><strong>Name:</strong> {dep.name}</p>
                <p className="text-sm m-0"><strong>Type:</strong> {dep.type}</p>
              </div>
            </Popup>
          </Marker>
        ))}

        {showSafeZones && INITIAL_SAFEZONES.map((sz) => (
          <Marker key={sz.id} position={sz.pos as [number, number]} icon={getSafeZoneIcon()}>
            <Popup>
              <div className="p-1 min-w-[120px]">
                <h3 className="font-bold text-emerald-600 mb-1 flex items-center gap-2"><ShieldPlus className="w-4 h-4"/> Safe Zone</h3>
                <p className="text-sm m-0"><strong>Name:</strong> {sz.name}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
