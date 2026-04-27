import React, { useState, useEffect } from 'react';
import { AppRole, PatientRecord, EmergencyBroadcast } from '@/src/types';
import { CitizenView } from '@/src/components/CitizenView';
import { DoctorView } from '@/src/components/DoctorView';
import { NGOView } from '@/src/components/NGOView';
import { AuthView } from '@/src/components/AuthView';
import { ProfileView } from '@/src/components/ProfileView';
import { AdminView } from '@/src/components/AdminView';
import { SupportChatbot } from '@/src/components/SupportChatbot';
import { auth, db } from '@/src/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, orderBy, limit, onSnapshot, arrayUnion, arrayRemove } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/src/lib/firestoreErrors';
import { Sun, Moon, UserCircle, ShieldAlert, AlertTriangle, X } from 'lucide-react';
import { NeuButton } from './components/NeuButton';
import { motion, AnimatePresence } from 'motion/react';

// Distance calculation using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;  // deg2rad below
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; // Distance in km
  return d;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [userRole, setUserRole] = useState<AppRole>('Citizen');
  const [currentView, setCurrentView] = useState<AppRole | 'Profile'>('Citizen');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeBroadcast, setActiveBroadcast] = useState<EmergencyBroadcast | null>(null);
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const getBroadcastProximity = (broadcast: EmergencyBroadcast) => {
    if (!userLocation || !broadcast.location || typeof broadcast.location === 'string') {
      return false; // Cannot determine proximity
    }
    const dist = calculateDistance(
      userLocation.lat, userLocation.lng,
      (broadcast.location as any).lat, (broadcast.location as any).lng
    );
    return dist < 5; // Nearby if less than 5km
  };

  useEffect(() => {
    if (navigator.geolocation && user) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(newLoc);
          
          if (userRole === 'Doctor' || userRole === 'NGO' || userRole === 'Admin') {
            setDoc(doc(db, 'responder_locations', user.uid), {
              location: newLoc,
              role: userRole,
              timestamp: Date.now()
            }, { merge: true }).catch(err => {
               console.error("Failed to update responder location:", err);
            });
          }
        },
        (err) => console.log('Location access denied or unavailable', err),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      );
      
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [user, userRole]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'triage_records'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records: PatientRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as PatientRecord;
        records.push({
          ...data,
          hasPendingWrites: docSnap.metadata.hasPendingWrites,
        });
      });
      setPatients(records);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'triage_records'));
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-citizen', 'theme-doctor', 'theme-ngo', 'theme-admin');
    const activeTheme = currentView === 'Profile' ? userRole : currentView;
    
    if (activeTheme === 'Doctor') root.classList.add('theme-doctor');
    else if (activeTheme === 'NGO') root.classList.add('theme-ngo');
    else if (activeTheme === 'Admin') root.classList.add('theme-admin');
    else root.classList.add('theme-citizen');
  }, [currentView, userRole]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        if (currentUser.email === 'sarthakdeodhar23@gmail.com') {
          // Force Admin role for this user
          setUserRole('Admin');
          setCurrentView('Admin');
          setNeedsSetup(false);
          // Ensure they have a user document so they count towards total users
          try {
            const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
            if (!userDoc.exists() || userDoc.data()?.role !== 'Admin') {
              await setDoc(doc(db, 'users', currentUser.uid), {
                role: 'Admin',
                createdAt: userDoc.exists() ? userDoc.data().createdAt : Date.now()
              }, { merge: true });
            }
          } catch (e) {
            console.error(e);
            handleFirestoreError(e, OperationType.GET, 'users');
          }
        } else {
          // Fetch user role for regular users
          try {
            const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
            if (userDoc.exists() && userDoc.data().role) {
              const role = userDoc.data().role as AppRole;
              setUserRole(role);
              setCurrentView(role);
              setNeedsSetup(false);
            } else {
              setNeedsSetup(true);
            }
          } catch (e) {
            console.error("Error fetching user role:", e);
            handleFirestoreError(e, OperationType.GET, 'users');
          }
        }
      } else {
         setNeedsSetup(false);
      }
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }

    const q = query(collection(db, 'broadcasts'), orderBy('timestamp', 'desc'), limit(1));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const broadcast = change.doc.data() as EmergencyBroadcast;
          // Show only if it's recent (e.g., last 1 hour)
          if (Date.now() - broadcast.timestamp < 1000 * 60 * 60) {
            
            const isNearby = getBroadcastProximity(broadcast);
            
            if (isNearby) {
              setActiveBroadcast(broadcast);
            }

            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(
                isNearby ? 'NEARBY EMERGENCY' : `Alert: ${broadcast.severity} Severity`, 
                {
                  body: `${broadcast.type}\n${broadcast.message || ''}`,
                  icon: '/vite.svg',
                }
              );
            } else if (!isNearby) {
              console.log("Far away broadcast received (notification only)", broadcast.type);
            }
          }
        }
      });
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'broadcasts'));
    return () => unsubscribe();
  }, [user, userLocation]);

  const handleTriageComplete = (record: PatientRecord) => {
    setPatients((prev) => [...prev, record]);
  };

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-accent font-sans text-xl animate-pulse transition-colors duration-300">Loading Citadel...</div>;
  }

  if (!user || needsSetup) {
    return (
      <div className="min-h-screen bg-background text-text font-sans selection:bg-accent/30 transition-colors duration-300">
        <div className="absolute top-4 right-4 z-50">
          <NeuButton variant="glass" onClick={() => setIsDarkMode(!isDarkMode)} className="w-10 h-10 p-0 rounded-full">
            {isDarkMode ? <Sun className="w-4 h-4 text-accent" /> : <Moon className="w-4 h-4 text-text-muted" />}
          </NeuButton>
        </div>
        <AuthView user={user} onSetupComplete={(role) => {
          setUserRole(role);
          setCurrentView(role);
          setNeedsSetup(false);
        }} />
      </div>
    );
  }

  const isNearbyIncident = activeBroadcast ? getBroadcastProximity(activeBroadcast) : false;

  return (
    <div className="min-h-screen bg-background text-text pb-12 font-sans selection:bg-accent/30 transition-colors duration-300">
      <div className="max-w-screen-md mx-auto relative px-4 sm:px-0">
        <div className="flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur z-50 border-b border-text-muted/10 py-4 px-4 sm:px-0">
          <div className="flex items-center gap-4">
            <h2 
              onClick={() => setCurrentView(userRole)} 
              className="font-serif font-bold text-xl text-accent hidden sm:flex tracking-tight items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
            >
              {currentView === 'Admin' && <ShieldAlert className="w-5 h-5" />}
              Citadel
            </h2>
            <div className="text-xs font-mono bg-background shadow-inner px-3 py-1 rounded-full border border-text-muted/10 hidden sm:block w-fit">
              Role: <span className="text-accent font-bold">{userRole}</span>
            </div>
            {isOffline ? (
              <div className="text-xs font-mono bg-orange-500/10 text-orange-500 shadow-inner px-3 py-1 rounded-full border border-orange-500/20 flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
                Offline Mode ({patients.filter(p => p.hasPendingWrites).length} changes pending)
              </div>
            ) : patients.some(p => p.hasPendingWrites) ? (
              <div className="text-xs font-mono bg-blue-500/10 text-blue-500 shadow-inner px-3 py-1 rounded-full border border-blue-500/20 flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                Syncing...
              </div>
            ) : null}
          </div>
          
          <div className="flex items-center gap-3">
            {currentView !== 'Citizen' && (
              <button 
                onClick={() => setCurrentView('Citizen')}
                className="bg-red-500/10 border border-red-500/20 text-red-500 font-bold px-3 py-1.5 rounded-full text-xs font-mono hover:bg-red-500 hover:text-white transition-colors flex items-center gap-1 shadow-sm"
              >
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div> SOS
              </button>
            )}
            <button 
              onClick={() => setCurrentView(currentView === 'Profile' ? userRole : 'Profile')}
              className={`p-2 rounded-full transition-colors ${currentView === 'Profile' ? 'bg-accent/10 text-accent' : 'hover:bg-background shadow-inner text-text-muted hover:text-text'}`}
            >
              <UserCircle className="w-5 h-5" />
            </button>
            <NeuButton variant="glass" onClick={() => setIsDarkMode(!isDarkMode)} className="w-10 h-10 p-0 rounded-full flex-shrink-0 relative">
              {isDarkMode ? <Sun className="w-4 h-4 text-accent" /> : <Moon className="w-4 h-4 text-text" />}
            </NeuButton>
          </div>
        </div>

        <main className="mt-4">
          {currentView === 'Citizen' && <CitizenView onTriageComplete={handleTriageComplete} />}
          {currentView === 'Doctor' && <DoctorView patients={patients} />}
          {currentView === 'NGO' && <NGOView />}
          {currentView === 'Admin' && <AdminView />}
          {currentView === 'Profile' && <ProfileView />}
        </main>
      </div>

      {/* Global Emergency Broadcast Alert */}
      <AnimatePresence>
        {activeBroadcast && (
          <motion.div 
            initial={{ opacity: 0, y: -50, x: '-50%', scale: 0.95 }}
            animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
            exit={{ opacity: 0, y: -20, x: '-50%', scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className={`fixed top-6 left-1/2 z-[1000] w-[90%] max-w-md text-white px-5 py-4 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.3)] border flex items-start gap-4 transition-all duration-500 overflow-hidden ${
              isNearbyIncident 
                ? 'bg-red-700/90 border-red-400' 
                : activeBroadcast.severity === 'Critical' ? 'bg-red-900/90 border-red-500/50 backdrop-blur-md' :
                  activeBroadcast.severity === 'High' ? 'bg-orange-800/90 border-orange-500/50 backdrop-blur-md' :
                  activeBroadcast.severity === 'Medium' ? 'bg-amber-700/90 border-amber-500/50 backdrop-blur-md' :
                  'bg-blue-900/90 border-blue-500/50 backdrop-blur-md'
            }`}
          >
            {isNearbyIncident && (
              <div className="absolute inset-0 bg-red-500/30 animate-pulse pointer-events-none" style={{ animationDuration: '0.5s' }} />
            )}
            <AlertTriangle className={`w-6 h-6 flex-shrink-0 relative z-10 ${activeBroadcast.severity === 'Critical' || isNearbyIncident ? 'animate-bounce' : ''} mt-0.5`} />
            <div className="flex-1 relative z-10">
              <div className="flex justify-between items-start">
                <h4 className="font-mono font-bold tracking-widest text-xs uppercase opacity-90 mb-1 flex items-center gap-2 text-white/80">
                  {isNearbyIncident ? (
                    <span className="bg-white text-red-700 px-2 py-0.5 rounded-sm font-black animate-pulse">NEARBY EMERGENCY</span>
                  ) : (
                    `Alert: ${activeBroadcast.severity} Severity`
                  )}
                </h4>
                <button onClick={() => setActiveBroadcast(null)} className="bg-black/20 hover:bg-black/40 text-white rounded-full p-1.5 transition-colors shadow-sm cursor-pointer -mr-2 -mt-2">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className={`font-sans font-bold leading-tight mb-1 ${isNearbyIncident ? 'text-2xl text-white' : 'text-lg text-white'}`}>{activeBroadcast.type}</p>
              {activeBroadcast.message && (
                <p className={`font-medium mb-2 leading-snug ${isNearbyIncident ? 'text-base text-white/95' : 'text-sm text-white/80'}`}>{activeBroadcast.message}</p>
              )}
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs opacity-60 font-mono">
                  Received: {new Date(activeBroadcast.timestamp).toLocaleTimeString()}
                </p>
                {activeBroadcast.acceptedBy && activeBroadcast.acceptedBy.length > 0 && (
                  <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded-full">
                    {activeBroadcast.acceptedBy.length} Responder{activeBroadcast.acceptedBy.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              
              {userRole !== 'Citizen' && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-white/20">
                  {user && activeBroadcast.acceptedBy?.includes(user.uid) ? (
                    <button 
                      onClick={async () => {
                        try {
                          await updateDoc(doc(db, 'broadcasts', activeBroadcast.id), {
                            acceptedBy: arrayRemove(user.uid)
                          });
                        } catch (err) {
                           handleFirestoreError(err, OperationType.UPDATE, `broadcasts/${activeBroadcast.id}`);
                        }
                      }}
                      className="flex-1 bg-white/20 hover:bg-white/30 text-white font-bold py-1.5 rounded text-sm transition-colors"
                    >
                      Leave Response
                    </button>
                  ) : (
                    <button 
                      onClick={async () => {
                         if (!user) return;
                         try {
                           await updateDoc(doc(db, 'broadcasts', activeBroadcast.id), {
                             acceptedBy: arrayUnion(user.uid)
                           });
                         } catch (err) {
                           handleFirestoreError(err, OperationType.UPDATE, `broadcasts/${activeBroadcast.id}`);
                         }
                      }}
                      className="flex-1 bg-white text-blue-900 border border-white font-bold py-1.5 rounded text-sm hover:bg-white/90 transition-colors shadow-sm"
                    >
                      Accept Broadcast
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <SupportChatbot />
    </div>
  );
}

