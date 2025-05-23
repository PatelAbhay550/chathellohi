
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation'; // Added
import { collection, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users } from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { UserTableActions } from '@/components/admin/user-table-actions';
import { cn } from '@/lib/utils'; // Added

export default function AdminUsersPage() {
  const { user: currentAdmin } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const searchParams = useSearchParams(); // Added
  const highlightedUserId = searchParams.get('highlight'); // Added

  useEffect(() => {
    setIsLoading(true);
    const usersQuery = query(collection(db, "users"), orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(usersQuery, (querySnapshot) => {
      const fetchedUsers: UserProfile[] = [];
      querySnapshot.forEach((doc) => {
        fetchedUsers.push({ uid: doc.id, ...doc.data() } as UserProfile);
      });
      setUsers(fetchedUsers);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching users:", error);
      setIsLoading(false);
      // Add toast notification for error
    });

    return () => unsubscribe();
  }, []);

  const getInitials = (name?: string) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2) : 'U';

  const formatDisabledUntil = (timestamp: UserProfile['disabledUntil']) => {
    if (!timestamp) return 'N/A';
    let date: Date;
    if (timestamp instanceof Timestamp) {
      date = timestamp.toDate();
    } else if (typeof timestamp === 'number') {
      date = new Date(timestamp);
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else {
      return 'Invalid Date';
    }
    
    if (date > new Date()) {
      return `${format(date, "MMM d, yyyy HH:mm")} (${formatDistanceToNowStrict(date, { addSuffix: true })})`;
    }
    return 'Ended';
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center">
            <Users className="mr-3 h-7 w-7 text-primary" /> User Management
          </h1>
          <p className="text-muted-foreground">View and manage all registered users.</p>
        </div>
      </header>

      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle>All Users ({users.length})</CardTitle>
          <CardDescription>
            List of all users in the system. Admins can temporarily disable user accounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Avatar</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Disabled Until</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 && !isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => {
                  const isEffectivelyDisabled = user.isDisabled && user.disabledUntil &&
                                              (user.disabledUntil instanceof Timestamp ? user.disabledUntil.toDate() : new Date(user.disabledUntil as any)) > new Date();
                  return (
                    <TableRow 
                      key={user.uid}
                      className={cn(highlightedUserId === user.uid ? 'bg-primary/10 ring-1 ring-primary/50' : '')} // Added conditional class
                    >
                      <TableCell>
                        <Avatar className="h-10 w-10 border">
                          <AvatarImage src={user.profileImageUrl} alt={user.name} data-ai-hint="avatar profile"/>
                          <AvatarFallback className="bg-muted text-muted-foreground text-xs">{getInitials(user.name)}</AvatarFallback>
                        </Avatar>
                      </TableCell>
                      <TableCell className="font-medium text-foreground">{user.name || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">@{user.username || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        {user.isAdmin ? (
                           <Badge variant="default" className="bg-purple-500 hover:bg-purple-600">Admin</Badge>
                        ) : isEffectivelyDisabled ? (
                          <Badge variant="destructive">Disabled</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-green-500 hover:bg-green-600 text-white">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {isEffectivelyDisabled ? formatDisabledUntil(user.disabledUntil) : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right">
                        <UserTableActions user={user} currentAdminId={currentAdmin?.uid} />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
