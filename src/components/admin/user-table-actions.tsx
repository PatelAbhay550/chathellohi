
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
import { Ban, CheckCircle, Loader2, ShieldOff, ShieldBan } from 'lucide-react';
import { add, format } from 'date-fns'; 

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
        isPermanentlyBanned: false, // Ensure permanent ban is not set by temp disable
        disabledUntil: disabledUntil,
      });
      toast({ title: 'User Disabled', description: `${user.name || user.username} has been temporarily disabled for ${durationDays} days.` });
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
        // isPermanentlyBanned remains as is unless explicitly unbanned
      });
      toast({ title: 'User Enabled', description: `${user.name || user.username} is no longer temporarily disabled.` });
    } catch (error) {
      console.error('Error enabling user:', error);
      toast({ title: 'Error', description: 'Could not enable user.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBanUser = async () => {
    if (user.uid === currentAdminId) {
      toast({ title: 'Error', description: "Admins cannot ban their own account.", variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        isPermanentlyBanned: true,
        isDisabled: true, // Also mark as disabled
        disabledUntil: null, // Permanent ban overrides temporary disable end date
      });
      toast({ title: 'User Banned', description: `${user.name || user.username} has been permanently banned.` });
    } catch (error) {
      console.error('Error banning user:', error);
      toast({ title: 'Error', description: 'Could not ban user.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnbanUser = async () => {
    setIsLoading(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        isPermanentlyBanned: false,
        isDisabled: false, // Also re-enable account
        disabledUntil: null,
      });
      toast({ title: 'User Unbanned', description: `${user.name || user.username} has been unbanned.` });
    } catch (error) {
      console.error('Error unbanning user:', error);
      toast({ title: 'Error', description: 'Could not unban user.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };


  const isTemporarilyDisabled = user.isDisabled && !user.isPermanentlyBanned && user.disabledUntil &&
                                (user.disabledUntil instanceof Timestamp ? user.disabledUntil.toDate() : new Date(user.disabledUntil as any)) > new Date();


  if (user.uid === currentAdminId) {
    return <span className="text-xs text-muted-foreground italic">Admin Account</span>;
  }

  return (
    <div className="space-x-2 flex flex-wrap gap-1 justify-end">
      {user.isPermanentlyBanned ? (
        <Button
          variant="outline"
          size="sm"
          onClick={handleUnbanUser}
          disabled={isLoading}
          className="text-green-600 border-green-600 hover:bg-green-50 hover:text-green-700"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ShieldOff className="h-4 w-4 mr-1" />}
          Unban
        </Button>
      ) : (
        <>
          {isTemporarilyDisabled ? (
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
                <Button variant="outline" size="sm" disabled={isLoading} className="text-orange-600 border-orange-600 hover:bg-orange-50 hover:text-orange-700">
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Ban className="h-4 w-4 mr-1" />}
                  Disable (Temp)
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Temporarily Disable: {user.name || user.username}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Choose the duration for which to disable this user. They will not be able to log in during this period.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-4">
                    <Button onClick={() => { handleDisableUser(1); (document.querySelector('[data-radix-AlertDialog-cancel]') as HTMLElement)?.click(); }} className="w-full" variant="secondary">For 1 Day</Button>
                    <Button onClick={() => { handleDisableUser(7); (document.querySelector('[data-radix-AlertDialog-cancel]') as HTMLElement)?.click(); }} className="w-full" variant="secondary">For 7 Days</Button>
                    <Button onClick={() => { handleDisableUser(30);(document.querySelector('[data-radix-AlertDialog-cancel]') as HTMLElement)?.click(); }} className="w-full" variant="secondary">For 30 Days</Button>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel data-radix-AlertDialog-cancel>Cancel</AlertDialogCancel>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ShieldBan className="h-4 w-4 mr-1" />}
                Ban (Perm)
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Permanently Ban: {user.name || user.username}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action will permanently ban the user. They will not be able to log in. This action can be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleBanUser} className="bg-destructive hover:bg-destructive/90">
                  Confirm Ban
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
