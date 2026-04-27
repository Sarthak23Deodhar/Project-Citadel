import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { NeuCard } from './NeuCard';
import { NeuButton } from './NeuButton';
import { ShieldCheck, LogIn, Loader2, Mail, Lock, UserPlus, Key, Fingerprint, Heart, Box, User as UserIcon, Phone, MapPin, Calendar } from 'lucide-react';
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';

import { User } from 'firebase/auth';
import { AppRole } from '../types';

import { verifyMedicalLicense } from '../services/aiService';

const DustBackground = () => {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {[...Array(40)].map((_, i) => {
        const size = Math.random() * 4 + 1;
        const left = Math.random() * 100;
        const top = Math.random() * 100;
        const animationDuration = Math.random() * 10 + 10;
        const animationDelay = Math.random() * 5;
        return (
          <motion.div
            key={i}
            className="absolute bg-text rounded-full shadow-[0_0_10px_rgba(255,255,255,0.4)]"
            style={{
              width: size * 1.5,
              height: size * 1.5,
              left: `${left}%`,
              top: `${top}%`,
            }}
            animate={{
              y: [0, -150, 0],
              x: [0, Math.random() * 80 - 40, 0],
              opacity: [0.2, 0.8, 0.2],
              scale: [1, 1.5, 1],
            }}
            transition={{
              duration: animationDuration,
              repeat: Infinity,
              ease: "easeInOut",
              delay: animationDelay,
            }}
          />
        );
      })}
    </div>
  );
};

interface AuthViewProps {
  user?: User | null;
  onSetupComplete?: (role: AppRole) => void;
}

