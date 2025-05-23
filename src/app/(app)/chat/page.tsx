
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation'; 
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from '@/components/ui/button';
import { MessageSquarePlus, Search, Loader2, Check, CheckCheck, FileText, Image as ImageIcon, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { ChatRoom, UserProfile, ChatMessage } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface DisplayChatRoom extends ChatRoom {
  otherParticipant: UserProfile | null; // For P2P
  displayImage?: string | null; // For group or P2P
  displayName: string; // Group name or other user's name
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
  const [chats, setChats] = useState<DisplayChatRoom[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const getInitials = (name?: string) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2) : 'U';

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const chatsQuery = query(
      collection(db, "chat_rooms"),
      where("participants", "array-contains", user.uid),
      orderBy("updatedAt", "desc")
    );

    const unsubscribe = onSnapshot(chatsQuery, async (querySnapshot) => {
      const fetchedChats: DisplayChatRoom[] = [];
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

        let otherParticipantProfile: UserProfile | null = null;
        let displayName = chatRoomData.groupName || 'Chat';
        let displayImage = chatRoomData.groupImage || null;

        if (!chatRoomData.isGroup) {
            const otherParticipantId = chatRoomData.participants.find(pId => pId !== user.uid);
            if (otherParticipantId) {
              const userDocRef = doc(db, "users", otherParticipantId);
              const userDocSnap = await getDoc(userDocRef);
              if (userDocSnap.exists()) {
                otherParticipantProfile = { uid: userDocSnap.id, ...userDocSnap.data() } as UserProfile;
                displayName = otherParticipantProfile.name || 'Unknown User';
                displayImage = otherParticipantProfile.profileImageUrl;
              } else {
                displayName = 'Unknown User';
              }
            } else {
                 displayName = 'Chat with deleted user'; // Or some other placeholder
            }
        }
        
        fetchedChats.push({
          ...chatRoomData,
          otherParticipant: otherParticipantProfile,
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
      setChats(fetchedChats);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching chats:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const filteredChats = chats.filter(chat => {
    const nameMatch = chat.displayName?.toLowerCase().includes(searchTerm.toLowerCase());
    const messageMatch = chat.lastMessageText?.toLowerCase().includes(searchTerm.toLowerCase());
    // If P2P, also search by other participant's username
    const usernameMatch = !chat.isGroup && chat.otherParticipant?.username?.toLowerCase().includes(searchTerm.toLowerCase());
    return nameMatch || messageMatch || usernameMatch;
  });

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
        const sender = chat.participantDetails?.[chat.lastMessageSenderId]?.name?.split(' ')[0] || "Someone";
        prefix = `${sender}: `;
    } else if (chat.isGroup && chat.lastMessageSenderId === user?.uid) {
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
            <ul className="space-y-3">
              {filteredChats.map((chat) => (
                <li key={chat.id}>
                  <Link href={`/chat/${chat.id}`} className="block p-3 rounded-lg hover:bg-accent transition-colors">
                    <div className="flex items-center space-x-3">
                       <Avatar className="h-12 w-12 border-2 border-primary">
                          <AvatarImage src={chat.displayImage || undefined} alt={chat.displayName} data-ai-hint={chat.isGroup ? "group avatar" : "avatar profile"} />
                          <AvatarFallback className="bg-muted text-muted-foreground">
                            {chat.isGroup ? <Users className="h-5 w-5" /> : getInitials(chat.displayName)}
                          </AvatarFallback>
                        </Avatar>
                      <div className="flex-1 min-w-0">
                         <p className="font-semibold text-foreground truncate">
                               {chat.displayName}
                         </p>
                        <div className="flex items-center text-sm text-muted-foreground">
                           {chat.lastMessageSenderId === user?.uid && chat.lastMessageStatus && (
                            <span className="mr-1">
                              {chat.lastMessageStatus === 'sent' && <Check className="h-4 w-4 text-muted-foreground" />}
                              {chat.lastMessageStatus === 'seen' && <CheckCheck className="h-4 w-4 text-blue-500" />}
                            </span>
                          )}
                          <p className="truncate">{renderLastMessagePreview(chat)}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end space-y-1">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatLastMessageTime(chat.lastMessageTimestamp)}
                        </span>
                        {chat.lastMessageSenderId !== user?.uid && chat.lastMessageStatus !== 'seen' && (
                          <span className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse" title="Unread message"></span>
                        )}
                      </div>
                    </div>
                  </Link>
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
    </div>
  );
}

declare module "@/components/ui/input" {
  interface InputProps {
    icon?: React.ReactNode;
  }
}
