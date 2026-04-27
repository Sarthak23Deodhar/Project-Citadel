import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { NeuCard } from './NeuCard';
import { NeuButton } from './NeuButton';
import { User, LogOut, Settings, ShieldCheck, Mail, Phone, MapPin, Calendar, Loader2, Fingerprint, Camera } from 'lucide-react';
import { auth, db, storage } from '../lib/firebase';
import { signOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';

export function ProfileView() {
  const user = auth.currentUser;
  
  const [userData, setUserData] = useState<any>(null);
  const [meshNotif, setMeshNotif] = useState(true);
  const [bioAuth, setBioAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sosMessage, setSosMessage] = useState('');

  useEffect(() => {
    if (!user) return;
    const fetchUserData = async () => {
      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserData(data);
          setMeshNotif(data.meshNotifications ?? true);
          setBioAuth(data.biometricAuth ?? false);
          setSosMessage(data.sosMessage || 'I need emergency assistance immediately.');
        }
      } catch (e) {
        console.error("Failed to fetch user data", e);
        handleFirestoreError(e, OperationType.GET, 'users');
      } finally {
        setLoading(false);
      }
    };
    fetchUserData();
  }, [user]);

  const toggleSetting = async (setting: 'meshNotifications' | 'biometricAuth') => {
    if (!user) return;
    
    const newValue = setting === 'meshNotifications' ? !meshNotif : !bioAuth;
    
    if (setting === 'meshNotifications') setMeshNotif(newValue);
    if (setting === 'biometricAuth') setBioAuth(newValue);
    
    try {
      await setDoc(doc(db, 'users', user.uid), {
        [setting]: newValue
      }, { merge: true });
    } catch (err) {
      console.error("Failed to update setting:", err);
      handleFirestoreError(err, OperationType.WRITE, 'users');
    }
  };

  const handleSaveSosMessage = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), {
        sosMessage
      }, { merge: true });
      alert("SOS message updated securely.");
    } catch (err) {
      console.error("Failed to update SOS message:", err);
      handleFirestoreError(err, OperationType.WRITE, 'users');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    if (!navigator.onLine) {
      alert("Profile picture upload requires an internet connection. Please try again when online.");
      return;
    }

    try {
      setUploadingImage(true);
      const storageRef = ref(storage, `profile_pictures/${user.uid}_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      await updateProfile(user, { photoURL: downloadURL });
      
      // Update local state to force re-render with new image
      setUserData((prev: any) => ({ ...prev, photoURL: downloadURL }));
      
      // Optionally update Firestore document as well, though Auth is the primary source
      await setDoc(doc(db, 'users', user.uid), {
        photoURL: downloadURL
      }, { merge: true });
      
      alert("Profile picture updated securely.");
    } catch (err) {
      console.error("Failed to upload image:", err);
      alert("Failed to upload image.");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-xl mx-auto p-4 flex flex-col gap-6">
      <div className="border-b border-text-muted/10 pb-4 mb-2">
        <h1 className="text-4xl font-serif text-text font-bold tracking-tight px-2 flex items-center gap-4">
          <User className="text-accent w-8 h-8" /> Operator Profile
        </h1>
      </div>

      <NeuCard className="flex flex-col md:flex-row items-center gap-8 py-10 relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10 rounded-2xl">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
          </div>
        ) : null}
        
        <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
          {uploadingImage ? (
            <div className="w-24 h-24 rounded-full bg-background/80 flex items-center justify-center shrink-0 border border-accent">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
            </div>
          ) : user.photoURL || userData?.photoURL ? (
            <img src={user.photoURL || userData?.photoURL} alt={userData?.fullName || user.displayName || 'Profile'} className="w-24 h-24 rounded-full border border-text-muted/20 shadow-sm object-cover" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-background/50 border border-text-muted/20 flex items-center justify-center shrink-0">
              <User className="w-8 h-8 text-text-muted opacity-50" />
            </div>
          )}
          
          <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera className="w-8 h-8 text-white" />
          </div>
          
          <input 
            type="file" 
            ref={fileInputRef}
            className="hidden" 
            accept="image/*"
            onChange={handleImageUpload}
          />
        </div>
        
        <div className="flex-1 text-center md:text-left w-full">
          <h2 className="text-2xl font-serif text-text font-bold tracking-tight mb-2">{userData?.fullName || user.displayName || 'Anonymous Operator'}</h2>
          
          <div className="space-y-2 mb-4 text-left inline-block md:block">
            <p className="text-sm font-mono text-text-muted flex items-center gap-3">
              <Mail className="w-4 h-4 shrink-0" /> {user.email || 'No email associated'}
            </p>
            {userData?.phone && (
              <p className="text-sm font-mono text-text-muted flex items-center gap-3">
                <Phone className="w-4 h-4 shrink-0" /> {userData.phone}
              </p>
            )}
            {userData?.address && (
              <p className="text-sm font-mono text-text-muted flex items-center gap-3 line-clamp-1">
                <MapPin className="w-4 h-4 shrink-0" /> {userData.address}
              </p>
            )}
            {userData?.birthdate && (
              <p className="text-sm font-mono text-text-muted flex items-center gap-3">
                <Calendar className="w-4 h-4 shrink-0" /> {new Date(userData.birthdate).toLocaleDateString()}
              </p>
            )}
          </div>
          
          <div className="flex justify-center md:justify-start">
            <div className="inline-flex px-3 py-1 bg-accent/10 border border-accent/30 rounded-full text-accent text-[10px] uppercase tracking-widest font-bold items-center gap-2">
              <ShieldCheck className="w-3 h-3" />
              {userData?.role || 'Verified'} Status
            </div>
          </div>
        </div>
      </NeuCard>

      <NeuCard className="space-y-4">
        <h3 className="text-lg font-serif font-bold text-text flex items-center gap-2 mb-6 border-b border-text-muted/10 pb-4">
          <Settings className="text-accent w-5 h-5" /> Settings
        </h3>
        
        <div 
          className="flex justify-between items-center text-sm font-sans text-text-muted py-2 font-medium cursor-pointer"
          onClick={() => toggleSetting('meshNotifications')}
        >
          <span>Mesh Notifications</span>
          <div className={`w-12 h-6 rounded-full relative transition-colors duration-300 shadow-inner ${meshNotif ? 'bg-accent border border-accent/50' : 'bg-background border border-text-muted/20'}`}>
            <motion.div 
              className={`absolute top-0.5 w-5 h-5 rounded-full shadow-sm ${meshNotif ? 'bg-white' : 'bg-text-muted/50'}`}
              animate={{ left: meshNotif ? '26px' : '2px' }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          </div>
        </div>

        <div 
          className="flex justify-between items-center text-sm font-sans text-text-muted py-2 font-medium cursor-pointer group"
          onClick={() => toggleSetting('biometricAuth')}
        >
          <span className="flex items-center gap-2 group-hover:text-text transition-colors">
            <Fingerprint className="w-4 h-4" /> Biometric Authentication (Face/Touch ID)
          </span>
          <div className={`w-12 h-6 rounded-full relative transition-colors duration-300 shadow-inner ${bioAuth ? 'bg-accent border border-accent/50' : 'bg-background border border-text-muted/20'}`}>
            <motion.div 
              className={`absolute top-0.5 w-5 h-5 rounded-full shadow-sm ${bioAuth ? 'bg-white' : 'bg-text-muted/50'}`}
              animate={{ left: bioAuth ? '26px' : '2px' }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-4 border-t border-text-muted/10">
          <label className="text-sm font-sans text-text-muted font-medium">Default SOS Message</label>
          <textarea
            value={sosMessage}
            onChange={(e) => setSosMessage(e.target.value)}
            placeholder="Type your default emergency message here..."
            className="w-full h-24 p-3 glass-input rounded-xl text-sm resize-none font-sans"
          />
          <NeuButton onClick={handleSaveSosMessage} className="self-end py-1.5 px-4 text-xs font-bold mt-1">
            Save Message
          </NeuButton>
        </div>
      </NeuCard>

      <NeuButton 
        className="w-full mt-4 border-red-500/30 text-red-500 hover:bg-red-500/10 justify-center gap-2 mb-8 font-bold text-sm"
        onClick={handleLogout}
      >
        <LogOut className="w-4 h-4" /> Secure Logout
      </NeuButton>

    </div>
  );
}
