
"use client";

import type { ReactNode } from 'react';
import * as React from 'react'; // Changed import style
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import type { AuthContextType } from '@/hooks/use-auth';
import type { UserProfile } from '@/types';

export const AuthContext = React.createContext<AuthContextType | undefined>(undefined); // Used React.createContext

interface FirebaseAuthProviderProps {
  children: ReactNode;
}

export const FirebaseAuthProvider = ({ children }: FirebaseAuthProviderProps): JSX.Element => {
  const [user, setUser] = React.useState<User | null>(null); // Used React.useState
  const [userProfile, setUserProfile] = React.useState<UserProfile | null>(null); // Used React.useState
  const [isAuthenticating, setIsAuthenticating] = React.useState(true); // Used React.useState
  const [error, setError] = React.useState<Error | null>(null); // Used React.useState

  React.useEffect(() => { // Used React.useEffect
    let profileUnsubscribe: (() => void) | undefined;

    const authUnsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        setUser(currentUser);
        if (profileUnsubscribe) {
          profileUnsubscribe(); 
          profileUnsubscribe = undefined;
        }

        if (currentUser) {
          const userDocRef = doc(db, "users", currentUser.uid);
          
          try {
            await updateDoc(userDocRef, { isOnline: true });
          } catch (e) {
            console.warn("Could not set user online on auth change:", e);
          }

          profileUnsubscribe = onSnapshot(userDocRef, 
            (docSnap) => {
              if (docSnap.exists()) {
                setUserProfile({ uid: docSnap.id, ...docSnap.data() } as UserProfile);
              } else {
                console.warn("User document not found for UID:", currentUser.uid);
                setUserProfile(null); 
              }
              setIsAuthenticating(false);
            },
            (profileError) => {
              console.error("Error fetching user profile:", profileError);
              setError(profileError);
              setUserProfile(null);
              setIsAuthenticating(false);
            }
          );
        } else {
          if (userProfile?.uid) { 
            const userDocRef = doc(db, "users", userProfile.uid);
            updateDoc(userDocRef, { isOnline: false, lastSeen: serverTimestamp() })
              .catch(e => console.warn("Could not set user offline on sign out:", e));
          }
          setUserProfile(null);
          setIsAuthenticating(false);
        }
      },
      (authError) => {
        console.error("Auth state error:", authError);
        setError(authError);
        setUser(null);
        setUserProfile(null);
        setIsAuthenticating(false);
      }
    );

    const handleBeforeUnload = () => {
      if (auth.currentUser?.uid) {
        const userDocRef = doc(db, "users", auth.currentUser.uid);
        navigator.sendBeacon(
            `/.netlify/functions/updateUserPresence?uid=${auth.currentUser.uid}&isOnline=false`
        );
        updateDoc(userDocRef, { isOnline: false, lastSeen: serverTimestamp() })
          .catch(e => console.warn("Best-effort offline update failed in beforeunload:", e));
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      authUnsubscribe();
      if (profileUnsubscribe) {
        profileUnsubscribe();
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (auth.currentUser?.uid) {
         const userDocRef = doc(db, "users", auth.currentUser.uid);
         updateDoc(userDocRef, { isOnline: false, lastSeen: serverTimestamp() })
           .catch(e => console.warn("Best-effort offline update on unmount failed:", e));
      }
    };
  }, [userProfile?.uid]); 
  
  const loading = isAuthenticating;

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, isAuthenticating, error }}>
      {children}
    </AuthContext.Provider>
  );
};
