
import type { Timestamp } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  email: string | null;
  name: string;
  username: string;
  profileImageUrl?: string;
  gender?: string;
  createdAt?: string | number | Timestamp;
  blockedUsers?: string[];
  isAdmin?: boolean;
  isDisabled?: boolean;
  disabledUntil?: Timestamp | number | string | null;
  isOnline?: boolean; // Added for presence
  lastSeen?: Timestamp | number | string | null; // Added for presence
}

export interface StatusUpdate {
  id:string;
  userId: string;
  userName: string;
  userProfileImageUrl?: string;
  text: string;
  imageUrl?: string;
  createdAt: string | number | Timestamp;
  likes?: string[];
  comments?: Comment[];
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  userProfileImageUrl?: string;
  text: string;
  createdAt: string | number | Timestamp;
}

export interface ChatRoom {
  id: string;
  participants: string[];
  createdAt: string | number | Timestamp;
  updatedAt: string | number | Timestamp;
  lastMessage?: Partial<ChatMessage> | null;
  lastMessageId?: string;
  pinnedMessage?: (Partial<ChatMessage> & { id: string }) | null;
  typing?: Record<string, boolean>; // Added for typing indicator: { userId: true }
}

export interface DashboardChatRoomDisplay extends ChatRoom {
  otherParticipant: UserProfile | null;
}

// Snippet of a message, used for replies and reports
export interface ChatMessageReplySnippet {
  messageId: string;
  senderId: string;
  senderName: string;
  text?: string; // Snippet of the original text
  fileType?: ChatMessage['fileType']; // Type of file if original was a file
  fileName?: string; // Name of file if original was a file
}

export interface ChatMessage {
  id: string;
  chatRoomId: string;
  senderId: string;
  senderName: string;
  text?: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: 'image' | 'pdf' | 'doc' | 'docx' | 'txt' | 'audio' | 'video' | 'other';
  fileSize?: number;
  timestamp: string | number | Timestamp;
  status: 'sent' | 'seen';
  isDeleted?: boolean;
  editedAt?: Timestamp | number | string | null;
  isPinned?: boolean;
  pinnedByUid?: string;
  pinnedUntil?: Timestamp | number | string | null;
  replyTo?: ChatMessageReplySnippet | null; // Added for reply functionality
}

export interface ChatMessageReportSnippet { // Kept separate for clarity if report needs different fields later
  senderId: string;
  senderName: string;
  text?: string;
  timestamp: string | number | Timestamp;
}

export type ReportStatus = "Pending" | "Reviewed - No Action" | "Reviewed - Action Taken";

export interface ChatReport {
  id: string;
  chatRoomId: string;
  reportedByUid: string;
  reportedUserName?: string;
  reportedUserUid: string;
  targetUserName?: string;
  timestamp: Timestamp;
  status: ReportStatus;
  lastThreeMessages: ChatMessageReportSnippet[];
  adminNotes?: string;
}
