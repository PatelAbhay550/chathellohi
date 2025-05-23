
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
import { ArrowLeft, Send, Paperclip, Smile, Loader2, Check, CheckCheck, FileText, Image as ImageIcon, XCircle, Music2, Video, MoreVertical, UserX, UserCheck, ShieldAlert, MoreHorizontal, Pin, PinOff, Edit2, Trash2, CornerDownLeft, MessageCircle, Quote } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import type { ChatMessage, UserProfile, ChatRoom, ChatMessageReportSnippet, ChatMessageReplySnippet } from '@/types';
import { cn } from '@/lib/utils';
import { db, storage } from '@/lib/firebase';
import {
  doc,
  getDoc,
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
  getDocs,
  deleteField
} from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { format, isToday, isYesterday, differenceInCalendarDays, addHours, addDays, formatDistanceToNowStrict, formatRelative } from 'date-fns';

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const TYPING_TIMEOUT_MS = 3000; // 3 seconds

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const chatId = params.chatId as string;
  const { user, userProfile: currentUserProfileDetails } = useAuth();
  const { toast } = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [chatRoomData, setChatRoomData] = useState<ChatRoom | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadedFileDetails, setUploadedFileDetails] = useState<{ url: string; name: string; type: ChatMessage['fileType']; size: number } | null>(null);

  const [amIBlockedByOtherUser, setAmIBlockedByOtherUser] = useState(false);
  const [hasCurrentUserBlockedOtherUser, setHasCurrentUserBlockedOtherUser] = useState(false);
  const [isReportingChat, setIsReportingChat] = useState(false);

  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [editText, setEditText] = useState('');

  const [showPinDurationDialog, setShowPinDurationDialog] = useState(false);
  const [messageToPin, setMessageToPin] = useState<ChatMessage | null>(null);

  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [replyingToMessage, setReplyingToMessage] = useState<ChatMessage | null>(null);


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

  // Effect for deriving isOtherUserTyping and cleaning up typing status on unmount
  useEffect(() => {
    if (chatRoomData?.typing && otherUser?.uid && chatRoomData.typing[otherUser.uid]) {
      setIsOtherUserTyping(true);
    } else {
      setIsOtherUserTyping(false);
    }

    // Cleanup typing status on component unmount
    return () => {
      if (user?.uid && chatId) {
        const chatRoomRef = doc(db, "chat_rooms", chatId);
        updateDoc(chatRoomRef, {
          [`typing.${user.uid}`]: deleteField()
        }).catch(e => console.warn("Failed to clear typing status on unmount:", e));
      }
    };
  }, [chatRoomData, otherUser?.uid, chatId, user?.uid]);


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

    if(user && !currentUserProfile) { 
      const currentUserDocRef = doc(db, "users", user.uid);
      unsubscribeCurrentUserProfile = onSnapshot(currentUserDocRef, (snap) => {
        if(snap.exists()) {
          setCurrentUserProfile({ uid: snap.id, ...snap.data() } as UserProfile);
        }
      }, (error) => {
        console.error("Error fetching current user profile:", error);
        toast({title: "Error", description: "Failed to load your profile details.", variant: "destructive" });
      });
    }


    const unsubscribeChatRoom = onSnapshot(chatRoomDocRef, async (docSnap) => {
      if (docSnap.exists()) {
        const roomData = docSnap.data() as ChatRoom;
        
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

        const otherParticipantId = roomData.participants.find(pId => pId !== user.uid);

        if (otherParticipantId && (!otherUser || otherUser.uid !== otherParticipantId)) {
          if (unsubscribeOtherUserProfile) unsubscribeOtherUserProfile(); 
          const otherUserDocRef = doc(db, "users", otherParticipantId);
          unsubscribeOtherUserProfile = onSnapshot(otherUserDocRef, (otherUserSnap) => {
             if (otherUserSnap.exists()) {
                setOtherUser({ uid: otherUserSnap.id, ...otherUserSnap.data() } as UserProfile);
              } else {
                toast({title: "Error", description: "Could not find the other user.", variant: "destructive" });
                setOtherUser(null);
              }
          }, (error) => {
            console.error("Error fetching other user profile:", error);
            toast({title: "Error", description: "Failed to load other user details.", variant: "destructive" });
          });
        } else if (!otherParticipantId) {
            setOtherUser(null); 
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
            pinnedUntil: (data.pinnedUntil as Timestamp)?.toMillis?.() || data.pinnedUntil,
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

      const currentChatRoomData = chatRoomData; 
      const currentOtherUser = otherUser;
      const currentLocalUserProfile = currentUserProfile; 

      if (user && currentOtherUser && currentLocalUserProfile && currentChatRoomData && typeof document !== 'undefined' && document.hasFocus()) {
        const batch = writeBatch(db);
        let lastMessageOfTheRoomWasUpdatedToSeen = false;

        fetchedMessagesData.forEach(msg => {
          if (msg.senderId === currentOtherUser.uid && msg.status !== 'seen') {
            const msgRef = doc(db, "chat_rooms", chatId, "messages", msg.id);
            batch.update(msgRef, { status: 'seen' });
            if (currentChatRoomData.lastMessageId === msg.id) {
              lastMessageOfTheRoomWasUpdatedToSeen = true;
            }
          }
        });

        try {
          if (batch["_mutations" as any].length > 0) { 
            await batch.commit();
            if (lastMessageOfTheRoomWasUpdatedToSeen) {
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

  useEffect(() => {
    if (currentUserProfile && otherUser) {
      setHasCurrentUserBlockedOtherUser(currentUserProfile.blockedUsers?.includes(otherUser.uid) || false);
      setAmIBlockedByOtherUser(otherUser.blockedUsers?.includes(currentUserProfile.uid) || false);
    } else {
      setHasCurrentUserBlockedOtherUser(false);
      setAmIBlockedByOtherUser(false);
    }
  }, [currentUserProfile, otherUser]);

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

    if (amIBlockedByOtherUser || hasCurrentUserBlockedOtherUser) {
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
    if (!user || !otherUser || !currentUserProfile) return;
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
    if (!user || !otherUser || !currentUserProfile) return;
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
    if (!currentUserProfile || !otherUser || !chatId) {
        toast({ title: "Error", description: "Cannot report chat. Missing information.", variant: "destructive" });
        return;
    }
    setIsReportingChat(true);
    try {
        const messagesQuery = query(
            collection(db, "chat_rooms", chatId, "messages"),
            orderBy("timestamp", "desc"),
            limit(3)
        );
        const messagesSnapshot = await getDocs(messagesQuery);
        const lastThreeMessages: ChatMessageReportSnippet[] = [];
        messagesSnapshot.forEach(doc => {
            const data = doc.data() as ChatMessage; 
            lastThreeMessages.unshift({
                senderId: data.senderId,
                senderName: data.senderName,
                text: data.text,
                timestamp: data.timestamp,
            });
        });

        const reportPayload = {
            chatRoomId: chatId,
            reportedByUid: currentUserProfile.uid,
            reportedUserName: currentUserProfile.name || currentUserProfile.username,
            reportedUserUid: otherUser.uid,
            targetUserName: otherUser.name || otherUser.username,
            timestamp: serverTimestamp() as Timestamp,
            status: "Pending" as const,
            lastThreeMessages: lastThreeMessages,
        };

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

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setEditText('');
  };

  const handleSaveEdit = async () => {
    if (!editingMessage || !user) return;
    setIsSending(true);
    const messageRef = doc(db, "chat_rooms", chatId, "messages", editingMessage.id);
    try {
      await updateDoc(messageRef, {
        text: editText,
        editedAt: serverTimestamp()
      });

      if (chatRoomData?.lastMessageId === editingMessage.id) {
        const chatRoomRef = doc(db, "chat_rooms", chatId);
        await updateDoc(chatRoomRef, {
          "lastMessage.text": editText.substring(0, 50),
          "lastMessage.timestamp": serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      toast({ title: "Message Edited" });
      handleCancelEdit();
    } catch (error) {
      toast({ title: "Error", description: "Could not edit message.", variant: "destructive" });
      console.error("Error editing message:", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteMessage = async (message: ChatMessage) => {
    if (message.senderId !== user?.uid || !chatId) return;
    setIsSending(true);
    const messageRef = doc(db, "chat_rooms", chatId, "messages", message.id);
    try {
      await updateDoc(messageRef, {
        text: "This message was deleted",
        isDeleted: true,
        fileUrl: deleteField(),
        fileName: deleteField(),
        fileType: deleteField(),
        fileSize: deleteField(),
        editedAt: serverTimestamp(),
        replyTo: deleteField(), 
      });

      if (chatRoomData?.pinnedMessage?.id === message.id) {
        await handleUnpinMessage(message.id, true);
      }

      if (chatRoomData?.lastMessageId === message.id) {
        const chatRoomRef = doc(db, "chat_rooms", chatId);
        await updateDoc(chatRoomRef, {
          "lastMessage.text": "This message was deleted",
          "lastMessage.fileType": deleteField(),
          "lastMessage.fileName": deleteField(),
          "lastMessage.timestamp": serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      toast({ title: "Message Deleted" });
    } catch (error) {
      toast({ title: "Error", description: "Could not delete message.", variant: "destructive" });
      console.error("Error deleting message:", error);
    } finally {
      setIsSending(false);
    }
  };

  const openPinDialog = (message: ChatMessage) => {
    if (message.isDeleted) return;
    setMessageToPin(message);
    setShowPinDurationDialog(true);
  };

  const handlePinMessage = async (durationKey: '24h' | '7d' | 'forever') => {
    if (!messageToPin || !user || !chatId || !currentUserProfile) return;
    setShowPinDurationDialog(false);
    setIsSending(true);

    let pinnedUntilTimestamp: Timestamp | null = null;
    const now = new Date();
    if (durationKey === '24h') {
      pinnedUntilTimestamp = Timestamp.fromDate(addHours(now, 24));
    } else if (durationKey === '7d') {
      pinnedUntilTimestamp = Timestamp.fromDate(addDays(now, 7));
    }

    const messageRef = doc(db, "chat_rooms", chatId, "messages", messageToPin.id);
    const chatRoomRef = doc(db, "chat_rooms", chatId);

    try {
      if (chatRoomData?.pinnedMessage?.id && chatRoomData.pinnedMessage.id !== messageToPin.id) {
        const oldPinnedMessageRef = doc(db, "chat_rooms", chatId, "messages", chatRoomData.pinnedMessage.id);
        await updateDoc(oldPinnedMessageRef, {
          isPinned: false,
          pinnedByUid: deleteField(),
          pinnedUntil: deleteField(),
        });
      }

      const messageUpdateData: any = {
        isPinned: true,
        pinnedByUid: currentUserProfile.uid,
      };
      if (pinnedUntilTimestamp) {
        messageUpdateData.pinnedUntil = pinnedUntilTimestamp;
      } else {
        messageUpdateData.pinnedUntil = null; 
      }
      await updateDoc(messageRef, messageUpdateData);

      const pinnedMessageForChatRoom: any = {
        id: messageToPin.id,
        text: messageToPin.text ? messageToPin.text.substring(0, 100) : (messageToPin.fileName || "Attachment"),
        senderId: messageToPin.senderId,
        senderName: messageToPin.senderName,
        timestamp: messageToPin.timestamp,
        pinnedByUid: currentUserProfile.uid,
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
         pinnedMessageForChatRoom.pinnedUntil = null;
      }


      await updateDoc(chatRoomRef, {
        pinnedMessage: pinnedMessageForChatRoom,
        updatedAt: serverTimestamp()
      });
      toast({ title: "Message Pinned" });
    } catch (error) {
      console.error("Error pinning message:", error);
      toast({ title: "Error", description: "Could not pin message.", variant: "destructive" });
    } finally {
      setIsSending(false);
      setMessageToPin(null);
    }
  };

  const handleUnpinMessage = async (messageIdToUnpin?: string, silent = false) => {
    const targetMessageId = messageIdToUnpin || chatRoomData?.pinnedMessage?.id;
    if (!targetMessageId || !chatId) return;
    setIsSending(true);

    const messageRef = doc(db, "chat_rooms", chatId, "messages", targetMessageId);
    const chatRoomRef = doc(db, "chat_rooms", chatId);

    try {
      await updateDoc(messageRef, {
        isPinned: false,
        pinnedByUid: deleteField(),
        pinnedUntil: deleteField(),
      });
      await updateDoc(chatRoomRef, {
        pinnedMessage: deleteField(),
        updatedAt: serverTimestamp()
      });
      if (!silent) {
        toast({ title: "Message Unpinned" });
      }
    } catch (error) {
      console.error("Error unpinning message:", error);
      if (!silent) {
        toast({ title: "Error", description: "Could not unpin message.", variant: "destructive" });
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleSetReplyToMessage = (message: ChatMessage) => {
    if (message.isDeleted) {
        toast({ title: "Cannot reply", description: "This message has been deleted.", variant: "destructive"});
        return;
    }
    setReplyingToMessage(message);
    messageInputRef.current?.focus();
  };

  const handleCancelReply = () => {
    setReplyingToMessage(null);
  };

  const getInitials = (name?: string) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2) : 'U';

  const renderFileMessage = (msg: ChatMessage) => {
    if (!msg.fileUrl || !msg.fileName || !msg.fileType) return null;
    const commonLinkClass = "hover:underline text-primary underline-offset-2";

    switch (msg.fileType) {
      case 'image':
        return (
          <Link href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="mt-1.5 block max-w-xs md:max-w-sm rounded-md overflow-hidden border border-border">
            <Image
              src={msg.fileUrl}
              alt={msg.fileName || 'Chat image'}
              width={300}
              height={200}
              className="object-cover w-full h-auto"
              data-ai-hint="chat image content"
              unoptimized={true}
            />
          </Link>
        );
      case 'pdf':
      case 'doc':
      case 'docx':
      case 'txt':
        return (
          <Link href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className={cn("flex items-center space-x-2 mt-1.5 p-2 rounded-md bg-secondary/50 hover:bg-secondary/80 transition-colors", commonLinkClass)}>
            <FileText className="h-6 w-6 flex-shrink-0 text-muted-foreground" />
            <span className="truncate text-sm">{msg.fileName}</span>
          </Link>
        );
      case 'audio':
        return (
          <div className="mt-1.5">
            <div className="flex items-center space-x-2 mb-1">
              <Music2 className="h-5 w-5 text-muted-foreground"/>
              <span className="text-sm truncate">{msg.fileName}</span>
            </div>
            <audio controls src={msg.fileUrl} className="w-full max-w-xs h-10">
              Your browser does not support the audio element. <a href={msg.fileUrl} download={msg.fileName} className={commonLinkClass}>Download audio</a>
            </audio>
          </div>
        );
      case 'video':
        return (
          <div className="mt-1.5">
             <div className="flex items-center space-x-2 mb-1">
              <Video className="h-5 w-5 text-muted-foreground"/>
              <span className="text-sm truncate">{msg.fileName}</span>
            </div>
            <video controls src={msg.fileUrl} className="w-full max-w-xs rounded-md border border-border" preload="metadata">
              Your browser does not support the video tag. <a href={msg.fileUrl} download={msg.fileName} className={commonLinkClass}>Download video</a>
            </video>
          </div>
        );
      default:
        return (
           <Link href={msg.fileUrl} target="_blank" rel="noopener noreferrer" download={msg.fileName} className={cn("flex items-center space-x-2 mt-1.5 p-2 rounded-md bg-secondary/50 hover:bg-secondary/80 transition-colors", commonLinkClass)}>
            <Paperclip className="h-6 w-6 flex-shrink-0 text-muted-foreground" />
            <span className="truncate text-sm">{msg.fileName}</span>
          </Link>
        );
    }
  };

  const renderReplyPreview = (replyTo: ChatMessageReplySnippet) => {
    let contentPreview = replyTo.text || '';
    if (replyTo.fileType === 'image') {
        contentPreview = `Photo: ${replyTo.fileName || 'Image'}`;
    } else if (replyTo.fileType) {
        contentPreview = `File: ${replyTo.fileName || 'Attachment'}`;
    }

    return (
        <div className="mb-1 p-2 border-l-2 border-primary bg-primary/10 rounded-md text-xs text-primary-foreground/80">
            <div className="font-semibold text-primary">{replyTo.senderName}</div>
            <p className="truncate text-foreground/70">{contentPreview}</p>
        </div>
    );
  }

  const formatMessageDateSeparator = (timestamp: ChatMessage['timestamp']): string => {
    const date = new Date(timestamp as number);
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    if (differenceInCalendarDays(new Date(), date) < 7) return format(date, 'EEEE');
    return format(date, 'dd/MM/yyyy');
  };

  const formatLastSeen = (timestamp: UserProfile['lastSeen']) => {
    if (!timestamp) return '';
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : new Date(timestamp as number);
    return `Last seen ${formatRelative(date, new Date())}`;
  };

  const isChatDisabled = amIBlockedByOtherUser || hasCurrentUserBlockedOtherUser || isSending || isUploadingFile;

  if (isLoading && !messages.length) {
    return (
      <div className="flex flex-col h-[calc(100vh-var(--header-height,4rem)-2rem)] md:h-[calc(100vh-var(--header-height,4rem)-4rem)] items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-2">Loading chat...</p>
      </div>
    );
  }

  if (!otherUser && !currentUserProfile && !isLoading) {
     return <div className="flex flex-col h-full items-center justify-center p-4"><p>Could not load chat participants. Try refreshing.</p></div>;
  }

  let lastDisplayedDate: string | null = null;

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height,4rem)-2rem)] md:h-[calc(100vh-var(--header-height,4rem)-4rem)] bg-card shadow-lg rounded-lg overflow-hidden">
      <header className="flex items-center p-3 border-b border-border">
        <Button variant="ghost" size="icon" className="mr-2" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        {otherUser && (
          <Link href={`/profile/${otherUser.uid}`}>
            <Avatar className="h-9 w-9 cursor-pointer hover:opacity-80 transition-opacity">
              <AvatarImage src={otherUser?.profileImageUrl} alt={otherUser?.name} data-ai-hint="avatar profile"/>
              <AvatarFallback className="bg-muted text-muted-foreground">{getInitials(otherUser?.name)}</AvatarFallback>
            </Avatar>
          </Link>
        )}
        <div className="ml-3 flex-1">
          {otherUser ? (
            <>
            <Link href={`/profile/${otherUser.uid}`} className="hover:underline">
              <p className="font-semibold text-foreground">{otherUser.name || 'Chat'}</p>
            </Link>
            <p className="text-xs text-muted-foreground h-4">
              {isOtherUserTyping ? (
                <span className="italic text-primary animate-pulse">typing...</span>
              ) : otherUser.isOnline ? (
                <span className="text-green-500">Online</span>
              ) : otherUser.lastSeen ? (
                formatLastSeen(otherUser.lastSeen)
              ) : (
                "Offline"
              )}
            </p>
            </>
          ) : (
            <p className="font-semibold text-foreground">Chat</p>
          )}
        </div>
        {user && otherUser && currentUserProfile && (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                        <MoreVertical className="h-5 w-5" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    {hasCurrentUserBlockedOtherUser ? (
                        <DropdownMenuItem onClick={handleUnblockUser} className="text-green-600 focus:text-green-700 focus:bg-green-50">
                            <UserCheck className="mr-2 h-4 w-4" /> Unblock User
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem onClick={handleBlockUser} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                            <UserX className="mr-2 h-4 w-4" /> Block User
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} disabled={isReportingChat} className="text-amber-600 focus:text-amber-700 focus:bg-amber-50">
                            {isReportingChat ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
                            Report Chat
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Report Chat with {otherUser?.name || 'this user'}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Reporting this chat will send the last three messages to the administrators for review.
                            This action cannot be undone. Are you sure you want to proceed?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleReportChat}
                            disabled={isReportingChat}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            {isReportingChat ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Confirm Report
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                </DropdownMenuContent>
            </DropdownMenu>
        )}
      </header>

      {chatRoomData?.pinnedMessage && (
        <div className="p-2.5 border-b border-primary/30 bg-primary/10 text-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary-foreground/80">
                <Pin className="h-4 w-4 text-primary" />
                <div className="flex-1 truncate">
                    <span className="font-semibold text-primary">{chatRoomData.pinnedMessage.senderName}: </span>
                    <span className="text-foreground/80">{chatRoomData.pinnedMessage.text || chatRoomData.pinnedMessage.fileName || "Pinned Attachment"}</span>
                </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => handleUnpinMessage()} className="h-7 w-7 text-primary hover:text-primary/80">
              <PinOff className="h-4 w-4" />
            </Button>
          </div>
           {chatRoomData.pinnedMessage.pinnedUntil != null && typeof chatRoomData.pinnedMessage.pinnedUntil === 'number' && (
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
          if (showDateSeparator) {
            lastDisplayedDate = messageDateStr;
          }
          const isOwnMessage = msg.senderId === user?.uid;

          return (
            <Fragment key={msg.id}>
              {showDateSeparator && (
                <div className="flex justify-center my-4">
                  <span className="px-3 py-1 text-xs text-muted-foreground bg-muted rounded-full">
                    {messageDateStr}
                  </span>
                </div>
              )}

              <div className={cn("flex items-end space-x-2 max-w-[75%] group mb-4", isOwnMessage ? "ml-auto flex-row-reverse space-x-reverse" : "mr-auto")}>
                {!isOwnMessage && otherUser && (
                    <Link href={`/profile/${otherUser.uid}`}>
                        <Avatar className="h-7 w-7 self-start cursor-pointer hover:opacity-80 transition-opacity">
                            <AvatarImage src={otherUser.profileImageUrl} alt={otherUser.name} data-ai-hint="avatar profile"/>
                            <AvatarFallback className="bg-muted text-muted-foreground text-xs">{getInitials(otherUser.name)}</AvatarFallback>
                        </Avatar>
                    </Link>
                )}
                {isOwnMessage && currentUserProfile && (
                     <Link href={`/profile/${currentUserProfile.uid}`}>
                        <Avatar className="h-7 w-7 self-start cursor-pointer hover:opacity-80 transition-opacity">
                            <AvatarImage src={currentUserProfile.profileImageUrl} alt={currentUserProfile.name} data-ai-hint="avatar profile"/>
                            <AvatarFallback className="bg-muted text-muted-foreground text-xs">{getInitials(currentUserProfile.name)}</AvatarFallback>
                        </Avatar>
                    </Link>
                )}
                <div className={cn("p-2.5 rounded-xl shadow", isOwnMessage ? "bg-primary text-primary-foreground rounded-br-none" : "bg-secondary text-secondary-foreground rounded-bl-none")}>
                  {editingMessage?.id === msg.id ? (
                    <div className="space-y-2 w-64">
                        <Textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={3}
                            className="bg-card text-card-foreground text-sm p-2 focus-visible:ring-primary"
                            autoFocus
                        />
                        <div className="flex justify-end space-x-2">
                            <Button variant="ghost" size="sm" onClick={handleCancelEdit}>Cancel</Button>
                            <Button size="sm" onClick={handleSaveEdit} disabled={isSending}>
                                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                            </Button>
                        </div>
                    </div>
                  ) : (
                    <>
                      {msg.replyTo && renderReplyPreview(msg.replyTo)}
                      {msg.isDeleted ? (
                        <p className="text-sm italic opacity-70">{msg.text}</p>
                      ) : (
                        <>
                          {msg.text && <p className="text-sm whitespace-pre-wrap">{msg.text}</p>}
                          {msg.fileUrl && renderFileMessage(msg)}
                        </>
                      )}
                      <div className="flex items-center justify-end mt-1 space-x-1">
                        {msg.editedAt && !msg.isDeleted && (
                          <p className="text-xs opacity-60 italic">edited</p>
                        )}
                        <p className="text-xs opacity-70">
                          {msg.timestamp ? new Date(msg.timestamp as number).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}
                        </p>
                        {msg.senderId === user?.uid && !msg.isDeleted && (
                          <div className="flex items-center">
                            {msg.status === 'sent' && <Check className="h-3.5 w-3.5 opacity-70" />}
                            {msg.status === 'seen' && <CheckCheck className="h-3.5 w-3.5 text-blue-400" />}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
                {!editingMessage && ( 
                  <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                              <MoreHorizontal className="h-4 w-4" />
                          </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align={isOwnMessage ? "end" : "start"}>
                           <DropdownMenuItem onClick={() => handleSetReplyToMessage(msg)} disabled={msg.isDeleted}>
                                <CornerDownLeft className="mr-2 h-4 w-4" /> Reply
                            </DropdownMenuItem>
                          {isOwnMessage && !msg.isDeleted && (
                            <>
                              <DropdownMenuItem onClick={() => handleInitiateEdit(msg)}>
                                  <Edit2 className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openPinDialog(msg)} disabled={chatRoomData?.pinnedMessage?.id === msg.id}>
                                  <Pin className="mr-2 h-4 w-4" /> Pin
                              </DropdownMenuItem>
                              {chatRoomData?.pinnedMessage?.id === msg.id && (
                                  <DropdownMenuItem onClick={() => handleUnpinMessage()}>
                                      <PinOff className="mr-2 h-4 w-4" /> Unpin
                                  </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                      <DropdownMenuItem onSelect={e => e.preventDefault()} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                                      </DropdownMenuItem>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                      <AlertDialogHeader>
                                          <AlertDialogTitle>Delete Message?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                              This action cannot be undone. This will permanently delete the message for everyone.
                                          </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => handleDeleteMessage(msg)} className="bg-destructive hover:bg-destructive/90">
                                              Delete
                                          </AlertDialogAction>
                                      </AlertDialogFooter>
                                  </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}
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
            <AlertDialogTitle>Pin Message</AlertDialogTitle>
            <AlertDialogDescription>
              Choose how long you want to pin this message. Pinned messages are visible to everyone in the chat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col space-y-2 py-2">
            <Button variant="outline" onClick={() => handlePinMessage('24h')}>Pin for 24 hours</Button>
            <Button variant="outline" onClick={() => handlePinMessage('7d')}>Pin for 7 days</Button>
            <Button variant="outline" onClick={() => handlePinMessage('forever')}>Pin until unpinned</Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMessageToPin(null)}>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {(amIBlockedByOtherUser || hasCurrentUserBlockedOtherUser) && (
        <div className="p-3 border-t border-border bg-destructive/10 text-center">
            <p className="text-sm text-destructive-foreground">
                {amIBlockedByOtherUser ? `You have been blocked by ${otherUser?.name || 'this user'}.` : `You have blocked ${otherUser?.name || 'this user'}.`} You cannot send messages.
            </p>
        </div>
      )}

      {replyingToMessage && (
        <div className="p-2.5 border-t border-border bg-muted/30">
            <div className="flex items-start justify-between text-sm">
                <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">Replying to <span className="font-semibold text-foreground">{replyingToMessage.senderName}</span>:</p>
                    <p className="truncate text-foreground/80">
                        {replyingToMessage.text ? replyingToMessage.text : (
                            replyingToMessage.fileType === 'image' ? <><ImageIcon className="inline h-3 w-3 mr-1" /> Image: {replyingToMessage.fileName}</> :
                            replyingToMessage.fileType ? <><FileText className="inline h-3 w-3 mr-1" /> File: {replyingToMessage.fileName}</> :
                            "Message"
                        )}
                    </p>
                </div>
                <Button variant="ghost" size="icon" onClick={handleCancelReply} className="h-6 w-6 ml-2 flex-shrink-0">
                    <XCircle className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
            </div>
        </div>
      )}

      {(selectedFile || isUploadingFile || uploadProgress !== null) && !amIBlockedByOtherUser && !hasCurrentUserBlockedOtherUser && (
        <div className="p-3 border-t border-border bg-muted/50">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2 truncate">
              {filePreview && selectedFile?.type.startsWith("image/") ? (
                <Image src={filePreview} alt="Preview" width={32} height={32} className="rounded object-cover" data-ai-hint="file preview" unoptimized/>
              ) : (
                <FileText className="h-6 w-6 text-muted-foreground" />
              )}
              <span className="truncate">{selectedFile?.name || "Uploading..."}</span>
               {selectedFile && <span className="text-xs text-muted-foreground">({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</span>}
            </div>
            <Button variant="ghost" size="icon" onClick={handleRemoveSelectedFile} disabled={isUploadingFile} className="h-7 w-7">
              <XCircle className="h-5 w-5 text-destructive" />
            </Button>
          </div>
          {uploadProgress !== null && (
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
            aria-label="Attach file"
            disabled={isChatDisabled}
          />
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="text-muted-foreground hover:text-primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={isChatDisabled || !!uploadedFileDetails}
            title="Attach file"
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          <Input
            ref={messageInputRef}
            type="text"
            placeholder={uploadedFileDetails ? "Add a caption..." : "Type a message..."}
            value={newMessage}
            onChange={handleNewMessageChange}
            className="flex-grow"
            aria-label="Message input"
            autoComplete="off"
            disabled={isChatDisabled}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && (newMessage.trim() || uploadedFileDetails) && !isChatDisabled) {
                e.preventDefault();
                handleSendMessage(e as unknown as FormEvent);
              }
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="text-muted-foreground hover:text-primary"
            title="Add emoji"
            onClick={() => messageInputRef.current?.focus()}
            disabled={isChatDisabled} 
          >
            <Smile className="h-5 w-5" />
          </Button>
          <Button
            type="submit"
            size="icon"
            className="bg-primary hover:bg-primary/90"
            disabled={isChatDisabled || (!newMessage.trim() && !uploadedFileDetails) }
            title="Send message"
            >
            {isSending || isUploadingFile ? <Loader2 className="h-5 w-5 animate-spin text-primary-foreground" /> : <Send className="h-5 w-5 text-primary-foreground" />}
          </Button>
        </form>
      </footer>
    </div>
  );
}

