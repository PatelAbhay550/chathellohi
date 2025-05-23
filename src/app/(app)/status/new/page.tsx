
'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from '@/components/ui/input';
import { Loader2, ImageUp, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import Image from 'next/image';
import { db, storage } from '@/lib/firebase';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import type { UserProfile } from '@/types';
import { useRouter } from 'next/navigation';


export default function NewStatusPage() {
  const [statusText, setStatusText] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const router = useRouter();

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast({ title: "Image Too Large", description: "Please select an image smaller than 5MB.", variant: "destructive" });
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setImageFile(null);
      setImagePreview(null);
    }
  };

  const handleSubmitStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusText.trim() && !imageFile) {
      toast({ title: "Empty Status", description: "Please write something or upload an image.", variant: "destructive" });
      return;
    }
    if (!user) {
       toast({ title: "Not Authenticated", description: "You need to be logged in to post a status.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setUploadProgress(null);
    let imageUrl: string | undefined = undefined;

    try {
      // Fetch user profile to get name and profile image URL for denormalization
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);
      let userName = user.displayName || user.email || "Anonymous";
      let userProfileImageUrl = user.photoURL || undefined;

      if (userDocSnap.exists()) {
        const userProfile = userDocSnap.data() as UserProfile;
        userName = userProfile.name || userName;
        userProfileImageUrl = userProfile.profileImageUrl || userProfileImageUrl;
      }


      if (imageFile) {
        const imageTimestamp = Date.now();
        const uniqueFileName = `${imageTimestamp}_${imageFile.name}`;
        const fileRef = storageRef(storage, `status_images/${user.uid}/${uniqueFileName}`);
        const uploadTask = uploadBytesResumable(fileRef, imageFile);

        imageUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(progress);
            },
            (error) => {
              console.error("Upload failed:", error);
              reject(error);
            },
            async () => {
              try {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                resolve(downloadURL);
              } catch (error) {
                 reject(error);
              }
            }
          );
        });
      }

      await addDoc(collection(db, 'status_updates'), {
        userId: user.uid,
        userName: userName,
        userProfileImageUrl: userProfileImageUrl || '',
        text: statusText,
        imageUrl: imageUrl || '',
        createdAt: serverTimestamp(),
        likes: [],
      });

      toast({ title: "Status Posted!", description: "Your status update is now live." });
      
      setStatusText('');
      setImageFile(null);
      setImagePreview(null);
      router.push('/dashboard'); 
    } catch (error: any) {
      console.error("Failed to post status:", error);
      toast({ title: "Post Failed", description: error.message || "Could not post status.", variant: "destructive" });
    } finally {
      setIsLoading(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Create New Status</h1>
        <p className="text-muted-foreground">Share what&apos;s on your mind or what you&apos;re up to.</p>
      </header>

      <Card className="shadow-xl">
        <form onSubmit={handleSubmitStatus}>
          <CardHeader>
            <CardTitle>New Update</CardTitle>
            <CardDescription>Let your contacts know what&apos;s new.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Textarea
              placeholder="What's happening?"
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
              rows={4}
              className="resize-none"
              aria-label="Status text input"
              maxLength={500}
            />
            
            <div>
              <label htmlFor="status-image-upload" className="block text-sm font-medium text-foreground mb-1">
                Add an image (optional)
              </label>
              <div className="flex items-center space-x-3">
                <Button asChild variant="outline" size="sm" className="relative">
                  <span>
                    <ImageUp className="mr-2 h-4 w-4" />
                    {imageFile ? "Change Image" : "Upload Image"}
                    <Input 
                      id="status-image-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      aria-label="Upload status image"
                    />
                  </span>
                </Button>
                {imageFile && <span className="text-sm text-muted-foreground truncate max-w-xs">{imageFile.name}</span>}
                {imageFile && (
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm" 
                      className="ml-2 text-xs"
                      onClick={() => {
                        setImageFile(null);
                        setImagePreview(null);
                        const input = document.getElementById('status-image-upload') as HTMLInputElement;
                        if (input) input.value = '';
                      }}
                    >
                      Remove
                    </Button>
                  )}
              </div>
              {imagePreview && (
                <div className="mt-4 border border-border rounded-md p-2 inline-block bg-muted/50">
                  <Image 
                    src={imagePreview} 
                    alt="Image preview" 
                    width={200} height={200} 
                    className="max-w-full h-auto max-h-48 rounded-md object-contain"
                    data-ai-hint="image preview"
                  />
                </div>
              )}
               {uploadProgress !== null && (
                <div className="w-full mt-2">
                   <progress value={uploadProgress} max="100" className="w-full h-2 rounded [&::-webkit-progress-bar]:rounded [&::-webkit-progress-value]:rounded [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"></progress>
                   <p className="text-xs text-center text-muted-foreground">{Math.round(uploadProgress)}%</p>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isLoading || (uploadProgress !== null && uploadProgress < 100)} className="w-full sm:w-auto ml-auto">
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Post Status
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
