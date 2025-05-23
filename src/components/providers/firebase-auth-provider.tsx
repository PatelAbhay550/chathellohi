
"use client";

import type { ReactNode } from 'react';
import React, { createContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut } from 'firebase/auth'; // Added signOut for beforeunload
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore'; // Added updateDoc, serverTimestamp
import type { AuthContextType } from '@/hooks/use-auth';
import type { UserProfile } from '@/types';

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface FirebaseAuthProviderProps {
  children: ReactNode;
}

export const FirebaseAuthProvider = ({ children }: FirebaseAuthProviderProps): JSX.Element => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let profileUnsubscribe: (() => void) | undefined;

    const authUnsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        setUser(currentUser);
        if (profileUnsubscribe) {
          profileUnsubscribe(); // Unsubscribe from previous profile listener if any
          profileUnsubscribe = undefined;
        }

        if (currentUser) {
          const userDocRef = doc(db, "users", currentUser.uid);
          
          // Set online status
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
          // User is signed out
          if (userProfile?.uid) { // If there was a logged-in user, update their status
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
        // Firestore updates in 'beforeunload' are not guaranteed.
        // For more reliable presence, Firebase Realtime Database is recommended.
        // This is a best-effort attempt.
        navigator.sendBeacon(
            `/.netlify/functions/updateUserPresence?uid=${auth.currentUser.uid}&isOnline=false`
            // A beacon to a serverless function would be more reliable, but for now, we'll try a direct update.
            // This direct update might not complete, so we also update on explicit logout.
        );
         // Attempt direct update, may not complete
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
      // Ensure user is marked offline if the component unmounts while user is still authenticated
      // This might happen on page navigation or hot-reloads during development
      if (auth.currentUser?.uid) {
         const userDocRef = doc(db, "users", auth.currentUser.uid);
         updateDoc(userDocRef, { isOnline: false, lastSeen: serverTimestamp() })
           .catch(e => console.warn("Best-effort offline update on unmount failed:", e));
      }
    };
  }, [userProfile?.uid]); // Added userProfile.uid to dependencies to handle logout presence update correctly
  
  const loading = isAuthenticating;

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, isAuthenticating, error }}>
      {children}
    </AuthContext.Provider>
  );
};
