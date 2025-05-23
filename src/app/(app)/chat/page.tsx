
'use client';

import { useState, useEffect, useMemo } from 'react'; // Added useMemo
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from '@/components/ui/button';
import { MessageSquarePlus, Search, Loader2, Check, CheckCheck, FileText, Image as ImageIcon, Users, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { ChatRoom, UserProfile, ChatMessage } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, Timestamp, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


interface DisplayChatRoom extends ChatRoom {
  otherParticipantProfile?: UserProfile | null; 
  displayImage?: string | null;
  displayName: string;
  lastMessageText?: string;
  lastMessageTimestamp?: number;
  lastMessageStatus?: 'sent' | 'seen';
  lastMessageSenderId?: string;
  lastMessageFileType?: ChatMessage['fileType'];
  lastMessageFileName?: string;
}

export default function ChatListPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [rawChats, setRawChats] = useState<DisplayChatRoom[]>([]); // Store all chats before filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [deletedChatIds, setDeletedChatIds] = useState<Set<string>>(new Set());
  const [chatToDelete, setChatToDelete] = useState<DisplayChatRoom | null>(null);


  const getInitials = (name?: string) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2) : 'U';

  // useEffect for fetching deleted chat IDs
  useEffect(() => {
    if (!user) {
      setDeletedChatIds(new Set()); // Clear if no user
      return;
    }

    const deletedChatsQuery = query(collection(db, `users/${user.uid}/deleted_chats`));
    const unsubscribeDeletedChats = onSnapshot(deletedChatsQuery, (snapshot) => {
      const ids = new Set<string>();
      snapshot.forEach((doc) => {
        ids.add(doc.id);
      });
      setDeletedChatIds(ids);
    }, (error) => {
      console.error("Error fetching deleted chats:", error);
      toast({ title: "Error", description: "Could not update list of deleted chats.", variant: "destructive"});
    });

    return () => unsubscribeDeletedChats();
  }, [user, toast]);


  // useEffect for fetching all raw chat rooms
  useEffect(() => {
    if (!user) {
      setRawChats([]); // Clear chats if no user
      setIsLoading(false); // Ensure loading is false if no user
      return;
    }

    setIsLoading(true); // Set loading true when we start fetching for a new user

    const chatsQuery = query(
      collection(db, "chat_rooms"),
      where("participants", "array-contains", user.uid),
      orderBy("updatedAt", "desc")
    );

    const unsubscribeChats = onSnapshot(chatsQuery, async (querySnapshot) => {
      const fetchedChatsData: DisplayChatRoom[] = [];
      for (const chatDoc of querySnapshot.docs) {
        const chatRoomData = chatDoc.data() as ChatRoom;
        chatRoomData.id = chatDoc.id;

        chatRoomData.createdAt = (chatRoomData.createdAt as unknown as Timestamp)?.toMillis?.() || chatRoomData.createdAt || Date.now();
        chatRoomData.updatedAt = (chatRoomData.updatedAt as unknown as Timestamp)?.toMillis?.() || chatRoomData.updatedAt || Date.now();

        let lastMessagePreview: string | undefined;
        let lastMessageTimestamp: number | undefined;
        let lastMessageStatus: 'sent' | 'seen' | undefined;
        let lastMessageSenderId: string | undefined;
        let lastMessageFileType: ChatMessage['fileType'] | undefined;
        let lastMessageFileName: string | undefined;

        if (chatRoomData.lastMessage) {
             chatRoomData.lastMessage.timestamp = (chatRoomData.lastMessage.timestamp as unknown as Timestamp)?.toMillis?.() || chatRoomData.lastMessage.timestamp;
             lastMessageTimestamp = chatRoomData.lastMessage.timestamp as number;
             lastMessageStatus = chatRoomData.lastMessage.status;
             lastMessageSenderId = chatRoomData.lastMessage.senderId;
             lastMessageFileType = chatRoomData.lastMessage.fileType;
             lastMessageFileName = chatRoomData.lastMessage.fileName;

             if (lastMessageFileType === 'image') {
                lastMessagePreview = `Photo: ${lastMessageFileName || 'Image'}`;
             } else if (lastMessageFileType) {
                lastMessagePreview = `File: ${lastMessageFileName || 'Attachment'}`;
             } else {
                lastMessagePreview = chatRoomData.lastMessage.text;
             }
        }

        let otherParticipantProfileData: UserProfile | null = null;
        let displayName = chatRoomData.groupName || 'Chat';
        let displayImage = chatRoomData.groupImage || null;

        if (!chatRoomData.isGroup) {
            const otherParticipantId = chatRoomData.participants.find(pId => pId !== user.uid);
            if (otherParticipantId) {
              const denormalizedDetails = chatRoomData.participantDetails?.[otherParticipantId];
              if (denormalizedDetails && denormalizedDetails.name) {
                otherParticipantProfileData = {
                  uid: otherParticipantId,
                  name: denormalizedDetails.name,
                  profileImageUrl: denormalizedDetails.profileImageUrl,
                  email: '', 
                  username: '', 
                };
                displayName = denormalizedDetails.name;
                displayImage = denormalizedDetails.profileImageUrl;
              } else {
                try {
                    const userDocRef = doc(db, "users", otherParticipantId);
                    const userDocSnap = await getDoc(userDocRef);
                    if (userDocSnap.exists()) {
                    otherParticipantProfileData = { uid: userDocSnap.id, ...userDocSnap.data() } as UserProfile;
                    displayName = otherParticipantProfileData.name || 'Unknown User';
                    displayImage = otherParticipantProfileData.profileImageUrl;
                    } else {
                    displayName = 'Unknown User';
                    }
                } catch (fetchError) {
                    console.warn(`Failed to fetch profile for ${otherParticipantId}:`, fetchError);
                    displayName = 'Error Loading User';
                }
              }
            } else {
                 displayName = 'Chat with deleted user';
            }
        }

        fetchedChatsData.push({
          ...chatRoomData,
          otherParticipantProfile: otherParticipantProfileData,
          displayName: displayName,
          displayImage: displayImage,
          lastMessageText: lastMessagePreview,
          lastMessageTimestamp: lastMessageTimestamp,
          lastMessageStatus: lastMessageStatus,
          lastMessageSenderId: lastMessageSenderId,
          lastMessageFileType: lastMessageFileType,
          lastMessageFileName: lastMessageFileName,
        });
      }
      setRawChats(fetchedChatsData);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching chats:", error);
      setIsLoading(false);
      toast({ title: "Error loading chats", description: error.message, variant: "destructive" });
    });

    return () => unsubscribeChats();
  }, [user, toast]); // Removed deletedChatIds from here

  const activeChats = useMemo(() => {
    return rawChats.filter(chat => !deletedChatIds.has(chat.id));
  }, [rawChats, deletedChatIds]);

  const filteredChats = useMemo(() => {
    return activeChats.filter(chat => {
        const nameMatch = chat.displayName?.toLowerCase().includes(searchTerm.toLowerCase());
        const messageMatch = chat.lastMessageText?.toLowerCase().includes(searchTerm.toLowerCase());
        const usernameMatch = !chat.isGroup && chat.otherParticipantProfile?.username?.toLowerCase().includes(searchTerm.toLowerCase());
        return nameMatch || messageMatch || usernameMatch;
    });
  }, [activeChats, searchTerm]);


  const formatLastMessageTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const today = new Date();
    if (date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()) {
      return format(date, 'p');
    }
    return format(date, 'MMM d');
  };

  const renderLastMessagePreview = (chat: DisplayChatRoom) => {
    if (!chat.lastMessageText && !chat.lastMessageFileType) return 'No messages yet';

    let prefix = "";
    if(chat.isGroup && chat.lastMessageSenderId && chat.lastMessageSenderId !== user?.uid) {
        const senderName = chat.participantDetails?.[chat.lastMessageSenderId]?.name?.split(' ')[0] || chat.lastMessage?.senderName?.split(' ')[0] || "Someone";
        prefix = `${senderName}: `;
    } else if (chat.lastMessageSenderId === user?.uid) {
        prefix = "You: ";
    }


    let icon = null;
    if (chat.lastMessageFileType === 'image') icon = <ImageIcon className="mr-1.5 h-4 w-4 inline-block" />;
    else if (chat.lastMessageFileType) icon = <FileText className="mr-1.5 h-4 w-4 inline-block" />;

    return (
      <>
        <span className="font-normal">{prefix}</span>
        {icon}
        <span className={cn({"italic": !!chat.lastMessageFileType})}>{chat.lastMessageText || 'Attachment'}</span>
      </>
    );
  };

  const handleDeleteChatForSelf = async (chatId: string) => {
    if (!user || !chatId) return;
    try {
      const deletedChatRef = doc(db, `users/${user.uid}/deleted_chats/${chatId}`);
      await setDoc(deletedChatRef, { deletedAt: serverTimestamp() });
      toast({ title: "Chat Hidden", description: "This chat has been removed from your list." });
      setChatToDelete(null); 
    } catch (error) {
      console.error("Error deleting chat for self:", error);
      toast({ title: "Error", description: "Could not hide chat.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Your Chats</h1>
          <p className="text-muted-foreground">Continue your conversations or start new ones.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
            <Button asChild className="flex-1 sm:flex-none">
              <Link href="/search">
                <MessageSquarePlus className="mr-2 h-4 w-4" /> New Chat
              </Link>
            </Button>
             <Button asChild variant="outline" className="flex-1 sm:flex-none">
              <Link href="/chat/new-group">
                <Users className="mr-2 h-4 w-4" /> New Group
              </Link>
            </Button>
        </div>
      </header>

      <Card className="shadow-lg">
        <CardHeader>
          <Input
            type="search"
            placeholder="Search by name, username, or message..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
            icon={<Search className="h-4 w-4 text-muted-foreground" />}
            aria-label="Search chats"
          />
        </CardHeader>
        <CardContent>
          {isLoading ? (
             <div className="flex justify-center items-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-2">Loading chats...</p>
            </div>
          ) : filteredChats.length > 0 ? (
            <ul className="space-y-1">
              {filteredChats.map((chat) => (
                <li key={chat.id} className="group relative rounded-lg hover:bg-accent transition-colors">
                  <Link href={`/chat/${chat.id}`} className="block p-3">
                    <div className="flex items-center space-x-3">
                       <Avatar className="h-12 w-12 border-2 border-primary">
                          <AvatarImage src={chat.displayImage || undefined} alt={chat.displayName} data-ai-hint={chat.isGroup ? "group avatar" : "avatar profile"} />
                          <AvatarFallback className="bg-muted text-muted-foreground">
                            {chat.isGroup ? <Users className="h-5 w-5" /> : getInitials(chat.displayName)}
                          </AvatarFallback>
                        </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                           <p className="font-semibold text-foreground truncate">
                                 {chat.displayName}
                           </p>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatLastMessageTime(chat.lastMessageTimestamp)}
                            </span>
                         </div>
                        <div className="flex items-center text-sm text-muted-foreground">
                           {chat.lastMessageSenderId === user?.uid && chat.lastMessageStatus && (
                            <span className="mr-1">
                              {chat.lastMessageStatus === 'sent' && <Check className="h-4 w-4 text-muted-foreground" />}
                              {chat.lastMessageStatus === 'seen' && <CheckCheck className="h-4 w-4 text-blue-500" />}
                            </span>
                          )}
                          <p className="truncate flex-1">{renderLastMessagePreview(chat)}</p>
                          {chat.lastMessageSenderId !== user?.uid && chat.lastMessageStatus !== 'seen' && (
                            <span className="ml-auto h-2.5 w-2.5 rounded-full bg-primary animate-pulse flex-shrink-0" title="Unread message"></span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-1/2 right-2 -translate-y-1/2 h-7 w-7 opacity-0 group-hover:opacity-100 focus-within:opacity-100 text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); setChatToDelete(chat); }}
                    title="Delete chat for yourself"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              {searchTerm ? `No chats found for "${searchTerm}".` : "You don't have any active chats yet. Start a new one!"}
            </p>
          )}
        </CardContent>
      </Card>

       {chatToDelete && (
        <AlertDialog open={!!chatToDelete} onOpenChange={(open) => !open && setChatToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Chat: {chatToDelete.displayName}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the chat from your list only. Other participants will still see the chat. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setChatToDelete(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleDeleteChatForSelf(chatToDelete.id)} className="bg-destructive hover:bg-destructive/90">
                Delete for Me
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

declare module "@/components/ui/input" {
  interface InputProps {
    icon?: React.ReactNode;
  }
}
    
