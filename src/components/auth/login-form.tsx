
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import type { UserProfile } from '@/types';
import { format } from 'date-fns';

const formSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
});

export function LoginForm() {
  const { toast } = useToast();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, values.email, values.password);
      const firebaseUser = userCredential.user;

      // Fetch user profile from Firestore
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userProfile = userDocSnap.data() as UserProfile;
        if (userProfile.isDisabled) {
          const now = Timestamp.now();
          let disabledUntilDate: Date | null = null;
          if (userProfile.disabledUntil) {
            if (userProfile.disabledUntil instanceof Timestamp) {
              disabledUntilDate = userProfile.disabledUntil.toDate();
            } else if (typeof userProfile.disabledUntil === 'number') {
              disabledUntilDate = new Date(userProfile.disabledUntil);
            } else if (typeof userProfile.disabledUntil === 'string') {
              disabledUntilDate = new Date(userProfile.disabledUntil);
            }
          }
          
          if (disabledUntilDate && disabledUntilDate > now.toDate()) {
            toast({
              title: 'Account Disabled',
              description: `Your account is temporarily disabled until ${format(disabledUntilDate, "PPpp")}. Please contact support if you believe this is an error.`,
              variant: 'destructive',
              duration: 10000,
            });
            await signOut(auth); // Sign out the user
            setIsLoading(false);
            return;
          } else if (!disabledUntilDate) { // Permanently disabled (or no end date set)
             toast({
              title: 'Account Disabled',
              description: `Your account is disabled. Please contact support.`,
              variant: 'destructive',
              duration: 10000,
            });
            await signOut(auth);
            setIsLoading(false);
            return;
          }
          // If disabledUntil is in the past, allow login (implicitly enable)
        }
      } else {
        // This case should ideally not happen for an existing user
        console.warn("User profile not found on login for UID:", firebaseUser.uid);
      }

      toast({
        title: 'Login Successful',
        description: 'Welcome back!',
      });
      router.push('/dashboard');
    } catch (error: any) {
      toast({
        title: 'Login Failed',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="you@example.com" {...field} type="email" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input placeholder="••••••••" {...field} type={showPassword ? "text" : "password"} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Login
        </Button>
      </form>
    </Form>
  );
}
