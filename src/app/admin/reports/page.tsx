
'use client';

import { useEffect, useState, useCallback } from 'react';
import { collection, onSnapshot, orderBy, query, doc, updateDoc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ChatReport, UserProfile, ReportStatus } from '@/types'; // Removed ChatMessageSnippet as it's part of ChatReport
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, FileWarning, UserCircle2, MessageSquareQuote, Save } from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';

const getInitials = (name?: string) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2) : 'U';

interface EditableChatReport extends ChatReport {
  editableAdminNotes?: string;
}

export default function AdminReportsPage() {
  const { user: currentAdmin } = useAuth();
  const [reports, setReports] = useState<EditableChatReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userProfilesCache, setUserProfilesCache] = useState<Record<string, UserProfile | null>>({});
  const [savingNotesFor, setSavingNotesFor] = useState<string | null>(null);
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
      const fetchedReports: EditableChatReport[] = [];
      const uidsToFetch: Set<string> = new Set();

      querySnapshot.forEach((docSnap) => {
        const reportData = { id: docSnap.id, ...docSnap.data() } as ChatReport;
        if (reportData.timestamp instanceof Timestamp) {
          reportData.timestamp = reportData.timestamp.toDate() as any; 
        }
        reportData.lastThreeMessages.forEach(msg => {
            if (msg.timestamp instanceof Timestamp) {
                msg.timestamp = msg.timestamp.toDate() as any;
            }
        });

        fetchedReports.push({ ...reportData, editableAdminNotes: reportData.adminNotes || '' });
        uidsToFetch.add(reportData.reportedByUid);
        uidsToFetch.add(reportData.reportedUserUid || ''); // Handle case where reportedUserUid might be undefined initially
      });

      const profilesToFetchPromises = Array.from(uidsToFetch)
        .filter(uid => uid && userProfilesCache[uid] === undefined) // Ensure uid is not empty
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
  }, [fetchUserProfile, toast, userProfilesCache]);

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
  
  const handleNotesChange = (reportId: string, notes: string) => {
    setReports(prevReports => prevReports.map(r => r.id === reportId ? { ...r, editableAdminNotes: notes } : r));
  };

  const handleSaveNotes = async (reportId: string) => {
    const report = reports.find(r => r.id === reportId);
    if (!report) return;
    setSavingNotesFor(reportId);
    try {
      const reportDocRef = doc(db, "chat_reports", reportId);
      await updateDoc(reportDocRef, { adminNotes: report.editableAdminNotes });
      toast({ title: "Notes Saved", description: "Admin notes have been updated." });
    } catch (error) {
      console.error("Error saving notes:", error);
      toast({ title: "Save Failed", description: "Could not save admin notes.", variant: "destructive" });
    } finally {
      setSavingNotesFor(null);
    }
  };


  const getStatusBadgeVariant = (status: ReportStatus) => {
    switch (status) {
      case "Pending":
        return "default"; 
      case "Reviewed - No Action":
        return "secondary"; 
      case "Reviewed - Action Taken":
        return "destructive"; 
      default:
        return "outline";
    }
  };

  const renderUserProfileLink = (uid?: string, name?: string, username?: string) => {
    if (!uid) return <span className="text-muted-foreground">N/A</span>;
    const profile = userProfilesCache[uid];
    const displayName = name || profile?.name || username || profile?.username || uid.substring(0,8);
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
            List of all chat reports. Review messages, add notes, and take appropriate action.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reported By</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Chat ID</TableHead>
                <TableHead>Reported At</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[250px]">Last 3 Messages</TableHead>
                <TableHead className="w-[250px]">Admin Notes</TableHead>
                <TableHead className="text-right w-[200px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.length === 0 && !isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    No reports found.
                  </TableCell>
                </TableRow>
              ) : (
                reports.map((report) => {
                  const reportedByProfile = userProfilesCache[report.reportedByUid];
                  const reportedUserProxy = report.reportedUserUid ? userProfilesCache[report.reportedUserUid] : null;
                  return (
                    <TableRow key={report.id}>
                      <TableCell className="font-medium align-top">
                        {renderUserProfileLink(report.reportedByUid, report.reportedUserName || reportedByProfile?.name, reportedByProfile?.username)}
                      </TableCell>
                      <TableCell className="font-medium text-destructive align-top">
                         {report.isGroupReport 
                            ? <span className="flex items-center gap-1"><MessageSquareQuote size={16}/> {report.targetUserName || `Group: ${report.chatRoomId.substring(0,8)}`}</span>
                            : renderUserProfileLink(report.reportedUserUid, report.targetUserName || reportedUserProxy?.name, reportedUserProxy?.username)
                         }
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground align-top">
                        <Link href={`/chat/${report.chatRoomId}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {report.chatRoomId.substring(0,15)}...
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground align-top">
                        {report.timestamp ? formatDistanceToNowStrict(new Date(report.timestamp as any), { addSuffix: true }) : 'N/A'}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant={getStatusBadgeVariant(report.status)}>{report.status}</Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="space-y-1.5 max-w-xs text-xs">
                            {report.lastThreeMessages.length > 0 ? report.lastThreeMessages.map((msg, index) => (
                                <div key={index} className="p-1.5 bg-muted/50 rounded text-muted-foreground break-words">
                                    <span className="font-semibold text-foreground/80">{msg.senderName || msg.senderId.substring(0,6)}:</span> {msg.text || <span className="italic">(File/Media)</span>}
                                    <div className="text-right opacity-70 text-[0.65rem]">{msg.timestamp ? format(new Date(msg.timestamp as any), 'MMM d, HH:mm') : ''}</div>
                                </div>
                            )) : <span className="italic text-muted-foreground">No messages captured.</span>}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-col space-y-1">
                          <Textarea 
                            value={report.editableAdminNotes}
                            onChange={(e) => handleNotesChange(report.id, e.target.value)}
                            placeholder="Add internal notes..."
                            rows={3}
                            className="text-xs"
                          />
                          <Button 
                            size="xs" 
                            onClick={() => handleSaveNotes(report.id)} 
                            disabled={savingNotesFor === report.id}
                            className="self-end"
                          >
                            {savingNotesFor === report.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                            Save
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right align-top">
                        <Select
                            defaultValue={report.status}
                            onValueChange={(value) => handleStatusChange(report.id, value as ReportStatus)}
                        >
                            <SelectTrigger className="w-full h-9 text-xs">
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
                <p>Admins can manage user accounts via the <Link href="/admin/users" className="underline hover:text-primary">User Management</Link> page.</p>
            </CardFooter>
        )}
      </Card>
    </div>
  );
}
