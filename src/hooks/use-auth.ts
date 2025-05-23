
import * as React from 'react'; // Changed to allow React.useContext
import type { User } from 'firebase/auth';
import { AuthContext } from '@/components/providers/firebase-auth-provider';
import type { UserProfile } from '@/types';

export interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null; 
  loading: boolean;
  isAuthenticating: boolean; 
  error: Error | null;
}

export const useAuth = (): AuthContextType => {
  const context = React.useContext(AuthContext); // Used React.useContext
  if (context === undefined) {
    throw new Error('useAuth must be used within an FirebaseAuthProvider');
  }
  return context;
};
