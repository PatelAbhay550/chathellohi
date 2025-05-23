
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MessageSquareText, Users, Image as ImageIconLucide, Heart, FileText, Bell, Loader2 } from "lucide-react"; // Added Loader2
import Image from "next/image";
import type { StatusUpdate, UserProfile, ChatRoom, DashboardChatRoomDisplay, ChatMessage } from "@/types";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, limit, getDocs, where, doc, updateDoc, arrayUnion, arrayRemove, getDoc, Timestamp, onSnapshot, documentId } from "firebase/firestore"; // Added documentId
import Link from "next/link";
import { useRouter } from 'next/navigation';
import { formatDistanceToNowStrict } from 'date-fns';
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"; // Added Dialog components
import { ScrollArea } from "@/components/ui/scroll-area"; // Added ScrollArea

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [statusUpdates, setStatusUpdates] = useState<StatusUpdate[]>([]);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [unreadChats, setUnreadChats] = useState<DashboardChatRoomDisplay[]>([]);
  const [isLoadingUnreadChats, setIsLoadingUnreadChats] = useState(true);
  const [stats, setStats] = useState({
    recentChats: 0,
    mediaShared: 0,
  });
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const [isLikersDialogOpen, setIsLikersDialogOpen] = useState(false);
  const [likersToShow, setLikersToShow] = useState<UserProfile[]>([]);
  const [loadingLikers, setLoadingLikers] = useState(false);
  const [selectedStatusForLikers, setSelectedStatusForLikers] = useState<StatusUpdate | null>(null);


  const getInitials = (name?: string) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2) : 'U';

  useEffect(() => {
    async function fetchStatusUpdates() {
      if (!user) return;
      setIsLoadingStatus(true);
      try {
        const statusQuery = query(
          collection(db, "status_updates"),
          orderBy("createdAt", "desc"),
          limit(10)
        );
        const querySnapshot = await getDocs(statusQuery);
        const updates = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: (doc.data().createdAt as Timestamp)?.toMillis?.() || doc.data().createdAt || Date.now(),
        })) as StatusUpdate[];
        setStatusUpdates(updates);
      } catch (error) {
        console.error("Error fetching status updates:", error);
        toast({title: "Error", description: "Failed to load status updates.", variant: "destructive"});
      } finally {
        setIsLoadingStatus(false);
      }
    }

    async function fetchDashboardStats() {
      if (!user) return;
      setIsLoadingStats(true);
      try {
        const chatsQuery = query(collection(db, "chat_rooms"), where("participants", "array-contains", user.uid));
        const chatsSnapshot = await getDocs(chatsQuery);
        setStats(prev => ({ ...prev, recentChats: chatsSnapshot.size }));

        let mediaCount = 0;
        const statusWithImagesQuery = query(
            collection(db, "status_updates"),
            where("userId", "==", user.uid),
            where("imageUrl", "!=", null),
            where("imageUrl", "!=", "")
        );
        const statusWithImagesSnapshot = await getDocs(statusWithImagesQuery);
        mediaCount += statusWithImagesSnapshot.size;
        setStats(prev => ({ ...prev, mediaShared: mediaCount }));
      } catch (error) {
        console.error("Error fetching dashboard stats:", error);
      } finally {
        setIsLoadingStats(false);
      }
    }

    if (user) {
      fetchStatusUpdates();
      fetchDashboardStats();
    }
  }, [user, toast]);

  useEffect(() => {
    if (!user) {
      setIsLoadingUnreadChats(false);
      return;
    }
    setIsLoadingUnreadChats(true);
    const chatsQuery = query(
      collection(db, "chat_rooms"),
      where("participants", "array-contains", user.uid)
    );

    const unsubscribe = onSnapshot(chatsQuery, async (querySnapshot) => {
      const fetchedUnreadChats: DashboardChatRoomDisplay[] = [];
      for (const chatDoc of querySnapshot.docs) {
        const chatRoomData = chatDoc.data() as ChatRoom;
        chatRoomData.id = chatDoc.id;

        if (
          chatRoomData.lastMessage &&
          chatRoomData.lastMessage.senderId !== user.uid &&
          chatRoomData.lastMessage.status !== 'seen'
        ) {
          const otherParticipantId = chatRoomData.participants.find(pId => pId !== user.uid);
          let otherParticipantProfile: UserProfile | null = null;

          if (otherParticipantId) {
            const userDocRef = doc(db, "users", otherParticipantId);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
              otherParticipantProfile = { uid: userDocSnap.id, ...userDocSnap.data()} as UserProfile;
            }
          }

          const displayChat: DashboardChatRoomDisplay = {
            ...chatRoomData,
            otherParticipant: otherParticipantProfile,
            createdAt: (chatRoomData.createdAt as Timestamp)?.toMillis?.() || chatRoomData.createdAt,
            updatedAt: (chatRoomData.updatedAt as Timestamp)?.toMillis?.() || chatRoomData.updatedAt,
          };
          if (displayChat.lastMessage?.timestamp) {
            displayChat.lastMessage.timestamp = (displayChat.lastMessage.timestamp as Timestamp)?.toMillis?.() || displayChat.lastMessage.timestamp;
          }

          fetchedUnreadChats.push(displayChat);
        }
      }
      fetchedUnreadChats.sort((a, b) => (b.lastMessage?.timestamp as number || 0) - (a.lastMessage?.timestamp as number || 0));
      setUnreadChats(fetchedUnreadChats);
      setIsLoadingUnreadChats(false);
    }, (error) => {
      console.error("Error fetching unread chats:", error);
      toast({title: "Error", description: "Failed to load unread messages.", variant: "destructive"});
      setIsLoadingUnreadChats(false);
    });

    return () => unsubscribe();
  }, [user, toast]);

  const handleLikeStatus = async (statusId: string) => {
    if (!user) return;
    const statusRef = doc(db, "status_updates", statusId);
    const status = statusUpdates.find(s => s.id === statusId);
    if (!status) return;

    const alreadyLiked = status.likes?.includes(user.uid);

    try {
      if (alreadyLiked) {
        await updateDoc(statusRef, { likes: arrayRemove(user.uid) });
        setStatusUpdates(prev => prev.map(s => s.id === statusId ? { ...s, likes: s.likes?.filter(uid => uid !== user.uid) } : s));
        // Update selectedStatusForLikers if it's the one being unliked by the current user
        if (selectedStatusForLikers?.id === statusId) {
            setSelectedStatusForLikers(prevStatus => prevStatus ? ({
                ...prevStatus,
                likes: prevStatus.likes?.filter(uid => uid !== user.uid)
            }) : null);
             setLikersToShow(prevLikers => prevLikers.filter(liker => liker.uid !== user.uid));
        }
      } else {
        await updateDoc(statusRef, { likes: arrayUnion(user.uid) });
        const currentUserProfileDoc = await getDoc(doc(db, 'users', user.uid));
        const currentUserProfileData = currentUserProfileDoc.exists() ? { uid: user.uid, ...currentUserProfileDoc.data()} as UserProfile : null;

        setStatusUpdates(prev => prev.map(s => s.id === statusId ? { ...s, likes: [...(s.likes || []), user.uid] } : s));
         // Update selectedStatusForLikers if it's the one being liked by the current user
        if (selectedStatusForLikers?.id === statusId && currentUserProfileData) {
             setSelectedStatusForLikers(prevStatus => prevStatus ? ({
                ...prevStatus,
                likes: [...(prevStatus.likes || []), user.uid]
            }) : null);
            setLikersToShow(prevLikers => [...prevLikers, currentUserProfileData]);
        }
      }
    } catch (error) {
      console.error("Error liking status:", error);
      toast({title: "Error", description: "Failed to update like.", variant: "destructive"});
    }
  };

  const fetchAndShowLikers = async (status: StatusUpdate) => {
    if (!status.likes || status.likes.length === 0) {
      setLikersToShow([]);
      setSelectedStatusForLikers(status);
      setIsLikersDialogOpen(true);
      return;
    }
    setLoadingLikers(true);
    setSelectedStatusForLikers(status);
    setIsLikersDialogOpen(true);
    try {
      // Firestore 'in' query limit is 30
      const likerUids = status.likes.slice(0, 30);
      const usersQuery = query(collection(db, "users"), where(documentId(), "in", likerUids));
      const querySnapshot = await getDocs(usersQuery);
      const fetchedLikers = querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      setLikersToShow(fetchedLikers);
    } catch (error) {
      console.error("Error fetching likers:", error);
      toast({ title: "Error", description: "Could not fetch likers.", variant: "destructive" });
      setLikersToShow([]);
    } finally {
      setLoadingLikers(false);
    }
  };

  const statCards = [
    { title: "Recent Chats", value: stats.recentChats.toString(), icon: MessageSquareText, color: "text-blue-500", loading: isLoadingStats },
    { title: "Media Shared (Statuses)", value: stats.mediaShared.toString(), icon: ImageIconLucide, color: "text-purple-500", loading: isLoadingStats },
  ];

  const renderLastMessagePreview = (message?: Partial<ChatMessage>) => {
    if (!message) return "No messages yet.";
    if (message.fileType === 'image') return <><ImageIconLucide className="inline mr-1 h-4 w-4" /> Image: {message.fileName || 'Image'}</>;
    if (message.fileType) return <><FileText className="inline mr-1 h-4 w-4" /> File: {message.fileName || 'File'}</>;
    return message.text || "Empty message";
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Welcome to Hellohi! Here&apos;s a quick overview.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat) => (
          <Card key={stat.title} className="shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              {stat.loading ? <Skeleton className="h-8 w-1/4 my-1" /> : <div className="text-2xl font-bold text-foreground">{stat.value}</div> }
            </CardContent>
          </Card>
        ))}
         <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 md:col-span-1 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Your Contacts
              </CardTitle>
              <Users className="h-5 w-5 text-green-500" />
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">Connect with users by searching for them.</p>
                <Button asChild size="sm" className="mt-2">
                    <Link href="/search">Find Users</Link>
                </Button>
            </CardContent>
        </Card>
      </div>

      {isLoadingUnreadChats && (
         <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center"><Bell className="mr-2 h-5 w-5 text-primary" /> Unread Messages</CardTitle>
              <CardDescription>Checking for new messages...</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({length: 2}).map((_, i) => (
                <div key={`skel-unread-${i}`} className="flex items-center space-x-3 p-3 bg-secondary/30 rounded-lg">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </CardContent>
         </Card>
      )}

      {!isLoadingUnreadChats && unreadChats.length > 0 && (
        <Card className="shadow-lg border-2 border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center"><Bell className="mr-2 h-5 w-5 text-primary animate-pulse" /> Unread Messages</CardTitle>
            <CardDescription>You have new messages in these chats.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {unreadChats.map((chat) => (
              <Link key={chat.id} href={`/chat/${chat.id}`} className="block p-3 rounded-lg hover:bg-accent transition-colors border border-border">
                <div className="flex items-center space-x-3">
                  {chat.otherParticipant && (
                    <div
                      onClick={(e) => {
                        e.preventDefault(); // Prevent outer Link navigation
                        e.stopPropagation();
                        router.push(`/profile/${chat.otherParticipant!.uid}`);
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && chat.otherParticipant) {
                          e.preventDefault();
                          e.stopPropagation();
                          router.push(`/profile/${chat.otherParticipant.uid}`);
                        }
                      }}
                      className="relative z-10 cursor-pointer"
                      role="link"
                      tabIndex={0}
                    >
                      <Avatar className="h-10 w-10 border hover:opacity-80 transition-opacity">
                        <AvatarImage src={chat.otherParticipant?.profileImageUrl} alt={chat.otherParticipant?.name} data-ai-hint="avatar profile"/>
                        <AvatarFallback className="bg-muted text-muted-foreground">{getInitials(chat.otherParticipant?.name)}</AvatarFallback>
                      </Avatar>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div
                       onClick={(e) => {
                        e.preventDefault(); // Prevent outer Link navigation
                        e.stopPropagation();
                        if (chat.otherParticipant) {
                           router.push(`/profile/${chat.otherParticipant.uid}`);
                        }
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && chat.otherParticipant) {
                          e.preventDefault();
                          e.stopPropagation();
                          router.push(`/profile/${chat.otherParticipant.uid}`);
                        }
                      }}
                      className="font-semibold text-foreground truncate cursor-pointer hover:underline"
                      role="link"
                      tabIndex={0}
                    >
                      {chat.otherParticipant?.name || 'Unknown User'}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {renderLastMessagePreview(chat.lastMessage)}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {chat.lastMessage?.timestamp ? formatDistanceToNowStrict(new Date(chat.lastMessage.timestamp as number), { addSuffix: true }) : ''}
                  </span>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Recent Status Updates</CardTitle>
          <CardDescription>See what others are up to.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingStatus && Array.from({ length: 3 }).map((_, i) => (
            <div key={`skeleton-${i}`} className="flex items-start space-x-3 p-3 bg-secondary/50 rounded-lg">
              <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ))}
          {!isLoadingStatus && statusUpdates.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No status updates to show yet.</p>
          )}
          {!isLoadingStatus && statusUpdates.map((status) => (
            <div key={status.id} className="p-4 bg-card border border-border rounded-lg shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start space-x-3">
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/profile/${status.userId}`);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      router.push(`/profile/${status.userId}`);
                    }
                  }}
                  className="cursor-pointer"
                  role="link"
                  tabIndex={0}
                >
                  <Avatar className="h-10 w-10 border hover:opacity-80 transition-opacity">
                    <AvatarImage src={status.userProfileImageUrl} alt={status.userName} data-ai-hint="avatar profile" />
                    <AvatarFallback className="bg-muted text-muted-foreground">{getInitials(status.userName)}</AvatarFallback>
                  </Avatar>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div
                       onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/profile/${status.userId}`);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          router.push(`/profile/${status.userId}`);
                        }
                      }}
                      className="font-semibold text-foreground cursor-pointer hover:underline"
                      role="link"
                      tabIndex={0}
                    >
                        {status.userName}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {status.createdAt ? formatDistanceToNowStrict(new Date(status.createdAt as number), { addSuffix: true }) : 'just now'}
                    </p>
                  </div>
                  <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{status.text}</p>
                  {status.imageUrl && (
                    <div className="mt-2 rounded-md overflow-hidden border border-border max-w-sm">
                      <Image src={status.imageUrl} alt="Status image" width={400} height={300} className="object-cover w-full h-auto" data-ai-hint="status image content"/>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-center space-x-1 pl-13">
                 <Button variant="ghost" size="icon" onClick={() => handleLikeStatus(status.id)} className="text-muted-foreground hover:text-destructive h-7 w-7">
                  <Heart className={`h-4 w-4 ${status.likes?.includes(user!.uid) ? 'fill-destructive text-destructive' : ''}`} />
                </Button>
                {status.likes && status.likes.length > 0 ? (
                    <Button
                        variant="link"
                        size="sm"
                        className="text-xs text-muted-foreground hover:text-primary p-0 h-auto"
                        onClick={() => fetchAndShowLikers(status)}
                    >
                        {status.likes.length} {status.likes.length === 1 ? 'like' : 'likes'}
                    </Button>
                ) : (
                    <span className="text-xs text-muted-foreground">
                       {status.likes?.length || 0} {status.likes?.length === 1 ? 'like' : 'likes'}
                    </span>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={isLikersDialogOpen} onOpenChange={setIsLikersDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Liked by ({selectedStatusForLikers?.likes?.length || 0})</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-72 max-h-[60vh] my-4"> {/* Added my-4 for spacing */}
            {loadingLikers ? (
              <div className="flex justify-center items-center h-full py-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : likersToShow.length > 0 ? (
              <div className="space-y-3 p-1">
                {likersToShow.map(liker => (
                  <div key={liker.uid} className="flex items-center space-x-3 p-2 hover:bg-accent rounded-md">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={liker.profileImageUrl} alt={liker.name} data-ai-hint="avatar profile" />
                      <AvatarFallback>{getInitials(liker.name)}</AvatarFallback>
                    </Avatar>
                    <Link
                        href={`/profile/${liker.uid}`}
                        className="text-sm font-medium hover:underline"
                        onClick={() => setIsLikersDialogOpen(false)} // Close dialog on click
                    >
                      {liker.name || liker.username || 'User'}
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-10">
                {selectedStatusForLikers?.likes?.length > 0 ? 'Could not load likers.' : 'No one has liked this status yet.'}
              </p>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLikersDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
