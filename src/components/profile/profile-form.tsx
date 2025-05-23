
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase'; 
import type { UserProfile } from '@/types';
import { useEffect, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import NextImage from 'next/image'; // Renamed to NextImage to avoid conflict
import { cn } from '@/lib/utils';
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from "firebase/storage";

const profileFormSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }).max(50),
  username: z.string().min(3, { message: 'Username must be at least 3 characters.' }).max(30)
    .regex(/^[a-zA-Z0-9_]+$/, { message: 'Username can only contain letters, numbers, and underscores.' }),
  email: z.string().email(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say', '']).optional(),
  profileImageUrl: z.string().url().optional().or(z.literal('')),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export function ProfileForm() {
  const { user, userProfile, isAuthenticating } = useAuth(); // use userProfile from auth hook
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingProfile, setIsFetchingProfile] = useState(true); // Kept for initial load consistency
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);


  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: '',
      username: '',
      email: user?.email || '',
      gender: '',
      profileImageUrl: '',
    },
  });

  useEffect(() => {
    if (!isAuthenticating && userProfile) {
      form.reset({
        name: userProfile.name || '',
        username: userProfile.username || '',
        email: userProfile.email || user?.email || '',
        gender: userProfile.gender || '',
        profileImageUrl: userProfile.profileImageUrl || '',
      });
      if (userProfile.profileImageUrl) {
        setProfileImagePreview(userProfile.profileImageUrl);
      }
      setIsFetchingProfile(false);
    } else if (!isAuthenticating && user && !userProfile) {
      // User authenticated but profile not loaded yet or doesn't exist
      // This case should ideally be handled by the provider ensuring userProfile is populated
      // Or, it means a new user whose doc might not be created yet (though signup should do this)
      form.reset({ ...form.getValues(), email: user.email || '' });
      setIsFetchingProfile(false);
    }
  }, [user, userProfile, isAuthenticating, form]);

  async function onSubmit(data: ProfileFormValues) {
    if (!user) {
      toast({ title: 'Error', description: 'You must be logged in to update your profile.', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    setUploadProgress(null);

    let imageUrl = data.profileImageUrl || '';

    if (profileImageFile) {
      const imageTimestamp = Date.now();
      const uniqueFileName = `${imageTimestamp}_${profileImageFile.name}`;
      const fileRef = storageRef(storage, `profile_images/${user.uid}/${uniqueFileName}`);
      const uploadTask = uploadBytesResumable(fileRef, profileImageFile);

      try {
        await new Promise<void>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(progress);
            },
            (error) => {
              console.error("Upload failed:", error);
              toast({ title: 'Image Upload Failed', description: error.message, variant: 'destructive' });
              reject(error);
            },
            async () => {
              try {
                imageUrl = await getDownloadURL(uploadTask.snapshot.ref);
                form.setValue('profileImageUrl', imageUrl);
                resolve();
              } catch (error) {
                console.error("Failed to get download URL:", error);
                toast({ title: 'Image URL Failed', description: "Could not get image URL after upload.", variant: 'destructive' });
                reject(error);
              }
            }
          );
        });
      } catch (error) {
        setIsLoading(false);
        return; 
      }
    }

    try {
      const userDocRef = doc(db, 'users', user.uid);
      // Fetch current document to preserve fields not in the form (like isAdmin, isDisabled etc)
      const currentDocSnap = await getDoc(userDocRef);
      const currentData = currentDocSnap.exists() ? currentDocSnap.data() as UserProfile : {};

      const profileDataToSave: Partial<UserProfile> = {
        ...currentData, // Preserve existing fields
        name: data.name,
        username: data.username,
        // email is from auth, not changed here, but ensure it's set if currentData doesn't have it
        email: currentData.email || user.email || '', 
        gender: data.gender || '',
        profileImageUrl: imageUrl,
        uid: user.uid, // Ensure UID is present
        // createdAt should be preserved if it exists, or set if it's a truly new profile (though signup handles initial)
        createdAt: currentData.createdAt || serverTimestamp(), 
        // Preserve other fields that are not part of this form
        blockedUsers: currentData.blockedUsers || [],
        isAdmin: currentData.isAdmin || false,
        isDisabled: currentData.isDisabled || false,
        disabledUntil: currentData.disabledUntil !== undefined ? currentData.disabledUntil : null,
      };
      
      // Firestore does not allow undefined values, so ensure they are null or removed
      Object.keys(profileDataToSave).forEach(key => {
        if (profileDataToSave[key as keyof UserProfile] === undefined) {
          delete profileDataToSave[key as keyof UserProfile];
        }
      });


      if (currentDocSnap.exists()) {
        await updateDoc(userDocRef, profileDataToSave);
      } else {
        // This case should ideally not happen if signup creates the doc
        await setDoc(userDocRef, profileDataToSave, { merge: true }); // Use merge if creating, though setDoc implies overwrite
      }
      
      toast({ title: 'Profile Updated', description: 'Your profile has been successfully updated.' });
      setProfileImageFile(null); 
      if (imageUrl) setProfileImagePreview(imageUrl); 
    } catch (error: any) {
      console.error("Profile update error:", error);
      toast({
        title: 'Update Failed',
        description: error.message || 'Could not update profile.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setUploadProgress(null);
    }
  }
  
  const handleProfileImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { 
        toast({ title: "Image Too Large", description: "Please select an image smaller than 5MB.", variant: "destructive" });
        return;
      }
      setProfileImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setProfileImageFile(null);
      // Revert to original or placeholder if file is deselected
      setProfileImagePreview(form.getValues('profileImageUrl') || 'https://placehold.co/128x128.png?text=User');
    }
  };


  if (isAuthenticating || isFetchingProfile) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading profile...</p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="profileImageUrl"
          render={({ field }) => ( 
            <FormItem className="flex flex-col items-center">
              <FormLabel>Profile Picture</FormLabel>
              <FormControl>
                <div>
                  <NextImage
                    src={profileImagePreview || field.value || 'https://placehold.co/128x128.png?text=User'}
                    alt="Profile Preview"
                    width={128}
                    height={128}
                    className="rounded-full object-cover border-2 border-primary shadow-md mb-2"
                    data-ai-hint="avatar profile"
                    unoptimized={!!profileImagePreview && profileImagePreview.startsWith('data:')} 
                  />
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleProfileImageChange}
                    className="hidden"
                    id="profileImageUpload"
                  />
                  <label
                    htmlFor="profileImageUpload"
                    className={cn(buttonVariants({ variant: 'outline' }), "cursor-pointer")}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {profileImageFile ? "Change Image" : "Upload Image"}
                  </label>
                   {profileImageFile && (
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm" 
                      className="ml-2 text-xs"
                      onClick={() => {
                        setProfileImageFile(null);
                        setProfileImagePreview(form.getValues('profileImageUrl') || 'https://placehold.co/128x128.png?text=User');
                        const input = document.getElementById('profileImageUpload') as HTMLInputElement;
                        if (input) input.value = '';
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </FormControl>
              {uploadProgress !== null && (
                <div className="w-full max-w-xs mt-2">
                   <progress value={uploadProgress} max="100" className="w-full h-2 rounded [&::-webkit-progress-bar]:rounded [&::-webkit-progress-value]:rounded [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"></progress>
                   <p className="text-xs text-center text-muted-foreground">{Math.round(uploadProgress)}%</p>
                </div>
              )}
              <FormDescription>
                Upload a profile picture. (Max 5MB Recommended)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full Name</FormLabel>
              <FormControl>
                <Input placeholder="Your full name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="your_username" {...field} />
              </FormControl>
              <FormDescription>
                This is your unique username on Hellohi.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="your@email.com" {...field} disabled />
              </FormControl>
              <FormDescription>
                Your email address cannot be changed.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="gender"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Gender</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value || ''}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your gender" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                  <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full sm:w-auto" disabled={isLoading || (uploadProgress !== null && uploadProgress < 100)}>
          {isLoading || (uploadProgress !== null && uploadProgress < 100) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save Changes
        </Button>
      </form>
    </Form>
  );
}
