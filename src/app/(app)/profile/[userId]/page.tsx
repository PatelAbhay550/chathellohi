
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, UserCircle2, Mail, CalendarDays, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/use-auth'; // Added useAuth

const getInitials = (name?: string) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2) : 'U';

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { user: currentUser } = useAuth(); // Get current user for chat link
  const userId = params.userId as string;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setError("User ID is missing.");
      setIsLoading(false);
      return;
    }

    const fetchProfile = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const userDocRef = doc(db, "users", userId);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          setProfile({ uid: userDocSnap.id, ...userDocSnap.data() } as UserProfile);
        } else {
          setError("User profile not found.");
        }
      } catch (err) {
        console.error("Error fetching user profile:", err);
        setError("Failed to load user profile.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [userId]);

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-var(--header-height,4rem)-2rem)] items-center justify-center p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3 text-lg">Loading profile...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-[calc(100vh-var(--header-height,4rem)-2rem)] items-center justify-center p-6 text-center">
        <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold text-foreground mb-2">Error</h1>
        <p className="text-muted-foreground mb-6">{error}</p>
        <Button onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  if (!profile) {
    return (
        <div className="flex flex-col h-[calc(100vh-var(--header-height,4rem)-2rem)] items-center justify-center p-6 text-center">
            <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
            <h1 className="text-2xl font-bold text-foreground mb-2">Profile Not Found</h1>
            <p className="text-muted-foreground mb-6">The requested user profile could not be loaded.</p>
            <Button onClick={() => router.back()}>Go Back</Button>
        </div>
    );
  }
  
  const getChatRoomId = () => {
    if (!currentUser || !profile) return null;
    return [currentUser.uid, profile.uid].sort().join('_');
  };
  const chatRoomId = getChatRoomId();

  return (
    <div className="max-w-3xl mx-auto space-y-8 p-4 md:p-0">
      <header className="flex flex-col items-center md:flex-row md:items-start gap-6 pt-6">
        <Avatar className="h-32 w-32 md:h-40 md:w-40 border-4 border-primary shadow-lg">
          <AvatarImage src={profile.profileImageUrl} alt={profile.name} data-ai-hint="avatar profile" />
          <AvatarFallback className="text-4xl bg-muted text-muted-foreground">{getInitials(profile.name)}</AvatarFallback>
        </Avatar>
        <div className="text-center md:text-left md:pt-4">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">{profile.name || 'User'}</h1>
          <p className="text-lg text-primary">@{profile.username || 'username'}</p>
          {profile.email && (
            <div className="mt-2 flex items-center justify-center md:justify-start text-muted-foreground">
              <Mail className="mr-2 h-4 w-4" />
              <span>{profile.email}</span>
            </div>
          )}
           {profile.createdAt && (
            <div className="mt-1 flex items-center justify-center md:justify-start text-sm text-muted-foreground">
              <CalendarDays className="mr-2 h-4 w-4" />
              <span>Joined on {format(new Date((profile.createdAt as any).seconds ? (profile.createdAt as any).toDate() : profile.createdAt), 'MMMM d, yyyy')}</span>
            </div>
          )}
        </div>
      </header>
      
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCircle2 className="h-6 w-6 text-primary" />
            User Details
          </CardTitle>
          <CardDescription>Public information about {profile.name || 'this user'}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Full Name</p>
            <p className="text-lg text-foreground">{profile.name || '-'}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Username</p>
            <p className="text-lg text-foreground">@{profile.username || '-'}</p>
          </div>
          {profile.gender && profile.gender !== '' && profile.gender !== 'prefer_not_to_say' && (
             <div>
                <p className="text-sm font-medium text-muted-foreground">Gender</p>
                <p className="text-lg text-foreground capitalize">{profile.gender}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {currentUser && currentUser.uid !== profile.uid && chatRoomId && (
          <div className="text-center py-4">
            <Button asChild>
              <Link href={`/chat/${chatRoomId}`}>
                Chat with {profile.name?.split(' ')[0] || 'User'}
              </Link>
            </Button>
          </div>
        )}
    </div>
  );
}