export function AuthView({ user, onSetupComplete }: AuthViewProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Registration fields
  const [selectedRole, setSelectedRole] = useState<AppRole>('Citizen');
  const [accessKey, setAccessKey] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [birthdate, setBirthdate] = useState('');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await signInWithPopup(auth, googleProvider);
      // We don't create the user document here. App.tsx will notice the missing document and render this component with `user` prop to continue setup.
    } catch (err: any) {
      console.error("Google Login failed:", err);
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    if (isSignUp && selectedRole !== 'Citizen' && !accessKey) {
      setError(`Please provide your ${selectedRole} Access Key.`);
      return;
    }

    if (isSignUp && (!fullName || !phone || !address || !birthdate)) {
      setError(`Please provide all personal details (Name, Phone, Address, Birthdate).`);
      return;
    }

    setLoading(true);
    setError(null);

    // Verify License/Key during signup
    if (isSignUp && (selectedRole === 'Doctor' || selectedRole === 'NGO')) {
      try {
        const isValid = await verifyMedicalLicense(accessKey);
        if (!isValid) {
          setError(`Invalid ${selectedRole} Credentials. Verification failed.`);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error("Verification error", err);
        setError("Error verifying credentials. Please try again.");
        setLoading(false);
        return;
      }
    }

    try {
      if (isSignUp) {
        const res = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', res.user.uid), {
          role: selectedRole,
          accessKey: accessKey || null,
          fullName,
          phone,
          address,
          birthdate,
          createdAt: Date.now()
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error("Email Auth failed:", err);
      handleFirestoreError(err, OperationType.WRITE, 'users');
      if (err.code === 'auth/email-already-in-use') {
        setError("Email already in use. Try logging in.");
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError("Invalid email or password.");
      } else if (err.code === 'auth/invalid-email') {
        setError("Invalid email address format.");
      } else if (err.code === 'auth/operation-not-allowed') {
        setError("Email/Password authentication is not enabled. Please enable it in the Firebase Console: Authentication -> Sign-in method.");
      } else {
        setError(err.message || 'Authentication failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSetupComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    if (selectedRole !== 'Citizen' && !accessKey) {
      setError(`Please provide your ${selectedRole} Access Key.`);
      return;
    }

    if (!fullName || !phone || !address || !birthdate) {
      setError(`Please provide all personal details (Name, Phone, Address, Birthdate).`);
      return;
    }

    setLoading(true);
    setError(null);

    // Verify License/Key
    if (selectedRole === 'Doctor' || selectedRole === 'NGO') {
      try {
        const isValid = await verifyMedicalLicense(accessKey);
        if (!isValid) {
          setError(`Invalid ${selectedRole} Credentials. Verification failed.`);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error("Verification error", err);
        setError("Error verifying credentials. Please try again.");
        setLoading(false);
        return;
      }
    }

    try {
      await setDoc(doc(db, 'users', user.uid), {
        role: selectedRole,
        accessKey: accessKey || null,
        fullName,
        phone,
        address,
        birthdate,
        createdAt: Date.now()
      });
      if (onSetupComplete) {
        onSetupComplete(selectedRole);
      }
    } catch (err: any) {
      console.error("Setup failed:", err);
      setError(err.message || 'Setup failed.');
      handleFirestoreError(err, OperationType.WRITE, 'users');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-10 p-4 text-center relative overflow-x-hidden overflow-y-auto">
      <DustBackground />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md relative z-10 my-8">
        <ShieldCheck className="w-16 h-16 text-accent mx-auto mb-4" />
        <h1 className="text-4xl font-serif text-text font-bold tracking-tight mb-8">Citadel</h1>

        <NeuCard className="p-4 sm:p-8 w-full">
          
          {user ? (
            <form onSubmit={handleSetupComplete} className="space-y-4 relative z-10 text-left">
              <p className="text-sm font-medium text-text-muted mb-4 text-center">Complete your profile</p>
              
              <div className="space-y-3 mb-4">
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input type="text" placeholder="Full Name" className="glass-input pl-12" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input type="tel" placeholder="Phone Number" className="glass-input pl-12" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                </div>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input type="text" placeholder="Address" className="glass-input pl-12" value={address} onChange={(e) => setAddress(e.target.value)} required />
                </div>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input type="date" placeholder="Birthdate" className="glass-input pl-12" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} required />
                </div>
              </div>

              <div className="flex flex-col gap-2 mb-4 relative z-0">
                <button 
                  type="button"
                  onClick={() => setSelectedRole('Citizen')}
                  className={`relative px-4 py-3 rounded-xl flex items-center gap-3 transition-colors duration-300 border ${selectedRole === 'Citizen' ? 'border-accent/40 text-accent' : 'bg-background/40 border-text-muted/20 hover:border-text-muted/40 text-text-muted'}`}
                >
                  {selectedRole === 'Citizen' && (
                    <motion.div layoutId="authRoleBorder" className="absolute inset-0 z-0 bg-accent/10 border border-accent/30 rounded-xl shadow-[0_0_15px_rgba(0,0,0,0.1)] shadow-accent/20" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
                  )}
                  <Fingerprint className={`relative z-10 w-5 h-5 transition-colors ${selectedRole === 'Citizen' ? 'text-accent' : 'text-text-muted'}`}/>
                  <div className="relative z-10 text-left">
                    <span className={`block text-sm font-semibold transition-colors ${selectedRole === 'Citizen' ? 'text-accent' : 'text-text'}`}>Citizen</span>
                    <span className={`block text-xs transition-colors ${selectedRole === 'Citizen' ? 'text-accent/80' : 'text-text-muted'}`}>Report incidents and request help</span>
                  </div>
                </button>

                <button 
                  type="button"
                  onClick={() => setSelectedRole('Doctor')}
                  className={`relative px-4 py-3 rounded-xl flex items-center gap-3 transition-colors duration-300 border ${selectedRole === 'Doctor' ? 'border-emerald-500/40 text-emerald-500' : 'bg-background/40 border-text-muted/20 hover:border-text-muted/40 text-text-muted'}`}
                >
                  {selectedRole === 'Doctor' && (
                    <motion.div layoutId="authRoleBorder" className="absolute inset-0 z-0 bg-emerald-500/10 border border-emerald-500/30 rounded-xl shadow-[0_0_15px_rgba(0,0,0,0.1)] shadow-emerald-500/20" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
                  )}
                  <Heart className={`relative z-10 w-5 h-5 transition-colors ${selectedRole === 'Doctor' ? 'text-emerald-500' : 'text-text-muted'}`}/>
                  <div className="relative z-10 text-left">
                    <span className={`block text-sm font-semibold transition-colors ${selectedRole === 'Doctor' ? 'text-emerald-500' : 'text-text'}`}>Medical Professional</span>
                    <span className={`block text-xs transition-colors ${selectedRole === 'Doctor' ? 'text-emerald-500/80' : 'text-text-muted'}`}>Review triage and coordinate care</span>
                  </div>
                </button>

                <button 
                  type="button"
                  onClick={() => setSelectedRole('NGO')}
                  className={`relative px-4 py-3 rounded-xl flex items-center gap-3 transition-colors duration-300 border ${selectedRole === 'NGO' ? 'border-blue-500/40 text-blue-500' : 'bg-background/40 border-text-muted/20 hover:border-text-muted/40 text-text-muted'}`}
                >
                  {selectedRole === 'NGO' && (
                    <motion.div layoutId="authRoleBorder" className="absolute inset-0 z-0 bg-blue-500/10 border border-blue-500/30 rounded-xl shadow-[0_0_15px_rgba(0,0,0,0.1)] shadow-blue-500/20" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
                  )}
                  <Box className={`relative z-10 w-5 h-5 transition-colors ${selectedRole === 'NGO' ? 'text-blue-500' : 'text-text-muted'}`}/>
                  <div className="relative z-10 text-left">
                    <span className={`block text-sm font-semibold transition-colors ${selectedRole === 'NGO' ? 'text-blue-500' : 'text-text'}`}>NGO / Logistics</span>
                    <span className={`block text-xs transition-colors ${selectedRole === 'NGO' ? 'text-blue-500/80' : 'text-text-muted'}`}>Manage resources and supplies</span>
                  </div>
                </button>
              </div>

              {(selectedRole === 'Doctor' || selectedRole === 'NGO') && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="relative mb-4">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-accent" />
                  <input 
                    type="text" 
                    placeholder={selectedRole === 'Doctor' ? "Medical License Number" : "NGO Authorization Key"}
                    className="glass-input pl-12 border-accent/30"
                    value={accessKey}
                    onChange={(e) => setAccessKey(e.target.value)}
                  />
                </motion.div>
              )}

              <NeuButton 
                type="submit"
                variant="primary"
                className="w-full py-3 mt-4 text-sm font-semibold"
                disabled={loading}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto text-white/50" /> : 'Complete Setup'}
              </NeuButton>
            </form>
          ) : (
            <>
              <div className="flex justify-center mb-6">
                <div className="flex bg-background rounded-full p-1 shadow-inner border border-text-muted/10 inline-flex">
                  <button 
                    onClick={() => { setIsSignUp(false); setError(null); }}
                    className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${!isSignUp ? 'bg-accent text-white shadow-md' : 'text-text-muted hover:text-text'}`}
                  >
                    Sign In
                  </button>
                  <button 
                    onClick={() => { setIsSignUp(true); setError(null); }}
                    className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${isSignUp ? 'bg-accent text-white shadow-md' : 'text-text-muted hover:text-text'}`}
                  >
                    Sign Up
                  </button>
                </div>
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-4 mb-6 relative z-10 text-left">
                <AnimatePresence>
                  {isSignUp && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }} 
                      animate={{ opacity: 1, height: 'auto' }} 
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden space-y-4"
                    >
                      <div className="space-y-3 mt-2">
                        <div className="relative">
                          <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                          <input type="text" placeholder="Full Name" className="glass-input pl-12" value={fullName} onChange={(e) => setFullName(e.target.value)} required={isSignUp} />
                        </div>
                        <div className="relative">
                          <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                          <input type="tel" placeholder="Phone Number" className="glass-input pl-12" value={phone} onChange={(e) => setPhone(e.target.value)} required={isSignUp} />
                        </div>
                        <div className="relative">
                          <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                          <input type="text" placeholder="Address" className="glass-input pl-12" value={address} onChange={(e) => setAddress(e.target.value)} required={isSignUp} />
                        </div>
                        <div className="relative">
                          <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                          <input type="date" placeholder="Birthdate" className="glass-input pl-12" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} required={isSignUp} />
                        </div>
                      </div>

                      <p className="text-sm font-medium text-text-muted mb-3 text-center pt-2">Select your role</p>
                      <div className="flex flex-col gap-2 mb-4 relative z-0">
                        <button 
                          type="button"
                          onClick={() => setSelectedRole('Citizen')}
                          className={`relative px-4 py-3 rounded-xl flex items-center gap-3 transition-colors duration-300 border ${selectedRole === 'Citizen' ? 'border-accent/40 text-accent' : 'bg-background/40 border-text-muted/20 hover:border-text-muted/40 text-text-muted'}`}
                        >
                          {selectedRole === 'Citizen' && (
                            <motion.div layoutId="authRoleBorder2" className="absolute inset-0 z-0 bg-accent/10 border border-accent/30 rounded-xl shadow-[0_0_15px_rgba(0,0,0,0.1)] shadow-accent/20" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
                          )}
                          <Fingerprint className={`relative z-10 w-5 h-5 transition-colors ${selectedRole === 'Citizen' ? 'text-accent' : 'text-text-muted'}`}/>
                          <div className="relative z-10 text-left">
                            <span className={`block text-sm font-semibold transition-colors ${selectedRole === 'Citizen' ? 'text-accent' : 'text-text'}`}>Citizen</span>
                            <span className={`block text-xs transition-colors ${selectedRole === 'Citizen' ? 'text-accent/80' : 'text-text-muted'}`}>Report incidents and request help</span>
                          </div>
                        </button>

                        <button 
                          type="button"
                          onClick={() => setSelectedRole('Doctor')}
                          className={`relative px-4 py-3 rounded-xl flex items-center gap-3 transition-colors duration-300 border ${selectedRole === 'Doctor' ? 'border-emerald-500/40 text-emerald-500' : 'bg-background/40 border-text-muted/20 hover:border-text-muted/40 text-text-muted'}`}
                        >
                          {selectedRole === 'Doctor' && (
                            <motion.div layoutId="authRoleBorder2" className="absolute inset-0 z-0 bg-emerald-500/10 border border-emerald-500/30 rounded-xl shadow-[0_0_15px_rgba(0,0,0,0.1)] shadow-emerald-500/20" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
                          )}
                          <Heart className={`relative z-10 w-5 h-5 transition-colors ${selectedRole === 'Doctor' ? 'text-emerald-500' : 'text-text-muted'}`}/>
                          <div className="relative z-10 text-left">
                            <span className={`block text-sm font-semibold transition-colors ${selectedRole === 'Doctor' ? 'text-emerald-500' : 'text-text'}`}>Medical Professional</span>
                            <span className={`block text-xs transition-colors ${selectedRole === 'Doctor' ? 'text-emerald-500/80' : 'text-text-muted'}`}>Review triage and coordinate care</span>
                          </div>
                        </button>

                        <button 
                          type="button"
                          onClick={() => setSelectedRole('NGO')}
                          className={`relative px-4 py-3 rounded-xl flex items-center gap-3 transition-colors duration-300 border ${selectedRole === 'NGO' ? 'border-blue-500/40 text-blue-500' : 'bg-background/40 border-text-muted/20 hover:border-text-muted/40 text-text-muted'}`}
                        >
                          {selectedRole === 'NGO' && (
                            <motion.div layoutId="authRoleBorder2" className="absolute inset-0 z-0 bg-blue-500/10 border border-blue-500/30 rounded-xl shadow-[0_0_15px_rgba(0,0,0,0.1)] shadow-blue-500/20" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
                          )}
                          <Box className={`relative z-10 w-5 h-5 transition-colors ${selectedRole === 'NGO' ? 'text-blue-500' : 'text-text-muted'}`}/>
                          <div className="relative z-10 text-left">
                            <span className={`block text-sm font-semibold transition-colors ${selectedRole === 'NGO' ? 'text-blue-500' : 'text-text'}`}>NGO / Logistics</span>
                            <span className={`block text-xs transition-colors ${selectedRole === 'NGO' ? 'text-blue-500/80' : 'text-text-muted'}`}>Manage resources and supplies</span>
                          </div>
                        </button>
                      </div>

                      {(selectedRole === 'Doctor' || selectedRole === 'NGO') && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="relative mb-4">
                          <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-accent" />
                          <input 
                            type="text" 
                            placeholder={selectedRole === 'Doctor' ? "Medical License Number" : "NGO Authorization Key"}
                            className="glass-input pl-12 border-accent/30"
                            value={accessKey}
                            onChange={(e) => setAccessKey(e.target.value)}
                          />
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input 
                    type="email" 
                    placeholder="Email Address" 
                    className="glass-input pl-12"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                  <input 
                    type="password" 
                    placeholder="Password" 
                    className="glass-input pl-12"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <NeuButton 
                  type="submit"
                  variant="primary"
                  className="w-full py-3 mt-4 text-sm font-semibold"
                  disabled={loading}
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto text-white/50" /> : (isSignUp ? 'Sign Up' : 'Sign In')}
                </NeuButton>
              </form>

              <div className="flex items-center gap-4 mb-6 opacity-50 relative z-10">
                <div className="h-px bg-text-muted flex-1"></div>
                <span className="text-[10px] uppercase font-semibold text-text-muted">OR</span>
                <div className="h-px bg-text-muted flex-1"></div>
              </div>

              <NeuButton 
                className="w-full justify-center text-xs py-3 mb-2 font-sans tracking-wide relative z-10"
                onClick={handleGoogleSignIn}
                disabled={loading}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto text-text-muted" /> : (
                  <span className="flex items-center gap-3 text-text">
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Continue with Google
                  </span>
                )}
              </NeuButton>
            </>
          )}

          {error && (
            <p className="text-red-500 text-xs mt-4 font-mono relative z-10">{error}</p>
          )}
        </NeuCard>
      </motion.div>
    </div>
  );
}
