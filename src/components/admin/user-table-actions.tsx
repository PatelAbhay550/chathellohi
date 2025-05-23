
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Ban, CheckCircle, Loader2 } from 'lucide-react';
import { add, format } from 'date-fns'; // For date manipulation

interface UserTableActionsProps {
  user: UserProfile;
  currentAdminId: string | undefined;
}

export function UserTableActions({ user, currentAdminId }: UserTableActionsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleDisableUser = async (durationDays: number) => {
    if (user.uid === currentAdminId) {
      toast({ title: 'Error', description: "Admins cannot disable their own account.", variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const disabledUntil = Timestamp.fromDate(add(new Date(), { days: durationDays }));
      await updateDoc(userDocRef, {
        isDisabled: true,
        disabledUntil: disabledUntil,
      });
      toast({ title: 'User Disabled', description: `${user.name || user.username} has been disabled for ${durationDays} days.` });
    } catch (error) {
      console.error('Error disabling user:', error);
      toast({ title: 'Error', description: 'Could not disable user.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnableUser = async () => {
    setIsLoading(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        isDisabled: false,
        disabledUntil: null,
      });
      toast({ title: 'User Enabled', description: `${user.name || user.username} has been enabled.` });
    } catch (error) {
      console.error('Error enabling user:', error);
      toast({ title: 'Error', description: 'Could not enable user.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const isCurrentlyDisabled = user.isDisabled && user.disabledUntil &&
                             (user.disabledUntil instanceof Timestamp ? user.disabledUntil.toDate() : new Date(user.disabledUntil as any)) > new Date();


  if (user.uid === currentAdminId) {
    return <span className="text-xs text-muted-foreground italic">Admin Account</span>;
  }

  return (
    <div className="space-x-2">
      {isCurrentlyDisabled ? (
        <Button
          variant="outline"
          size="sm"
          onClick={handleEnableUser}
          disabled={isLoading}
          className="text-green-600 border-green-600 hover:bg-green-50 hover:text-green-700"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
          Enable
        </Button>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={isLoading} className="text-destructive border-destructive hover:bg-destructive/10 hover:text-destructive">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Ban className="h-4 w-4 mr-1" />}
              Disable
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disable User: {user.name || user.username}?</AlertDialogTitle>
              <AlertDialogDescription>
                Choose the duration for which to disable this user. They will not be able to log in during this period.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-4">
                <Button onClick={() => { handleDisableUser(1); (document.querySelector('[data-radix-AlertDialog-cancel]') as HTMLElement)?.click(); }} className="w-full" variant="secondary">Disable for 1 Day</Button>
                <Button onClick={() => { handleDisableUser(7); (document.querySelector('[data-radix-AlertDialog-cancel]') as HTMLElement)?.click(); }} className="w-full" variant="secondary">Disable for 7 Days</Button>
                <Button onClick={() => { handleDisableUser(30);(document.querySelector('[data-radix-AlertDialog-cancel]') as HTMLElement)?.click(); }} className="w-full" variant="secondary">Disable for 30 Days</Button>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel data-radix-AlertDialog-cancel>Cancel</AlertDialogCancel>
              {/* AlertDialogAction is not used directly for submission here, actions are on duration buttons */}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
