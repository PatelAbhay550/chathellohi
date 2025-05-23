
'use client';

import { useState, FormEvent } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Search as SearchIcon, UserPlus, MessageCircle, Loader2 } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"; // Changed import
import type { UserProfile } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit, serverTimestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link'; // Added Link

const getInitials = (name?: string) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2) : 'U';

export default function SearchPage() {
  const { user: currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState<string | null>(null); 
  const router = useRouter();
  const { toast } = useToast();

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim() || !currentUser) {
      setSearchResults([]);
      return;
    }
    setIsLoading(true);
    setSearchResults([]); 
    try {
      const usersRef = collection(db, "users");
      const q = query(
        usersRef,
        where("username", ">=", searchTerm.toLowerCase()), // Search lowercase username
        where("username", "<=", searchTerm.toLowerCase() + '\uf8ff'),
        limit(10)
      );
      
      const querySnapshot = await getDocs(q);
      const users: UserProfile[] = [];
      querySnapshot.forEach((doc) => {
        if (doc.id !== currentUser.uid) { 
          users.push({ uid: doc.id, ...doc.data() } as UserProfile);
        }
      });
      setSearchResults(users);

    } catch (error) {
      console.error("Error searching users:", error);
      toast({ title: "Search Failed", description: "Could not perform search.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartChat = async (targetUser: UserProfile) => {
    if (!currentUser) return;
    setIsCreatingChat(targetUser.uid);

    const participantIds = [currentUser.uid, targetUser.uid].sort();
    const chatRoomId = participantIds.join('_'); 

    try {
      const chatRoomRef = doc(db, "chat_rooms", chatRoomId);
      const chatRoomSnap = await getDoc(chatRoomRef);

      if (chatRoomSnap.exists()) {
        router.push(`/chat/${chatRoomId}`);
      } else {
        // Fetch current user's profile for name denormalization in lastMessage (if needed by chat list)
        const currentUserDocRef = doc(db, "users", currentUser.uid);
        const currentUserSnap = await getDoc(currentUserDocRef);
        const currentUserProfile = currentUserSnap.exists() ? currentUserSnap.data() as UserProfile : null;

        await setDoc(chatRoomRef, {
          participants: participantIds,
          participantDetails: { // Optional: Store basic details for easier display in chat list
            [currentUser.uid]: { name: currentUserProfile?.name || currentUser.email?.split('@')[0], profileImageUrl: currentUserProfile?.profileImageUrl || '' },
            [targetUser.uid]: { name: targetUser.name, profileImageUrl: targetUser.profileImageUrl || '' },
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastMessage: null,
        });
        router.push(`/chat/${chatRoomId}`);
      }
    } catch (error) {
      console.error("Error starting chat:", error);
      toast({ title: "Chat Error", description: "Could not start chat.", variant: "destructive" });
    } finally {
      setIsCreatingChat(null);
    }
  };


  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Search Users</h1>
        <p className="text-muted-foreground">Find and connect with other Hellohi users by username.</p>
      </header>

      <Card className="shadow-lg">
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex items-center space-x-2">
            <Input
              type="search"
              placeholder="Search by username..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-grow"
              aria-label="Search users"
            />
            <Button type="submit" disabled={isLoading || !currentUser}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SearchIcon className="mr-2 h-4 w-4" />}
              {isLoading ? 'Searching...' : 'Search'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {searchResults.length > 0 && (
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Search Results</CardTitle>
            <CardDescription>{searchResults.length} user(s) found matching &quot;{searchTerm}&quot;.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {searchResults.map(userResult => (
                <li key={userResult.uid} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg hover:bg-secondary/60 transition-colors">
                  <div className="flex items-center space-x-3">
                    <Link href={`/profile/${userResult.uid}`}>
                      <Avatar className="h-10 w-10 cursor-pointer hover:opacity-80 transition-opacity">
                        <AvatarImage src={userResult.profileImageUrl} alt={userResult.name} data-ai-hint="avatar profile"/>
                        <AvatarFallback>{getInitials(userResult.name)}</AvatarFallback>
                      </Avatar>
                    </Link>
                    <div>
                       <Link href={`/profile/${userResult.uid}`} className="hover:underline">
                        <p className="font-semibold text-foreground">{userResult.name || 'User'}</p>
                      </Link>
                      <p className="text-sm text-muted-foreground">@{userResult.username || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="space-x-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleStartChat(userResult)}
                      disabled={isCreatingChat === userResult.uid || currentUser?.uid === userResult.uid}
                    >
                      {isCreatingChat === userResult.uid ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-1 h-4 w-4" />}
                       Chat
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {!isLoading && searchTerm && searchResults.length === 0 && (
         <p className="text-center text-muted-foreground pt-4">No users found for &quot;{searchTerm}&quot;.</p>
      )}
    </div>
  );
}
