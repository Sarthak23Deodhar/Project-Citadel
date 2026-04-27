import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, MapPin, CheckCircle2, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Haversine distance in meters
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180; // φ, λ in radians
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // in metres
}

// Fix Leaflet's default icon path issues
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const patientIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

const responderIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

interface GPSTrackerProps {
  patientLocation: { lat: number; lng: number };
  responderId?: string;
  showRoute?: boolean;
}

function AutoBounds({ patientPos, responderPos }: { patientPos: [number, number]; responderPos: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds([patientPos, responderPos]);
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [map, patientPos, responderPos]);
  return null;
}

export function GPSTracker({ patientLocation, responderId, showRoute }: GPSTrackerProps) {
  const [responderLocation, setResponderLocation] = useState<{lat: number, lng: number} | null>(null);
  const [arrived, setArrived] = useState(false);
  const [routePath, setRoutePath] = useState<[number, number][]>([]);
  const responderRef = useRef(responderLocation);
  
  const GEOFENCE_RADIUS_METERS = 1000; // 1km geofence
  const [isInGeofence, setIsInGeofence] = useState(false);
  const [geofenceAlert, setGeofenceAlert] = useState<{type: 'enter'|'exit', message: string, id: number} | null>(null);

  useEffect(() => {
    responderRef.current = responderLocation;
    
    if (responderLocation) {
      const distMeters = getDistance(patientLocation.lat, patientLocation.lng, responderLocation.lat, responderLocation.lng);
      const currentlyInGeofence = distMeters <= GEOFENCE_RADIUS_METERS;
      
      if (currentlyInGeofence && !isInGeofence) {
        setIsInGeofence(true);
        setGeofenceAlert({type: 'enter', message: 'Responder entered incident geofence.', id: Date.now()});
      } else if (!currentlyInGeofence && isInGeofence) {
        setIsInGeofence(false);
        setGeofenceAlert({type: 'exit', message: 'Responder exited incident geofence.', id: Date.now()});
      }
    }
  }, [responderLocation, patientLocation, isInGeofence]);

  useEffect(() => {
    if (geofenceAlert) {
      const timer = setTimeout(() => {
        setGeofenceAlert(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [geofenceAlert]);

  const routePathRef = useRef<[number, number][]>([]);
  useEffect(() => {
    routePathRef.current = routePath;
  }, [routePath]);

  useEffect(() => {
    if (!responderId) return;

    // Listen to real Responder location from Firestore
    // Using import('@/src/lib/firebase') to avoid circular deps if any
    let unsubscribe = () => {};
    
    import('@/src/lib/firebase').then(({ db }) => {
      import('firebase/firestore').then(({ doc, onSnapshot }) => {
        unsubscribe = onSnapshot(doc(db, 'responder_locations', responderId), (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.location) {
              setResponderLocation(data.location);
              
              const distToPatient = Math.sqrt(
                (patientLocation.lat - data.location.lat) ** 2 + 
                (patientLocation.lng - data.location.lng) ** 2
              );
              
              if (distToPatient < 0.0005) {
                setArrived(true);
              } else {
                setArrived(false);
              }
            }
          }
        }, (err) => console.error("Error fetching responder location", err));
      });
    });

    return () => unsubscribe();
  }, [responderId, patientLocation]);

  useEffect(() => {
    if (showRoute && !arrived && responderLocation) {
      const fetchRoute = async () => {
        if (!navigator.onLine) return; // Skip fetching if offline
        try {
          const loc = responderRef.current;
          if (!loc) return;
          const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${loc.lng},${loc.lat};${patientLocation.lng},${patientLocation.lat}?overview=full&geometries=geojson`);
          const data = await res.json();
          if (data.routes && data.routes[0]) {
             const coordinates = data.routes[0].geometry.coordinates.map((coord: number[]) => [coord[1], coord[0]]);
             setRoutePath(coordinates);
          }
        } catch (e) {
          console.error("Failed to fetch route:", e);
        }
      };
      
      fetchRoute();
      const iv = setInterval(fetchRoute, 5000);
      return () => clearInterval(iv);
    } else {
      setRoutePath([]);
    }
  }, [showRoute, patientLocation, arrived, responderLocation]);

  return (
    <div className="w-full h-[400px] mt-4 rounded-xl overflow-hidden shadow-lg border border-text-muted/20 relative">
      <AnimatePresence>
        {geofenceAlert && (
          <motion.div 
            key={geofenceAlert.id}
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            className={`absolute top-16 left-1/2 -translate-x-1/2 z-[400] px-4 py-2 font-bold rounded-lg shadow-lg flex items-center gap-2 ${
              geofenceAlert.type === 'enter' ? 'bg-amber-500 text-white' : 'bg-slate-700 text-white'
            }`}
          >
            <ShieldAlert className="w-5 h-5" />
            {geofenceAlert.message}
          </motion.div>
        )}
      </AnimatePresence>

      {arrived && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[400] bg-emerald-500 text-white px-4 py-2 font-bold rounded-full shadow-lg flex items-center gap-2"
        >
          <CheckCircle2 className="w-5 h-5" />
          Responder Arrived
        </motion.div>
      )}
      <MapContainer 
        center={[patientLocation.lat, patientLocation.lng]} 
        zoom={13} 
        className="w-full h-full z-0 font-sans" 
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        {responderLocation && (
          <AutoBounds 
            patientPos={[patientLocation.lat, patientLocation.lng]} 
            responderPos={[responderLocation.lat, responderLocation.lng]} 
          />
        )}
        
        {/* Geofence display */}
        <Circle 
          center={[patientLocation.lat, patientLocation.lng]} 
          radius={GEOFENCE_RADIUS_METERS} 
          pathOptions={{ fillColor: '#fbbf24', fillOpacity: 0.1, color: '#fbbf24', weight: 2, dashArray: '5, 5' }} 
        />

        {showRoute && routePath.length > 0 && (
          <Polyline positions={routePath} color="#3b82f6" weight={5} opacity={0.7} />
        )}

        <Marker position={[patientLocation.lat, patientLocation.lng]} icon={patientIcon}>
          <Popup>
            <div className="font-bold text-red-600 flex items-center gap-1">
              <MapPin className="w-4 h-4"/> Patient Location
            </div>
          </Popup>
        </Marker>

        {responderLocation && (
          <Marker position={[responderLocation.lat, responderLocation.lng]} icon={responderIcon}>
            <Popup>
              <div className="font-bold text-blue-600 flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  <LocateFixed className="w-4 h-4"/> Medical Responder
                </div>
                {responderId && <div className="text-xs text-text-muted mt-1">ID: {responderId}</div>}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
