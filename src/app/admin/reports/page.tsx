
'use client';

import { useEffect, useState, useCallback } from 'react';
import { collection, onSnapshot, orderBy, query, doc, updateDoc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ChatReport, UserProfile, ReportStatus, ChatMessageSnippet } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
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
import { Button } from '@/components/ui/button';
import { Loader2, FileWarning, Check, ShieldQuestion, MessageSquareQuote, UserCircle2 } from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

// Helper to get user initials
const getInitials = (name?: string) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2) : 'U';

export default function AdminReportsPage() {
  const { user: currentAdmin } = useAuth();
  const [reports, setReports] = useState<ChatReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userProfilesCache, setUserProfilesCache] = useState<Record<string, UserProfile | null>>({});
  const { toast } = useToast();

  const fetchUserProfile = useCallback(async (uid: string) => {
    if (userProfilesCache[uid] !== undefined) {
      return userProfilesCache[uid];
    }
    try {
      const userDocRef = doc(db, "users", uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const profile = { uid: userDocSnap.id, ...userDocSnap.data() } as UserProfile;
        setUserProfilesCache(prev => ({ ...prev, [uid]: profile }));
        return profile;
      }
      setUserProfilesCache(prev => ({ ...prev, [uid]: null }));
      return null;
    } catch (error) {
      console.error("Error fetching user profile:", error);
      setUserProfilesCache(prev => ({ ...prev, [uid]: null }));
      return null;
    }
  }, [userProfilesCache]);

  useEffect(() => {
    setIsLoading(true);
    const reportsQuery = query(collection(db, "chat_reports"), orderBy("timestamp", "desc"));
    
    const unsubscribe = onSnapshot(reportsQuery, async (querySnapshot) => {
      const fetchedReports: ChatReport[] = [];
      const uidsToFetch: Set<string> = new Set();

      querySnapshot.forEach((doc) => {
        const reportData = { id: doc.id, ...doc.data() } as ChatReport;
        // Ensure timestamp is a JS Date object or number for date-fns
        if (reportData.timestamp instanceof Timestamp) {
          reportData.timestamp = reportData.timestamp.toDate() as any; // To satisfy formatDistanceToNowStrict
        }
        reportData.lastThreeMessages.forEach(msg => {
            if (msg.timestamp instanceof Timestamp) {
                msg.timestamp = msg.timestamp.toDate() as any;
            }
        });

        fetchedReports.push(reportData);
        uidsToFetch.add(reportData.reportedByUid);
        uidsToFetch.add(reportData.reportedUserUid);
      });

      // Fetch profiles for all unique UIDs not already in cache
      const profilesToFetchPromises = Array.from(uidsToFetch)
        .filter(uid => userProfilesCache[uid] === undefined)
        .map(uid => fetchUserProfile(uid));
      
      await Promise.all(profilesToFetchPromises);

      setReports(fetchedReports);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching reports:", error);
      setIsLoading(false);
      toast({ title: "Error", description: "Could not load reports.", variant: "destructive" });
    });

    return () => unsubscribe();
  }, [fetchUserProfile, toast, userProfilesCache]); // Added userProfilesCache to dependencies

  const handleStatusChange = async (reportId: string, newStatus: ReportStatus) => {
    try {
      const reportDocRef = doc(db, "chat_reports", reportId);
      await updateDoc(reportDocRef, { status: newStatus });
      toast({ title: "Status Updated", description: `Report status changed to ${newStatus}.` });
    } catch (error) {
      console.error("Error updating report status:", error);
      toast({ title: "Update Failed", description: "Could not update report status.", variant: "destructive" });
    }
  };

  const getStatusBadgeVariant = (status: ReportStatus) => {
    switch (status) {
      case "Pending":
        return "default"; // Blue
      case "Reviewed - No Action":
        return "secondary"; // Gray
      case "Reviewed - Action Taken":
        return "destructive"; // Red
      default:
        return "outline";
    }
  };

  const renderUserProfileLink = (uid: string, name?: string, username?: string) => {
    const profile = userProfilesCache[uid];
    const displayName = name || profile?.name || username || profile?.username || uid;
    return (
        <Link href={`/admin/users?highlight=${uid}`} className="hover:underline text-primary flex items-center gap-1">
             <UserCircle2 size={16} className="inline-block" /> {displayName}
        </Link>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Loading reports...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center">
            <FileWarning className="mr-3 h-7 w-7 text-primary" /> Chat Reports
          </h1>
          <p className="text-muted-foreground">Review and manage user-submitted chat reports.</p>
        </div>
      </header>

      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle>All Reports ({reports.length})</CardTitle>
          <CardDescription>
            List of all chat reports submitted by users. Review messages and take appropriate action.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reported By</TableHead>
                <TableHead>User Reported</TableHead>
                <TableHead>Chat ID</TableHead>
                <TableHead>Reported At</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[300px]">Last 3 Messages</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.length === 0 && !isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No reports found.
                  </TableCell>
                </TableRow>
              ) : (
                reports.map((report) => {
                  const reportedByProfile = userProfilesCache[report.reportedByUid];
                  const reportedUserProxy = userProfilesCache[report.reportedUserUid];
                  return (
                    <TableRow key={report.id}>
                      <TableCell className="font-medium">
                        {renderUserProfileLink(report.reportedByUid, report.reportedUserName || reportedByProfile?.name, reportedByProfile?.username)}
                      </TableCell>
                      <TableCell className="font-medium text-destructive">
                        {renderUserProfileLink(report.reportedUserUid, report.targetUserName || reportedUserProxy?.name, reportedUserProxy?.username)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <Link href={`/chat/${report.chatRoomId}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {report.chatRoomId.substring(0,15)}...
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {report.timestamp ? formatDistanceToNowStrict(new Date(report.timestamp as any), { addSuffix: true }) : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(report.status)}>{report.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1.5 max-w-xs text-xs">
                            {report.lastThreeMessages.length > 0 ? report.lastThreeMessages.map((msg, index) => (
                                <div key={index} className="p-1.5 bg-muted/50 rounded text-muted-foreground break-words">
                                    <span className="font-semibold text-foreground/80">{msg.senderName || msg.senderId.substring(0,6)}:</span> {msg.text || <span className="italic">(File/Media)</span>}
                                    <div className="text-right opacity-70 text-[0.65rem]">{msg.timestamp ? format(new Date(msg.timestamp as any), 'MMM d, HH:mm') : ''}</div>
                                </div>
                            )) : <span className="italic text-muted-foreground">No messages captured.</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Select
                            defaultValue={report.status}
                            onValueChange={(value) => handleStatusChange(report.id, value as ReportStatus)}
                        >
                            <SelectTrigger className="w-[180px] h-9 text-xs">
                                <SelectValue placeholder="Change Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Pending">Pending</SelectItem>
                                <SelectItem value="Reviewed - No Action">Reviewed - No Action</SelectItem>
                                <SelectItem value="Reviewed - Action Taken">Reviewed - Action Taken</SelectItem>
                            </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
         {reports.length > 0 && (
            <CardFooter className="text-xs text-muted-foreground">
                <p>Admins can manage user accounts (disable, etc.) via the <Link href="/admin/users" className="underline hover:text-primary">User Management</Link> page.</p>
            </CardFooter>
        )}
      </Card>
    </div>
  );
}
