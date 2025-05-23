
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/use-auth';
import type { UserProfile } from '@/types';
import { db } from '@/lib/firebase';
import { collection, query, getDocs, addDoc, serverTimestamp, where, documentId } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, Search } from 'lucide-react';

const getInitials = (name?: string) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : 'U';

export default function NewGroupPage() {
  const { user: currentUser, userProfile: currentUserProfile } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [groupName, setGroupName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      if (!currentUser) return;
      setIsLoadingUsers(true);
      try {
        const usersRef = collection(db, 'users');
        // Exclude current user from the list of users to add
        const q = query(usersRef, where(documentId(), "!=", currentUser.uid));
        const querySnapshot = await getDocs(q);
        const usersData = querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
        setAllUsers(usersData);
      } catch (error) {
        console.error('Error fetching users:', error);
        toast({ title: 'Error', description: 'Could not fetch users.', variant: 'destructive' });
      } finally {
        setIsLoadingUsers(false);
      }
    };
    fetchUsers();
  }, [currentUser, toast]);

  const handleUserSelect = (uid: string) => {
    setSelectedUsers(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(uid)) {
        newSelection.delete(uid);
      } else {
        newSelection.add(uid);
      }
      return newSelection;
    });
  };

  const handleCreateGroup = async () => {
    if (!currentUser || !currentUserProfile) {
      toast({ title: 'Error', description: 'You must be logged in.', variant: 'destructive' });
      return;
    }
    if (!groupName.trim()) {
      toast({ title: 'Error', description: 'Group name cannot be empty.', variant: 'destructive' });
      return;
    }
    if (selectedUsers.size < 1) { // At least one other member for a group
      toast({ title: 'Error', description: 'Please select at least one member for the group.', variant: 'destructive' });
      return;
    }

    setIsCreatingGroup(true);
    const participantIds = [currentUser.uid, ...Array.from(selectedUsers)];
    
    const participantDetails: Record<string, { name?: string; profileImageUrl?: string }> = {};
    participantDetails[currentUser.uid] = { name: currentUserProfile.name, profileImageUrl: currentUserProfile.profileImageUrl };
    selectedUsers.forEach(uid => {
        const user = allUsers.find(u => u.uid === uid);
        if(user) {
            participantDetails[uid] = { name: user.name, profileImageUrl: user.profileImageUrl };
        }
    });


    try {
      const newGroupRef = await addDoc(collection(db, 'chat_rooms'), {
        isGroup: true,
        groupName: groupName.trim(),
        participants: participantIds,
        participantDetails: participantDetails,
        admins: [currentUser.uid],
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessage: null,
      });
      toast({ title: 'Group Created!', description: `${groupName} has been created.` });
      router.push(`/chat/${newGroupRef.id}`);
    } catch (error) {
      console.error('Error creating group:', error);
      toast({ title: 'Error', description: 'Could not create group.', variant: 'destructive' });
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const filteredUsers = allUsers.filter(user =>
    user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Create New Group</h1>
        <p className="text-muted-foreground">Assemble your team, friends, or family.</p>
      </header>

      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle>Group Details</CardTitle>
          <CardDescription>Name your group and add members.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label htmlFor="groupName">Group Name</Label>
            <Input
              id="groupName"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Enter group name"
              maxLength={50}
            />
          </div>
          <div>
            <Label>Add Members ({selectedUsers.size} selected)</Label>
            <Input
              type="search"
              placeholder="Search users by name or username..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="mt-1 mb-3"
              icon={<Search className="h-4 w-4" />}
            />
            {isLoadingUsers ? (
              <div className="flex justify-center items-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="ml-2">Loading users...</p>
              </div>
            ) : (
              <ScrollArea className="h-64 border rounded-md p-2">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map(user => (
                    <div
                      key={user.uid}
                      className="flex items-center space-x-3 p-2.5 hover:bg-accent rounded-md transition-colors cursor-pointer"
                      onClick={() => handleUserSelect(user.uid)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleUserSelect(user.uid);}}
                      tabIndex={0}
                      role="checkbox"
                      aria-checked={selectedUsers.has(user.uid)}
                    >
                      <Checkbox
                        id={`user-${user.uid}`}
                        checked={selectedUsers.has(user.uid)}
                        onCheckedChange={() => handleUserSelect(user.uid)}
                        className="border-primary"
                      />
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={user.profileImageUrl} alt={user.name} data-ai-hint="avatar profile" />
                        <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{user.name}</p>
                        <p className="text-xs text-muted-foreground">@{user.username}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {allUsers.length === 0 ? "No users available to add." : "No users match your search."}
                  </p>
                )}
              </ScrollArea>
            )}
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleCreateGroup} disabled={isCreatingGroup || isLoadingUsers} className="w-full sm:w-auto ml-auto">
            {isCreatingGroup ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Users className="mr-2 h-4 w-4" />
            )}
            Create Group
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
