
import { useContext } from 'react';
import type { User } from 'firebase/auth';
import { AuthContext } from '@/components/providers/firebase-auth-provider';
import type { UserProfile } from '@/types';

export interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null; 
  loading: boolean;
  isAuthenticating: boolean; 
  error: Error | null;
  // No new fields needed here as isOnline/lastSeen are part of UserProfile
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an FirebaseAuthProvider');
  }
  return context;
};
