
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation'; 
import { collection, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from 'next/link'; 
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
import { Loader2, Users, CalendarClock } from 'lucide-react';
import { format, formatDistanceToNowStrict, isValid } from 'date-fns';
import { UserTableActions } from '@/components/admin/user-table-actions';
import { cn } from '@/lib/utils'; 

export default function AdminUsersPage() {
  const { user: currentAdmin } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const searchParams = useSearchParams(); 
  const highlightedUserId = searchParams.get('highlight'); 

  useEffect(() => {
    setIsLoading(true);
    const usersQuery = query(collection(db, "users"), orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(usersQuery, (querySnapshot) => {
      const fetchedUsers: UserProfile[] = [];
      querySnapshot.forEach((doc) => {
        const userData = doc.data();
        const profile = { 
          uid: doc.id, 
          ...userData,
          createdAt: userData.createdAt instanceof Timestamp ? userData.createdAt.toMillis() : userData.createdAt,
          disabledUntil: userData.disabledUntil instanceof Timestamp ? userData.disabledUntil.toMillis() : userData.disabledUntil,
          lastLoginAt: userData.lastLoginAt instanceof Timestamp ? userData.lastLoginAt.toMillis() : userData.lastLoginAt,
        } as UserProfile;
        fetchedUsers.push(profile);
      });
      setUsers(fetchedUsers);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching users:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getInitials = (name?: string) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2) : 'U';

  const formatUserTimestamp = (timestamp: UserProfile['disabledUntil'] | UserProfile['lastLoginAt']) => {
    if (!timestamp) return 'N/A';
    let date: Date;
    if (typeof timestamp === 'number') {
      date = new Date(timestamp);
    } else if (timestamp instanceof Timestamp) { 
      date = timestamp.toDate();
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else {
      return 'Invalid Date';
    }
    
    if (!isValid(date)) return 'Invalid Date';
    return `${format(date, "MMM d, yyyy HH:mm")} (${formatDistanceToNowStrict(date, { addSuffix: true })})`;
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
            List of all users. Admins can temporarily disable or permanently ban user accounts.
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
                <TableHead>Last Login</TableHead>
                <TableHead>Disabled Until</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 && !isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => {
                  const disabledUntilDate = user.disabledUntil ? 
                                          (typeof user.disabledUntil === 'number' ? new Date(user.disabledUntil) : (user.disabledUntil as Timestamp)?.toDate?.()) 
                                          : null;
                  const isTemporarilyDisabled = user.isDisabled && !user.isPermanentlyBanned && disabledUntilDate && isValid(disabledUntilDate) && disabledUntilDate > new Date();
                  
                  let statusBadge;
                  if (user.isPermanentlyBanned) {
                    statusBadge = <Badge variant="destructive" className="bg-red-700 hover:bg-red-800">Banned</Badge>;
                  } else if (user.isAdmin) {
                    statusBadge = <Badge variant="default" className="bg-purple-500 hover:bg-purple-600">Admin</Badge>;
                  } else if (isTemporarilyDisabled) {
                    statusBadge = <Badge variant="destructive">Disabled</Badge>;
                  } else {
                    statusBadge = <Badge variant="secondary" className="bg-green-500 hover:bg-green-600 text-white">Active</Badge>;
                  }
                  
                  return (
                    <TableRow 
                      key={user.uid}
                      className={cn(highlightedUserId === user.uid ? 'bg-primary/10 ring-1 ring-primary/50' : '')} 
                    >
                      <TableCell>
                        <Link href={`/profile/${user.uid}`} target="_blank" rel="noopener noreferrer">
                          <Avatar className="h-10 w-10 border hover:opacity-80 transition-opacity">
                            <AvatarImage src={user.profileImageUrl} alt={user.name} data-ai-hint="avatar profile"/>
                            <AvatarFallback className="bg-muted text-muted-foreground text-xs">{getInitials(user.name)}</AvatarFallback>
                          </Avatar>
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        <Link href={`/profile/${user.uid}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {user.name || '-'}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">@{user.username || 'N/A'}</TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>{statusBadge}</TableCell>
                       <TableCell className="text-xs text-muted-foreground">
                        {user.lastLoginAt ? formatUserTimestamp(user.lastLoginAt) : 'Never'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {isTemporarilyDisabled ? formatUserTimestamp(user.disabledUntil) : 'N/A'}
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
