
'use client';

import { useState, useEffect, useRef, FormEvent, ChangeEvent, Fragment } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetTrigger } from '@/components/ui/sheet';
import { ArrowLeft, Send, Paperclip, Smile, Loader2, Check, CheckCheck, FileText, Image as ImageIcon, XCircle, Music2, Video, MoreVertical, UserX, UserCheck, ShieldAlert, MoreHorizontal, Pin, PinOff, Edit2, Trash2, CornerDownLeft, MessageCircle, Quote, Users, UserPlus, LogOutIcon, Crown, UserMinus } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import type { ChatMessage, UserProfile, ChatRoom, ChatMessageReportSnippet, ChatMessageReplySnippet } from '@/types';
import { cn } from '@/lib/utils';
import { db, storage } from '@/lib/firebase';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  updateDoc,
  Timestamp,
  writeBatch,
  arrayUnion,
  arrayRemove,
  limit,
  deleteField,
  where,
  documentId
} from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { format, isToday, isYesterday, differenceInCalendarDays, addHours, addDays, formatDistanceToNowStrict, formatRelative } from 'date-fns';

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const TYPING_TIMEOUT_MS = 3000;

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const chatId = params.chatId as string;
  const { user, userProfile: currentUserProfileDetails } = useAuth();
  const { toast } = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null); // For P2P
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [chatRoomData, setChatRoomData] = useState<ChatRoom | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadedFileDetails, setUploadedFileDetails] = useState<{ url: string; name: string; type: ChatMessage['fileType']; size: number } | null>(null);

  const [amIBlockedByOtherUser, setAmIBlockedByOtherUser] = useState(false); // P2P specific
  const [hasCurrentUserBlockedOtherUser, setHasCurrentUserBlockedOtherUser] = useState(false); // P2P specific
  const [isReportingChat, setIsReportingChat] = useState(false);

  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [editText, setEditText] = useState('');

  const [showPinDurationDialog, setShowPinDurationDialog] = useState(false);
  const [messageToPin, setMessageToPin] = useState<ChatMessage | null>(null);

  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false); // P2P typing
  const [groupTypingUsers, setGroupTypingUsers] = useState<string[]>([]); // For group typing names
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [replyingToMessage, setReplyingToMessage] = useState<ChatMessage | null>(null);

  const [isGroupInfoSheetOpen, setIsGroupInfoSheetOpen] = useState(false);
  const [groupParticipants, setGroupParticipants] = useState<UserProfile[]>([]);
  const [allUsersForAdding, setAllUsersForAdding] = useState<UserProfile[]>([]);
  const [selectedUsersForAdding, setSelectedUsersForAdding] = useState<Set<string>>(new Set());
  const [userSearchTermForAdding, setUserSearchTermForAdding] = useState('');
  const [isLoadingGroupMembers, setIsLoadingGroupMembers] = useState(false);


  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previousMessagesRef = useRef<ChatMessage[]>([]);


  useEffect(() => {
    if (currentUserProfileDetails) {
      setCurrentUserProfile(currentUserProfileDetails);
    }
  }, [currentUserProfileDetails]);

  // Effect for deriving typing status from chatRoomData
 useEffect(() => {
    if (chatRoomData?.isGroup && chatRoomData.typing && user) {
      const typingUserIds = Object.entries(chatRoomData.typing)
        .filter(([uid, isTyping]) => isTyping && uid !== user.uid)
        .map(([uid]) => uid);

      const typingNames = typingUserIds
        .map(uid => chatRoomData.participantDetails?.[uid]?.name?.split(' ')[0] || "Someone")
        .filter(name => name !== "Someone");

      setGroupTypingUsers(typingNames);
      setIsOtherUserTyping(false);
    } else if (!chatRoomData?.isGroup && chatRoomData?.typing && otherUser?.uid && chatRoomData.typing[otherUser.uid]) {
      setIsOtherUserTyping(true);
      setGroupTypingUsers([]);
    } else {
      setIsOtherUserTyping(false);
      setGroupTypingUsers([]);
    }

    // Cleanup typing status for current user on unmount or when chat changes
    return () => {
      if (user?.uid && chatId) {
        const chatRoomRef = doc(db, "chat_rooms", chatId);
        updateDoc(chatRoomRef, {
          [`typing.${user.uid}`]: deleteField()
        }).catch(e => console.warn("Failed to clear typing status on unmount/chat change:", e));
      }
    };
  }, [chatRoomData, otherUser?.uid, user, chatId]);


  const updateTypingStatus = async (isTyping: boolean) => {
    if (!user || !chatId) return;
    const chatRoomRef = doc(db, "chat_rooms", chatId);
    try {
      if (isTyping) {
        await updateDoc(chatRoomRef, {
          [`typing.${user.uid}`]: true,
          updatedAt: serverTimestamp()
        });
      } else {
        await updateDoc(chatRoomRef, {
          [`typing.${user.uid}`]: deleteField(),
        });
      }
    } catch (error) {
      console.warn("Error updating typing status:", error);
    }
  };

  const handleNewMessageChange = (e: ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }
    if (e.target.value.trim() !== '') {
      updateTypingStatus(true);
      typingTimerRef.current = setTimeout(() => {
        updateTypingStatus(false);
      }, TYPING_TIMEOUT_MS);
    } else {
      updateTypingStatus(false);
    }
  };


  useEffect(() => {
    audioRef.current = new Audio('/sounds/message-tone.mp3');

    if (!chatId || !user) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    const chatRoomDocRef = doc(db, "chat_rooms", chatId);
    let unsubscribeOtherUserProfile: (() => void) | null = null;
    let unsubscribeCurrentUserProfile: (() => void) | null = null;

    if(user) {
      const currentUserDocRef = doc(db, "users", user.uid);
      unsubscribeCurrentUserProfile = onSnapshot(currentUserDocRef, (snap) => {
        if(snap.exists()) {
          setCurrentUserProfile({
            uid: snap.id,
            ...snap.data(),
            lastSeen: (snap.data().lastSeen as Timestamp)?.toMillis?.() || snap.data().lastSeen || null,
           } as UserProfile);
        }
      }, (error) => {
        console.error("Error fetching current user profile:", error);
        toast({title: "Error", description: "Failed to load your profile details.", variant: "destructive" });
      });
    }


    const unsubscribeChatRoom = onSnapshot(chatRoomDocRef, async (docSnap) => {
      if (docSnap.exists()) {
        const roomData = docSnap.data() as ChatRoom;

        // Process pinnedMessage for client-side state to ensure pinnedUntil is number | null
        if (roomData.pinnedMessage) {
          let processedPinnedUntil: number | null = null;
          if (roomData.pinnedMessage.pinnedUntil instanceof Timestamp) {
            processedPinnedUntil = roomData.pinnedMessage.pinnedUntil.toMillis();
          } else if (typeof roomData.pinnedMessage.pinnedUntil === 'number') {
            processedPinnedUntil = roomData.pinnedMessage.pinnedUntil;
          }
          roomData.pinnedMessage = {
            ...roomData.pinnedMessage,
            pinnedUntil: processedPinnedUntil,
          };
        }
        setChatRoomData(roomData);

        if (!roomData.isGroup) {
            const otherParticipantId = roomData.participants.find(pId => pId !== user.uid);
            if (otherParticipantId) {
              if (unsubscribeOtherUserProfile) unsubscribeOtherUserProfile();
              const otherUserDocRef = doc(db, "users", otherParticipantId);
              unsubscribeOtherUserProfile = onSnapshot(otherUserDocRef, (otherUserSnap) => {
                 if (otherUserSnap.exists()) {
                    const otherUserData = otherUserSnap.data();
                    setOtherUser({
                        uid: otherUserSnap.id,
                        ...otherUserData,
                        lastSeen: (otherUserData.lastSeen as Timestamp)?.toMillis?.() || otherUserData.lastSeen || null,
                    } as UserProfile);
                  } else {
                    toast({title: "Error", description: "Could not find the other user.", variant: "destructive" });
                    setOtherUser(null);
                  }
              }, (error) => {
                console.error("Error fetching other user profile:", error);
                toast({title: "Error", description: "Failed to load other user details.", variant: "destructive" });
              });
            } else {
                setOtherUser(null);
            }
        } else {
            setOtherUser(null);
            if (roomData.participants && roomData.participants.length > 0) {
                fetchGroupParticipants(roomData.participants);
            }
        }
      } else {
         toast({title: "Error", description: "Chat room not found.", variant: "destructive" });
         router.push('/chat');
      }
    }, error => {
        console.error("Error fetching chat room:", error);
        toast({title: "Error", description: "Failed to load chat details.", variant: "destructive" });
    });

    const messagesQuery = query(
      collection(db, "chat_rooms", chatId, "messages"),
      orderBy("timestamp", "asc")
    );

    const unsubscribeMessages = onSnapshot(messagesQuery, async (querySnapshot) => {
      const fetchedMessagesData: ChatMessage[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        fetchedMessagesData.push({
            id: doc.id,
            ...data,
            status: data.status || 'sent',
            timestamp: (data.timestamp as Timestamp)?.toMillis?.() || data.timestamp || Date.now(),
            editedAt: (data.editedAt as Timestamp)?.toMillis?.() || data.editedAt,
            // pinnedUntil is processed in room snapshot, so it should be number | null here
            // If it's coming directly from message doc, ensure conversion
            pinnedUntil: (data.pinnedUntil instanceof Timestamp) ? data.pinnedUntil.toMillis() : (typeof data.pinnedUntil === 'number' ? data.pinnedUntil : null),
            replyTo: data.replyTo || null,
        } as ChatMessage);
      });

      if (user && audioRef.current && fetchedMessagesData.length > previousMessagesRef.current.length) {
        const lastNewMessage = fetchedMessagesData[previousMessagesRef.current.length];
        const isTrulyNew = !previousMessagesRef.current.find(m => m.id === lastNewMessage?.id);

        if (lastNewMessage && lastNewMessage.senderId !== user.uid && isTrulyNew && typeof document !== 'undefined' && document.hasFocus()) {
            audioRef.current.play().catch(e => console.warn("Failed to play message sound:", e.message));
        }
      }
      setMessages(fetchedMessagesData);
      setIsLoading(false);

      if (user && typeof document !== 'undefined' && document.hasFocus()) {
        const batch = writeBatch(db);
        let lastMessageOfTheRoomWasUpdatedToSeen = false;
        const currentChat = chatRoomData;

        fetchedMessagesData.forEach(msg => {
          if (msg.senderId !== user.uid && msg.status !== 'seen') {
            const msgRef = doc(db, "chat_rooms", chatId, "messages", msg.id);
            batch.update(msgRef, { status: 'seen' });
            if (currentChat?.lastMessageId === msg.id) {
              lastMessageOfTheRoomWasUpdatedToSeen = true;
            }
          }
        });

        try {
          if (batch["_mutations" as any].length > 0) {
            await batch.commit();
            if (lastMessageOfTheRoomWasUpdatedToSeen && currentChat) {
               await updateDoc(doc(db, "chat_rooms", chatId), {
                 "lastMessage.status": "seen",
                 "updatedAt": serverTimestamp()
                });
            }
          }
        } catch (error) {
          console.error("Error marking messages as seen:", error);
        }
      }
      previousMessagesRef.current = fetchedMessagesData;
    }, (error) => {
        console.error("Error fetching messages:", error);
        toast({title: "Error", description: "Failed to load messages.", variant: "destructive" });
        setIsLoading(false);
    });

    return () => {
      unsubscribeChatRoom();
      if (unsubscribeOtherUserProfile) unsubscribeOtherUserProfile();
      if (unsubscribeCurrentUserProfile) unsubscribeCurrentUserProfile();
      unsubscribeMessages();
    };
  }, [chatId, user, router, toast]);


  const fetchGroupParticipants = async (participantIds: string[]) => {
    if (!participantIds || participantIds.length === 0) {
      setGroupParticipants([]);
      return;
    }
    setIsLoadingGroupMembers(true);
    try {
      const usersRef = collection(db, "users");
      const usersQuery = query(usersRef, where(documentId(), "in", participantIds.slice(0,10)));
      const snapshot = await getDocs(usersQuery);
      const members = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      setGroupParticipants(members);
    } catch (error) {
      console.error("Error fetching group participants:", error);
      toast({ title: "Error", description: "Could not load group members.", variant: "destructive"});
    } finally {
      setIsLoadingGroupMembers(false);
    }
  };

  useEffect(() => {
    if (chatRoomData?.isGroup && isGroupInfoSheetOpen && groupParticipants.length === 0 && chatRoomData.participants.length > 0) {
        fetchGroupParticipants(chatRoomData.participants);
    }
  }, [chatRoomData, isGroupInfoSheetOpen, groupParticipants.length]);


  useEffect(() => {
    if (currentUserProfile && otherUser && !chatRoomData?.isGroup) {
      setHasCurrentUserBlockedOtherUser(currentUserProfile.blockedUsers?.includes(otherUser.uid) || false);
      setAmIBlockedByOtherUser(otherUser.blockedUsers?.includes(currentUserProfile.uid) || false);
    } else {
      setHasCurrentUserBlockedOtherUser(false);
      setAmIBlockedByOtherUser(false);
    }
  }, [currentUserProfile, otherUser, chatRoomData?.isGroup]);

  useEffect(() => {
    if (messagesEndRef.current && !editingMessage && !replyingToMessage) {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, editingMessage, replyingToMessage]);


  const getFileType = (fileName: string): ChatMessage['fileType'] => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension || '')) return 'image';
    if (extension === 'pdf') return 'pdf';
    if (['doc', 'docx'].includes(extension || '')) return 'doc';
    if (['mp3', 'wav', 'ogg'].includes(extension || '')) return 'audio';
    if (['mp4', 'webm', 'mov'].includes(extension || '')) return 'video';
    if (extension === 'txt') return 'txt';
    return 'other';
  };

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast({ title: "File Too Large", description: `Please select a file smaller than ${MAX_FILE_SIZE_MB}MB.`, variant: "destructive" });
        return;
      }
      setSelectedFile(file);
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onloadend = () => setFilePreview(reader.result as string);
        reader.readAsDataURL(file);
      } else {
        setFilePreview(null);
      }
      await uploadFile(file);
    }
  };

  const uploadFile = async (file: File) => {
    if (!user || !chatId) return;
    setIsUploadingFile(true);
    setUploadProgress(0);
    setUploadedFileDetails(null);

    const uniqueFileName = `${Date.now()}_${file.name}`;
    const fileStorageRef = storageRef(storage, `chat_attachments/${chatId}/${user.uid}/${uniqueFileName}`);
    const uploadTask = uploadBytesResumable(fileStorageRef, file);

    uploadTask.on('state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
      },
      (error) => {
        console.error("Upload failed:", error);
        toast({ title: 'File Upload Failed', description: error.message, variant: 'destructive' });
        handleRemoveSelectedFile();
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setUploadedFileDetails({
            url: downloadURL,
            name: file.name,
            type: getFileType(file.name),
            size: file.size,
          });
          toast({ title: "File Ready", description: `${file.name} is ready to be sent.`});
        } catch (error: any) {
          console.error("Failed to get download URL:", error);
          toast({ title: 'Upload Finalization Failed', description: "Could not get file URL. Please try removing and re-attaching.", variant: 'destructive' });
          handleRemoveSelectedFile();
        } finally {
          setIsUploadingFile(false);
          setUploadProgress(null);
        }
      }
    );
  };

  const handleRemoveSelectedFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    setUploadedFileDetails(null);
    setUploadProgress(null);
    setIsUploadingFile(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentUserProfile || !user) return;

    if (!chatRoomData?.isGroup && (amIBlockedByOtherUser || hasCurrentUserBlockedOtherUser)) {
      toast({ title: "Cannot Send Message", description: "You are unable to send messages in this chat.", variant: "destructive" });
      return;
    }

    if ((!newMessage.trim() && !uploadedFileDetails) || !chatId ) return;
    if (isUploadingFile) {
        toast({ title: "Please wait", description: "File is still uploading.", variant: "default" });
        return;
    }
    setIsSending(true);
    updateTypingStatus(false);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);

    const messageText = newMessage.trim();
    const messagePayload: Omit<ChatMessage, 'id' | 'timestamp'> & { timestamp: any } = {
      chatRoomId: chatId,
      senderId: user.uid,
      senderName: currentUserProfile.name || currentUserProfile.email?.split('@')[0] || 'Me',
      senderProfileImageUrl: currentUserProfile.profileImageUrl || undefined,
      ...(messageText && { text: messageText }),
      status: 'sent',
      timestamp: serverTimestamp(),
      isDeleted: false,
      editedAt: null,
      isPinned: false,
      replyTo: null,
    };

    if (uploadedFileDetails) {
      messagePayload.fileUrl = uploadedFileDetails.url;
      messagePayload.fileName = uploadedFileDetails.name;
      messagePayload.fileType = uploadedFileDetails.type;
      messagePayload.fileSize = uploadedFileDetails.size;
    }

    if (replyingToMessage) {
        const replySnippet: Partial<ChatMessageReplySnippet> = {
            messageId: replyingToMessage.id,
            senderId: replyingToMessage.senderId,
            senderName: replyingToMessage.senderName,
        };
        if (replyingToMessage.text) {
            replySnippet.text = replyingToMessage.text.substring(0, 75);
        }
        if (replyingToMessage.fileType) {
            replySnippet.fileType = replyingToMessage.fileType;
            if (replyingToMessage.fileName) {
                replySnippet.fileName = replyingToMessage.fileName.substring(0, 50);
            }
        }
        messagePayload.replyTo = replySnippet as ChatMessageReplySnippet;
    }

    try {
      const messagesColRef = collection(db, "chat_rooms", chatId, "messages");
      const newDocRef = await addDoc(messagesColRef, messagePayload);

      const chatRoomDocRef = doc(db, "chat_rooms", chatId);
      await updateDoc(chatRoomDocRef, {
        lastMessage: {
          id: newDocRef.id,
          senderId: messagePayload.senderId,
          senderName: messagePayload.senderName,
          text: messageText.substring(0, 50) || (messagePayload.fileName ? `Sent: ${messagePayload.fileName.substring(0,40)}` : "Sent a file"),
          timestamp: serverTimestamp(),
          status: 'sent',
          ...(uploadedFileDetails && {
            fileType: uploadedFileDetails.type,
            fileName: uploadedFileDetails.name?.substring(0,30)
          }),
        },
        lastMessageId: newDocRef.id,
        updatedAt: serverTimestamp(),
      });

      setNewMessage('');
      handleRemoveSelectedFile();
      setReplyingToMessage(null);
    } catch (error) {
        console.error("Error sending message:", error);
        toast({title: "Error", description: "Could not send message.", variant: "destructive" });
    } finally {
        setIsSending(false);
    }
  };

  const handleBlockUser = async () => {
    if (!user || !otherUser || !currentUserProfile || chatRoomData?.isGroup) return;
    const userRef = doc(db, "users", user.uid);
    try {
      await updateDoc(userRef, {
        blockedUsers: arrayUnion(otherUser.uid)
      });
      toast({ title: "User Blocked", description: `You have blocked ${otherUser.name || 'this user'}.`});
    } catch (error) {
      toast({ title: "Error", description: "Could not block user.", variant: "destructive"});
      console.error("Error blocking user:", error);
    }
  };

  const handleUnblockUser = async () => {
    if (!user || !otherUser || !currentUserProfile || chatRoomData?.isGroup) return;
    const userRef = doc(db, "users", user.uid);
    try {
      await updateDoc(userRef, {
        blockedUsers: arrayRemove(otherUser.uid)
      });
      toast({ title: "User Unblocked", description: `You have unblocked ${otherUser.name || 'this user'}.`});
    } catch (error) {
      toast({ title: "Error", description: "Could not unblock user.", variant: "destructive"});
      console.error("Error unblocking user:", error);
    }
  };

  const handleReportChat = async () => {
    if (!currentUserProfile || (!otherUser && !chatRoomData?.isGroup) || !chatId) {
        toast({ title: "Error", description: "Cannot report chat. Missing information.", variant: "destructive" });
        return;
    }
    setIsReportingChat(true);
    try {
        const messagesQuery = query( collection(db, "chat_rooms", chatId, "messages"), orderBy("timestamp", "desc"), limit(3));
        const messagesSnapshot = await getDocs(messagesQuery);
        const lastThreeMessages: ChatMessageReportSnippet[] = [];
        messagesSnapshot.forEach(doc => {
            const data = doc.data() as ChatMessage;
            lastThreeMessages.unshift({ senderId: data.senderId, senderName: data.senderName, text: data.text, timestamp: data.timestamp });
        });

        const reportPayload: Partial<ChatReport> = {
            chatRoomId: chatId,
            reportedByUid: currentUserProfile.uid,
            reportedUserName: currentUserProfile.name || currentUserProfile.username,
            timestamp: serverTimestamp() as Timestamp,
            status: "Pending" as const,
            lastThreeMessages: lastThreeMessages,
            isGroupReport: chatRoomData?.isGroup || false,
        };
        if(chatRoomData?.isGroup) {
            reportPayload.targetUserName = chatRoomData.groupName;
        } else if (otherUser) {
            reportPayload.reportedUserUid = otherUser.uid;
            reportPayload.targetUserName = otherUser.name || otherUser.username;
        }

        await addDoc(collection(db, "chat_reports"), reportPayload);
        toast({ title: "Chat Reported", description: "Thank you for your report. An admin will review it shortly." });
    } catch (error) {
        console.error("Error reporting chat:", error);
        toast({ title: "Report Failed", description: "Could not submit your report.", variant: "destructive" });
    } finally {
        setIsReportingChat(false);
    }
  };

  const handleInitiateEdit = (message: ChatMessage) => {
    if (message.senderId !== user?.uid || message.isDeleted) return;
    setEditingMessage(message);
    setEditText(message.text || '');
  };

  const handleCancelEdit = () => { setEditingMessage(null); setEditText(''); };

  const handleSaveEdit = async () => {
    if (!editingMessage || !user) return;
    setIsSending(true);
    const messageRef = doc(db, "chat_rooms", chatId, "messages", editingMessage.id);
    try {
      await updateDoc(messageRef, { text: editText, editedAt: serverTimestamp() });
      if (chatRoomData?.lastMessageId === editingMessage.id) {
        const chatRoomRef = doc(db, "chat_rooms", chatId);
        await updateDoc(chatRoomRef, { "lastMessage.text": editText.substring(0, 50), "lastMessage.timestamp": serverTimestamp(), updatedAt: serverTimestamp() });
      }
      toast({ title: "Message Edited" });
      handleCancelEdit();
    } catch (error) {
      toast({ title: "Error", description: "Could not edit message.", variant: "destructive" });
      console.error("Error editing message:", error);
    } finally { setIsSending(false); }
  };

  const handleDeleteMessage = async (message: ChatMessage) => {
    if (message.senderId !== user?.uid || !chatId) return;
    setIsSending(true);
    const messageRef = doc(db, "chat_rooms", chatId, "messages", message.id);
    try {
      await updateDoc(messageRef, {
        text: "This message was deleted", isDeleted: true, fileUrl: deleteField(), fileName: deleteField(),
        fileType: deleteField(), fileSize: deleteField(), editedAt: serverTimestamp(), replyTo: deleteField(),
      });
      if (chatRoomData?.pinnedMessage?.id === message.id) { await handleUnpinMessage(message.id, true); }
      if (chatRoomData?.lastMessageId === message.id) {
        const chatRoomRef = doc(db, "chat_rooms", chatId);
        await updateDoc(chatRoomRef, { "lastMessage.text": "This message was deleted", "lastMessage.fileType": deleteField(), "lastMessage.fileName": deleteField(), "lastMessage.timestamp": serverTimestamp(), updatedAt: serverTimestamp() });
      }
      toast({ title: "Message Deleted" });
    } catch (error) {
      toast({ title: "Error", description: "Could not delete message.", variant: "destructive" });
      console.error("Error deleting message:", error);
    } finally { setIsSending(false); }
  };

  const openPinDialog = (message: ChatMessage) => { if (message.isDeleted) return; setMessageToPin(message); setShowPinDurationDialog(true); };

  const handlePinMessage = async (durationKey: '24h' | '7d' | 'forever') => {
    if (!messageToPin || !user || !chatId || !currentUserProfile) return;
    setShowPinDurationDialog(false); setIsSending(true);
    let pinnedUntilTimestamp: Timestamp | null = null;
    const now = new Date();
    if (durationKey === '24h') { pinnedUntilTimestamp = Timestamp.fromDate(addHours(now, 24)); }
    else if (durationKey === '7d') { pinnedUntilTimestamp = Timestamp.fromDate(addDays(now, 7)); }

    const messageRef = doc(db, "chat_rooms", chatId, "messages", messageToPin.id);
    const chatRoomRef = doc(db, "chat_rooms", chatId);
    try {
      if (chatRoomData?.pinnedMessage?.id && chatRoomData.pinnedMessage.id !== messageToPin.id) {
        const oldPinnedMessageRef = doc(db, "chat_rooms", chatId, "messages", chatRoomData.pinnedMessage.id);
        await updateDoc(oldPinnedMessageRef, { isPinned: false, pinnedByUid: deleteField(), pinnedUntil: deleteField() });
      }
      const messageUpdateData: any = { isPinned: true, pinnedByUid: currentUserProfile.uid };
      if (pinnedUntilTimestamp) {
         messageUpdateData.pinnedUntil = pinnedUntilTimestamp;
      } else {
         messageUpdateData.pinnedUntil = null; // Explicitly set to null for "forever"
      }
      await updateDoc(messageRef, messageUpdateData);

      const pinnedMessageForChatRoom: any = {
        id: messageToPin.id, text: messageToPin.text ? messageToPin.text.substring(0, 100) : (messageToPin.fileName || "Attachment"),
        senderId: messageToPin.senderId, senderName: messageToPin.senderName, timestamp: messageToPin.timestamp, pinnedByUid: currentUserProfile.uid,
      };

      if (messageToPin.fileType) {
        pinnedMessageForChatRoom.fileType = messageToPin.fileType;
      }
      if (messageToPin.fileName && messageToPin.fileType) {
        pinnedMessageForChatRoom.fileName = messageToPin.fileName.substring(0, 50);
      }

      if (pinnedUntilTimestamp) {
        pinnedMessageForChatRoom.pinnedUntil = pinnedUntilTimestamp;
      } else {
        pinnedMessageForChatRoom.pinnedUntil = null; // Explicitly set to null for "forever"
      }
      await updateDoc(chatRoomRef, { pinnedMessage: pinnedMessageForChatRoom, updatedAt: serverTimestamp() });
      toast({ title: "Message Pinned" });
    } catch (error) {
      console.error("Error pinning message:", error);
      toast({ title: "Error", description: "Could not pin message.", variant: "destructive" });
    } finally { setIsSending(false); setMessageToPin(null); }
  };

  const handleUnpinMessage = async (messageIdToUnpin?: string, silent = false) => {
    const targetMessageId = messageIdToUnpin || chatRoomData?.pinnedMessage?.id;
    if (!targetMessageId || !chatId) return; setIsSending(true);
    const messageRef = doc(db, "chat_rooms", chatId, "messages", targetMessageId);
    const chatRoomRef = doc(db, "chat_rooms", chatId);
    try {
      await updateDoc(messageRef, { isPinned: false, pinnedByUid: deleteField(), pinnedUntil: deleteField() });
      await updateDoc(chatRoomRef, { pinnedMessage: deleteField(), updatedAt: serverTimestamp() });
      if (!silent) { toast({ title: "Message Unpinned" }); }
    } catch (error) {
      console.error("Error unpinning message:", error);
      if (!silent) { toast({ title: "Error", description: "Could not unpin message.", variant: "destructive" });}
    } finally { setIsSending(false); }
  };

  const handleSetReplyToMessage = (message: ChatMessage) => {
    if (message.isDeleted) { toast({ title: "Cannot reply", description: "This message has been deleted.", variant: "destructive"}); return; }
    setReplyingToMessage(message); messageInputRef.current?.focus();
  };

  const handleCancelReply = () => { setReplyingToMessage(null); };

  const handleLeaveGroup = async () => {
    if (!chatRoomData?.isGroup || !currentUserProfile || !chatId) return;
    setIsSending(true);
    const chatRoomRef = doc(db, "chat_rooms", chatId);
    try {
        await updateDoc(chatRoomRef, {
            participants: arrayRemove(currentUserProfile.uid),
            [`participantDetails.${currentUserProfile.uid}`]: deleteField(),
            admins: arrayRemove(currentUserProfile.uid),
            updatedAt: serverTimestamp()
        });
        toast({ title: "Left Group", description: `You have left ${chatRoomData.groupName}.`});
        router.push('/chat');
    } catch (error) {
        console.error("Error leaving group:", error);
        toast({title: "Error", description: "Could not leave group.", variant: "destructive"});
    } finally {
        setIsSending(false);
        setIsGroupInfoSheetOpen(false);
    }
  };

  const handleAddMemberToGroup = async (userIdToAdd: string) => {
    if (!chatRoomData?.isGroup || !currentUserProfile || !chatRoomData.admins?.includes(currentUserProfile.uid) || !chatId) return;

    const userToAddProfile = allUsersForAdding.find(u => u.uid === userIdToAdd);
    if (!userToAddProfile) {
        toast({title: "Error", description: "Selected user not found.", variant: "destructive"});
        return;
    }

    setIsSending(true);
    const chatRoomRef = doc(db, "chat_rooms", chatId);
    try {
        await updateDoc(chatRoomRef, {
            participants: arrayUnion(userIdToAdd),
            [`participantDetails.${userIdToAdd}`]: { name: userToAddProfile.name, profileImageUrl: userToAddProfile.profileImageUrl || '' },
            updatedAt: serverTimestamp()
        });
        toast({ title: "Member Added", description: `${userToAddProfile.name} has been added to the group.`});
        fetchGroupParticipants([...(chatRoomData.participants || []), userIdToAdd]);
        setSelectedUsersForAdding(prev => { const newSet = new Set(prev); newSet.delete(userIdToAdd); return newSet; });
    } catch (error) {
        console.error("Error adding member:", error);
        toast({title: "Error", description: "Could not add member.", variant: "destructive"});
    } finally {
        setIsSending(false);
    }
  };

  const handleRemoveMemberFromGroup = async (userIdToRemove: string) => {
    if (!chatRoomData?.isGroup || !currentUserProfile || !chatRoomData.admins?.includes(currentUserProfile.uid) || !chatId || userIdToRemove === currentUserProfile.uid) {
         toast({title: "Error", description: "Cannot remove self or action not permitted.", variant: "destructive"});
        return;
    }
    if (chatRoomData.createdBy === userIdToRemove && chatRoomData.admins?.length === 1 && chatRoomData.admins[0] === userIdToRemove) {
        toast({title: "Error", description: "Cannot remove the original creator if they are the sole admin.", variant: "destructive"});
        return;
    }

    setIsSending(true);
    const chatRoomRef = doc(db, "chat_rooms", chatId);
    try {
        await updateDoc(chatRoomRef, {
            participants: arrayRemove(userIdToRemove),
            [`participantDetails.${userIdToRemove}`]: deleteField(),
            admins: arrayRemove(userIdToRemove),
            updatedAt: serverTimestamp()
        });
        const removedUser = groupParticipants.find(p => p.uid === userIdToRemove);
        toast({ title: "Member Removed", description: `${removedUser?.name || 'User'} has been removed from the group.`});
        fetchGroupParticipants((chatRoomData.participants || []).filter(uid => uid !== userIdToRemove));
    } catch (error) {
        console.error("Error removing member:", error);
        toast({title: "Error", description: "Could not remove member.", variant: "destructive"});
    } finally {
        setIsSending(false);
    }
  };

  useEffect(() => {
    if (isGroupInfoSheetOpen && chatRoomData?.isGroup && currentUserProfile) {
        const fetchUsers = async () => {
            setIsLoadingGroupMembers(true);
            try {
                const usersRef = collection(db, "users");
                const currentParticipantIds = chatRoomData.participants || [];
                let q = query(usersRef);
                if (currentParticipantIds.length > 0 && currentParticipantIds.length <=10) { // Firestore "not-in" limit
                     q = query(usersRef, where(documentId(), "not-in", currentParticipantIds.slice(0,10)));
                } else if (currentParticipantIds.length > 10) {
                    // For more than 10, fetch all and filter client-side (not ideal for huge N)
                }

                const querySnapshot = await getDocs(q);
                let usersData = querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
                if(currentParticipantIds.length > 10) { // Client-side filter if "not-in" wasn't exhaustive
                    usersData = usersData.filter(u => !currentParticipantIds.includes(u.uid));
                }
                setAllUsersForAdding(usersData);
            } catch (error) {
                console.error("Error fetching users for adding:", error);
            } finally {
                setIsLoadingGroupMembers(false);
            }
        };
        if (chatRoomData.admins?.includes(currentUserProfile.uid)) {
            fetchUsers();
        }
    }
  }, [isGroupInfoSheetOpen, chatRoomData, currentUserProfile]);


  const getInitials = (name?: string) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2) : 'U';

  const renderFileMessage = (msg: ChatMessage) => {
    if (!msg.fileUrl || !msg.fileName || !msg.fileType) return null;
    const commonFileClasses = "flex items-center space-x-2 p-2 border rounded-md bg-background/50 hover:bg-accent/50 transition-colors max-w-xs";

    if (msg.fileType === 'image') {
      return (
        <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="block mt-1.5 rounded-md overflow-hidden border max-w-xs">
          <Image src={msg.fileUrl} alt={msg.fileName} width={200} height={150} className="object-cover" data-ai-hint="chat image" unoptimized={true} />
        </a>
      );
    }
    if (msg.fileType === 'audio') {
      return (
        <div className={cn(commonFileClasses, "mt-1.5")}>
          <Music2 className="h-6 w-6 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <a href={msg.fileUrl} target="_blank" download={msg.fileName} rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline truncate block">{msg.fileName}</a>
            {msg.fileSize && <p className="text-xs text-muted-foreground">{(msg.fileSize / (1024*1024)).toFixed(2)} MB</p>}
            <audio controls src={msg.fileUrl} className="w-full h-10 mt-1 rounded"></audio>
          </div>
        </div>
      );
    }
    if (msg.fileType === 'video') {
      return (
        <div className={cn(commonFileClasses, "mt-1.5")}>
          <Video className="h-6 w-6 text-primary flex-shrink-0" />
           <div className="flex-1 min-w-0">
            <a href={msg.fileUrl} target="_blank" download={msg.fileName} rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline truncate block">{msg.fileName}</a>
            {msg.fileSize && <p className="text-xs text-muted-foreground">{(msg.fileSize / (1024*1024)).toFixed(2)} MB</p>}
            <video controls src={msg.fileUrl} className="w-full rounded mt-1 max-h-48"></video>
          </div>
        </div>
      );
    }
    let FileIcon = FileText;
    if (msg.fileType === 'pdf') FileIcon = FileText;

    return (
      <a href={msg.fileUrl} target="_blank" download={msg.fileName} rel="noopener noreferrer" className={cn(commonFileClasses, "mt-1.5")}>
        <FileIcon className="h-6 w-6 text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-primary hover:underline truncate">{msg.fileName}</p>
          {msg.fileSize && <p className="text-xs text-muted-foreground">{(msg.fileSize / (1024*1024)).toFixed(2)} MB</p>}
        </div>
      </a>
    );
  };

  const renderReplyPreview = (replyTo: ChatMessageReplySnippet) => {
    let previewText = replyTo.text || "Attachment";
    if (replyTo.fileType === 'image') previewText = `Photo: ${replyTo.fileName || 'Image'}`;
    else if (replyTo.fileType) previewText = `File: ${replyTo.fileName || 'File'}`;

    return (
      <div className="text-xs p-2 mb-1 border-l-2 border-primary bg-muted/50 rounded-r-md max-w-full overflow-hidden">
        <p className="font-semibold text-primary/90">Replying to {replyTo.senderName}</p>
        <p className="text-muted-foreground truncate italic">{previewText}</p>
      </div>
    );
  };

  const formatMessageDateSeparator = (timestamp: ChatMessage['timestamp']): string => {
    if (!timestamp) return "";
    const date = new Date(timestamp as number); // Ensure timestamp is number
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    const diffDays = differenceInCalendarDays(new Date(), date);
    if (diffDays < 7) return format(date, 'EEEE'); // e.g., Monday
    return format(date, 'dd/MM/yyyy');
  };

  if (isLoading && !messages.length) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-2 text-muted-foreground">Loading chat...</p>
      </div>
    );
  }
  if (!chatRoomData && !isLoading) { return <div className="flex flex-col h-full items-center justify-center p-4"><p>Chat not found or access denied.</p></div>; }


  let lastDisplayedDate: string | null = null;
  const chatDisplayName = chatRoomData?.isGroup ? chatRoomData.groupName : otherUser?.name;
  const chatDisplayImage = chatRoomData?.isGroup ? chatRoomData.groupImage : otherUser?.profileImageUrl;
  const isChatAdmin = chatRoomData?.isGroup && currentUserProfile && chatRoomData.admins?.includes(currentUserProfile.uid);
  const isChatDisabled = (!chatRoomData?.isGroup && (amIBlockedByOtherUser || hasCurrentUserBlockedOtherUser)) || isSending || isUploadingFile;

  const typingDisplay = groupTypingUsers.length > 0
    ? `${groupTypingUsers.slice(0,2).join(', ')}${groupTypingUsers.length > 2 ? ' and others' : ''} typing...`
    : isOtherUserTyping ? 'typing...' : null;

  void 0; // Ensure preceding JS context is closed

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height,4rem)-2rem)] md:h-[calc(100vh-var(--header-height,4rem)-4rem)] bg-card shadow-lg rounded-lg overflow-hidden">
      <header className="flex items-center p-3 border-b border-border">
        <Button variant="ghost" size="icon" className="mr-2" onClick={() => router.back()}> <ArrowLeft className="h-5 w-5" /> </Button>
        <div className="flex items-center cursor-pointer" onClick={() => chatRoomData?.isGroup && setIsGroupInfoSheetOpen(true)}>
            <Avatar className="h-9 w-9">
              <AvatarImage src={chatDisplayImage || undefined} alt={chatDisplayName} data-ai-hint={chatRoomData?.isGroup ? "group avatar" : "avatar profile"} />
              <AvatarFallback className="bg-muted text-muted-foreground">
                {chatRoomData?.isGroup ? <Users className="h-5 w-5" /> : getInitials(chatDisplayName)}
              </AvatarFallback>
            </Avatar>
        </div>
        <div className="ml-3 flex-1">
            <p className="font-semibold text-foreground cursor-pointer hover:underline" onClick={() => chatRoomData?.isGroup ? setIsGroupInfoSheetOpen(true) : (otherUser && router.push(`/profile/${otherUser.uid}`))}>
                {chatDisplayName || 'Chat'}
            </p>
            <p className="text-xs text-muted-foreground h-4">
             {typingDisplay ? (
                <span className="italic text-primary animate-pulse">{typingDisplay}</span>
             ) : chatRoomData?.isGroup ? (
                <span onClick={() => setIsGroupInfoSheetOpen(true)} className="cursor-pointer hover:underline">{chatRoomData.participants.length} members</span>
             ) : otherUser?.isOnline ? (
                <span className="text-green-500">Online</span>
             ) : otherUser?.lastSeen && typeof otherUser.lastSeen === 'number' ? (
                formatRelative(new Date(otherUser.lastSeen), new Date())
             ) : ( "Offline" )}
            </p>
        </div>
        {user && (chatRoomData?.isGroup || otherUser) && currentUserProfile && (
            <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-5 w-5" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    {chatRoomData?.isGroup && (
                        <DropdownMenuItem onClick={() => setIsGroupInfoSheetOpen(true)}>
                            <Users className="mr-2 h-4 w-4" /> Group Info
                        </DropdownMenuItem>
                    )}
                    {!chatRoomData?.isGroup && otherUser && ( hasCurrentUserBlockedOtherUser ? (
                        <DropdownMenuItem onClick={handleUnblockUser} className="text-green-600 focus:text-green-700 focus:bg-green-50"> <UserCheck className="mr-2 h-4 w-4" /> Unblock User </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem onClick={handleBlockUser} className="text-destructive focus:text-destructive focus:bg-destructive/10"> <UserX className="mr-2 h-4 w-4" /> Block User </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} disabled={isReportingChat} className="text-amber-600 focus:text-amber-700 focus:bg-amber-50">
                            {isReportingChat ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
                            Report {chatRoomData?.isGroup ? "Group" : "Chat"}
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Report {chatRoomData?.isGroup ? chatRoomData.groupName : otherUser?.name || 'this user'}?</AlertDialogTitle>
                          <AlertDialogDescription> Reporting this will send recent messages to administrators for review. This action cannot be undone. </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter> <AlertDialogCancel>Cancel</AlertDialogCancel> <AlertDialogAction onClick={handleReportChat} disabled={isReportingChat} className="bg-destructive hover:bg-destructive/90"> {isReportingChat && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirm Report </AlertDialogAction> </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    {chatRoomData?.isGroup && (
                        <>
                        <DropdownMenuSeparator />
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" onSelect={e => e.preventDefault()}>
                                    <LogOutIcon className="mr-2 h-4 w-4" /> Leave Group
                                </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Leave Group: {chatRoomData.groupName}?</AlertDialogTitle>
                                    <AlertDialogDescription>Are you sure you want to leave this group? You will need to be re-added by an admin to rejoin.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter> <AlertDialogCancel>Cancel</AlertDialogCancel> <AlertDialogAction onClick={handleLeaveGroup} className="bg-destructive hover:bg-destructive/90">Leave</AlertDialogAction> </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        )}
      </header>

      {chatRoomData?.pinnedMessage && (typeof chatRoomData.pinnedMessage.pinnedUntil !== 'number' || chatRoomData.pinnedMessage.pinnedUntil > Date.now()) && (
        <div className="p-2.5 bg-primary/10 border-b border-primary/20 shadow-sm">
            <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-primary">
                    <Pin className="h-4 w-4" />
                    <span className="font-semibold">Pinned Message</span>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-primary/70 hover:text-primary" onClick={() => handleUnpinMessage()}>
                    <PinOff className="h-4 w-4" />
                </Button>
            </div>
            <div className="text-xs text-foreground/80 mt-1 pl-6">
                <span className="font-medium">{chatRoomData.pinnedMessage.senderName}:</span> {chatRoomData.pinnedMessage.text || "Attachment"}
                {chatRoomData.pinnedMessage.fileType && <span className="italic ml-1">({chatRoomData.pinnedMessage.fileType})</span>}
            </div>
             {chatRoomData.pinnedMessage.pinnedUntil && typeof chatRoomData.pinnedMessage.pinnedUntil === 'number' && (
                <p className="text-xs text-primary/70 text-right mt-0.5">
                    Pinned until: {format(new Date(chatRoomData.pinnedMessage.pinnedUntil), 'MMM d, HH:mm')}
                </p>
            )}
        </div>
      )}

      <ScrollArea className="flex-1 p-4 space-y-2" ref={scrollAreaRef}>
        {messages.map((msg, index) => {
          const messageDateStr = formatMessageDateSeparator(msg.timestamp);
          const showDateSeparator = messageDateStr !== lastDisplayedDate;
          if (showDateSeparator) { lastDisplayedDate = messageDateStr; }
          const isOwnMessage = msg.senderId === user?.uid;
          const senderAvatarUrl = msg.senderProfileImageUrl || chatRoomData?.participantDetails?.[msg.senderId]?.profileImageUrl;
          const senderDisplayName = msg.senderName || chatRoomData?.participantDetails?.[msg.senderId]?.name || 'User';

          return (
            <Fragment key={msg.id}>
              {showDateSeparator && ( <div className="flex justify-center my-4"> <span className="px-3 py-1 text-xs text-muted-foreground bg-muted rounded-full"> {messageDateStr} </span> </div> )}
              <div className={cn("flex items-end space-x-2 max-w-[75%] group mb-4", isOwnMessage ? "ml-auto flex-row-reverse space-x-reverse" : "mr-auto")}>
                {(!isOwnMessage || chatRoomData?.isGroup) && (
                    <Link href={`/profile/${msg.senderId}`}>
                        <Avatar className="h-7 w-7 self-start cursor-pointer hover:opacity-80 transition-opacity">
                            <AvatarImage src={senderAvatarUrl} alt={senderDisplayName} data-ai-hint="avatar profile"/>
                            <AvatarFallback className="bg-muted text-muted-foreground text-xs">{getInitials(senderDisplayName)}</AvatarFallback>
                        </Avatar>
                    </Link>
                )}
                <div className={cn(
                    "p-2.5 rounded-xl shadow relative",
                    isOwnMessage ? "bg-primary text-primary-foreground rounded-br-none" : "bg-secondary text-secondary-foreground rounded-bl-none"
                )}>
                  {chatRoomData?.isGroup && !isOwnMessage && (
                      <p className="text-xs font-semibold mb-0.5" style={{color: `hsl(var(--${isOwnMessage ? 'primary-foreground' : 'foreground'})) opacity(0.8)`}}>{senderDisplayName}</p>
                  )}
                  {msg.replyTo && renderReplyPreview(msg.replyTo)}
                  {editingMessage?.id === msg.id ? (
                     <div className="space-y-2">
                        <Textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={3}
                            className="bg-card text-card-foreground text-sm w-full min-w-[200px]"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
                                if (e.key === 'Escape') { handleCancelEdit(); }
                            }}
                        />
                        <div className="flex justify-end space-x-2">
                            <Button size="xs" variant="ghost" onClick={handleCancelEdit}>Cancel</Button>
                            <Button size="xs" onClick={handleSaveEdit} disabled={isSending || editText === editingMessage.text}>
                                {isSending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                            </Button>
                        </div>
                    </div>
                  ) : (
                    <>
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                        {msg.fileUrl && renderFileMessage(msg)}
                    </>
                  )}
                   <div className={cn("text-xs mt-1 flex items-center", isOwnMessage ? "justify-end" : "justify-start")}>
                        {msg.editedAt && <span className="italic mr-1.5 opacity-70">(edited)</span>}
                        <span className="opacity-70">{msg.timestamp ? format(new Date(msg.timestamp as number), 'HH:mm') : ''}</span>
                        {isOwnMessage && msg.status && (
                           <span className="ml-1.5">
                                {msg.status === 'sent' && <Check className="h-3.5 w-3.5 opacity-70" />}
                                {msg.status === 'seen' && <CheckCheck className="h-3.5 w-3.5 text-blue-400" />}
                           </span>
                        )}
                    </div>
                </div>
                 {user && msg.senderId === user.uid && !msg.isDeleted && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align={isOwnMessage ? "end" : "start"}>
                            <DropdownMenuItem onClick={() => handleSetReplyToMessage(msg)} disabled={msg.isDeleted}>
                                <CornerDownLeft className="mr-2 h-4 w-4" /> Reply
                            </DropdownMenuItem>
                            {!msg.fileUrl && (
                                <DropdownMenuItem onClick={() => handleInitiateEdit(msg)} disabled={msg.isDeleted}>
                                <Edit2 className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                            )}
                             {chatRoomData?.pinnedMessage?.id === msg.id ? (
                                <DropdownMenuItem onClick={() => handleUnpinMessage()} className="text-amber-600 focus:text-amber-700">
                                    <PinOff className="mr-2 h-4 w-4" /> Unpin
                                </DropdownMenuItem>
                            ) : (
                                <DropdownMenuItem onClick={() => openPinDialog(msg)} disabled={msg.isDeleted} className="text-amber-600 focus:text-amber-700">
                                    <Pin className="mr-2 h-4 w-4" /> Pin Message
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={(e) => e.preventDefault()}>
                                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                                    </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader><AlertDialogTitle>Delete Message?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone. The message will be removed for everyone.</AlertDialogDescription></AlertDialogHeader>
                                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteMessage(msg)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
              </div>
            </Fragment>
          );
        })}
        <div ref={messagesEndRef} />
      </ScrollArea>

      <AlertDialog open={showPinDurationDialog} onOpenChange={setShowPinDurationDialog}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Pin Message For</AlertDialogTitle>
                <AlertDialogDescription>This message will be pinned at the top of the chat.</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-3">
                <Button onClick={() => handlePinMessage('24h')} variant="outline">24 Hours</Button>
                <Button onClick={() => handlePinMessage('7d')} variant="outline">7 Days</Button>
                <Button onClick={() => handlePinMessage('forever')} variant="outline">Forever</Button>
            </div>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {(!chatRoomData?.isGroup && (amIBlockedByOtherUser || hasCurrentUserBlockedOtherUser)) && (
         <div className="p-3 text-center text-sm text-destructive-foreground bg-destructive/80 border-t border-border">
            {amIBlockedByOtherUser && `You have been blocked by ${otherUser?.name || 'this user'}.`}
            {hasCurrentUserBlockedOtherUser && `You have blocked ${otherUser?.name || 'this user'}.`}
            You cannot send messages.
        </div>
      )}

      {replyingToMessage && (
        <div className="p-2.5 border-t border-b border-border bg-muted/30 relative">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-xs font-semibold text-primary">Replying to {replyingToMessage.senderName}</p>
                    <p className="text-xs text-muted-foreground italic truncate max-w-xs sm:max-w-sm md:max-w-md">
                        {replyingToMessage.text ? replyingToMessage.text.substring(0,100) : (replyingToMessage.fileName || "Attachment")}
                    </p>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={handleCancelReply}>
                    <XCircle className="h-4 w-4"/>
                </Button>
            </div>
        </div>
      )}

      {(selectedFile || isUploadingFile || uploadProgress !== null) && !isChatDisabled && (
        <div className="p-3 border-t border-border bg-muted/30">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2 overflow-hidden">
              {filePreview && selectedFile?.type.startsWith("image/") ? (
                <Image src={filePreview} alt="Preview" width={40} height={40} className="rounded object-cover" data-ai-hint="image preview"/>
              ) : (
                <FileText className="h-8 w-8 text-primary" />
              )}
              <div className="text-xs overflow-hidden">
                <p className="font-medium text-foreground truncate">{selectedFile?.name || uploadedFileDetails?.name}</p>
                <p className="text-muted-foreground">
                  {selectedFile?.size ? `${(selectedFile.size / (1024*1024)).toFixed(2)} MB` : ''}
                  {isUploadingFile && uploadProgress !== null && ` - Uploading: ${Math.round(uploadProgress)}%`}
                  {uploadedFileDetails && !isUploadingFile && " - Ready to send"}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={handleRemoveSelectedFile}>
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
          {isUploadingFile && uploadProgress !== null && (
            <Progress value={uploadProgress} className="h-1.5 mt-1.5" />
          )}
        </div>
      )}

      <footer className="p-3 border-t border-border">
        <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            accept="image/*,application/pdf,.doc,.docx,.txt,audio/*,video/*"
            disabled={isChatDisabled}
          />
           <Button type="button" variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isChatDisabled}>
            <Paperclip className="h-5 w-5" />
          </Button>
          <Input
            ref={messageInputRef}
            type="text"
            placeholder="Type a message..."
            value={newMessage}
            onChange={handleNewMessageChange}
            className="flex-1"
            disabled={isChatDisabled}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e as unknown as FormEvent);
                }
            }}
          />
          <Button type="button" variant="ghost" size="icon" disabled={isChatDisabled}>
            <Smile className="h-5 w-5" />
          </Button>
          <Button type="submit" size="icon" disabled={isChatDisabled || (!newMessage.trim() && !uploadedFileDetails)}>
            {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </form>
      </footer>

    {chatRoomData?.isGroup && (
      <Sheet open={isGroupInfoSheetOpen} onOpenChange={setIsGroupInfoSheetOpen}>
        <SheetContent className="sm:max-w-md p-0 flex flex-col">
            <SheetHeader className="p-4 border-b">
                <SheetTitle className="flex items-center gap-2">
                    <Avatar className="h-10 w-10">
                        <AvatarImage src={chatRoomData.groupImage || undefined} alt={chatRoomData.groupName} data-ai-hint="group avatar" />
                        <AvatarFallback><Users className="h-5 w-5" /></AvatarFallback>
                    </Avatar>
                    <span>{chatRoomData.groupName}</span>
                </SheetTitle>
                <SheetDescription>{chatRoomData.participants.length} members</SheetDescription>
            </SheetHeader>
            <ScrollArea className="flex-1 p-4">
                <h3 className="text-sm font-medium mb-2 text-muted-foreground">Members</h3>
                {isLoadingGroupMembers && <Loader2 className="animate-spin mx-auto my-4" />}
                {!isLoadingGroupMembers && groupParticipants.map(member => (
                    <div key={member.uid} className="flex items-center justify-between py-2 hover:bg-accent/50 px-2 rounded-md">
                        <Link href={`/profile/${member.uid}`} className="flex items-center gap-3" onClick={() => setIsGroupInfoSheetOpen(false)}>
                            <Avatar className="h-9 w-9">
                                <AvatarImage src={member.profileImageUrl} alt={member.name} data-ai-hint="avatar profile" />
                                <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
                            </Avatar>
                            <div>
                                <p className="text-sm font-medium text-foreground">{member.name} {member.uid === currentUserProfile?.uid && "(You)"}</p>
                                <p className="text-xs text-muted-foreground">@{member.username}</p>
                            </div>
                        </Link>
                        <div>
                            {chatRoomData.admins?.includes(member.uid) && <Crown className="h-4 w-4 text-yellow-500 mr-2" title="Admin" />}
                            {isChatAdmin && member.uid !== currentUserProfile?.uid && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleRemoveMemberFromGroup(member.uid)} title="Remove member">
                                    <UserMinus className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                ))}

                {isChatAdmin && (
                    <div className="mt-6 pt-4 border-t">
                        <h3 className="text-sm font-medium mb-2 text-muted-foreground">Add Members</h3>
                        <Input
                          type="search"
                          placeholder="Search users to add..."
                          value={userSearchTermForAdding}
                          onChange={(e) => setUserSearchTermForAdding(e.target.value)}
                          className="mb-2"
                        />
                        <ScrollArea className="h-40 border rounded-md p-1">
                          {allUsersForAdding.filter(u =>
                            !chatRoomData.participants.includes(u.uid) &&
                            (u.name?.toLowerCase().includes(userSearchTermForAdding.toLowerCase()) || u.username?.toLowerCase().includes(userSearchTermForAdding.toLowerCase()))
                          ).map(userToAdd => (
                            <div key={userToAdd.uid} className="flex items-center justify-between p-1.5 hover:bg-accent rounded-md">
                                <div className="flex items-center gap-2">
                                    <Avatar className="h-7 w-7">
                                        <AvatarImage src={userToAdd.profileImageUrl} alt={userToAdd.name} data-ai-hint="avatar profile" />
                                        <AvatarFallback>{getInitials(userToAdd.name)}</AvatarFallback>
                                    </Avatar>
                                    <span className="text-xs">{userToAdd.name} (@{userToAdd.username})</span>
                                </div>
                                <Button size="xs" variant="outline" onClick={() => handleAddMemberToGroup(userToAdd.uid)} disabled={isSending}>
                                  <UserPlus className="h-3 w-3 mr-1"/> Add
                                </Button>
                            </div>
                          ))}
                        </ScrollArea>
                    </div>
                )}
            </ScrollArea>
            <SheetFooter className="p-4 border-t">
                 <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" className="w-full">
                            <LogOutIcon className="mr-2 h-4 w-4" /> Leave Group
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Leave Group: {chatRoomData.groupName}?</AlertDialogTitle>
                            <AlertDialogDescription>Are you sure you want to leave this group? You will need to be re-added by an admin to rejoin.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter> <AlertDialogCancel>Cancel</AlertDialogCancel> <AlertDialogAction onClick={handleLeaveGroup} className="bg-destructive hover:bg-destructive/90">Leave</AlertDialogAction> </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </SheetFooter>
        </SheetContent>
      </Sheet>
    )}
    </div>
  );
}
