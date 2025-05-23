
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
  isOnline?: boolean; 
  lastSeen?: Timestamp | number | string | null; 
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
  participants: string[]; // UIDs of participants
  participantDetails?: Record<string, { name?: string; profileImageUrl?: string }>; // Denormalized for quick display
  createdAt: string | number | Timestamp;
  updatedAt: string | number | Timestamp;
  lastMessage?: Partial<ChatMessage> | null;
  lastMessageId?: string;
  pinnedMessage?: (Partial<ChatMessage> & { id: string }) | null;
  typing?: Record<string, boolean>;

  // Group specific fields
  isGroup?: boolean;
  groupName?: string;
  groupImage?: string; // URL for group avatar
  admins?: string[]; // UIDs of group admins
  createdBy?: string; // UID of the user who created the group
}

export interface DashboardChatRoomDisplay extends ChatRoom {
  otherParticipant: UserProfile | null; // For P2P chats
}

// Snippet of a message, used for replies and reports
export interface ChatMessageReplySnippet {
  messageId: string;
  senderId: string;
  senderName: string;
  text?: string; 
  fileType?: ChatMessage['fileType']; 
  fileName?: string; 
}

export interface ChatMessage {
  id: string;
  chatRoomId: string;
  senderId: string;
  senderName: string; // Denormalized sender name, crucial for group chats
  senderProfileImageUrl?: string; // Denormalized sender image, optional
  text?: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: 'image' | 'pdf' | 'doc' | 'docx' | 'txt' | 'audio' | 'video' | 'other';
  fileSize?: number;
  timestamp: string | number | Timestamp;
  status: 'sent' | 'seen'; // For P2P, group seen status is complex
  isDeleted?: boolean;
  editedAt?: Timestamp | number | string | null;
  isPinned?: boolean;
  pinnedByUid?: string;
  pinnedUntil?: Timestamp | number | string | null;
  replyTo?: ChatMessageReplySnippet | null; 
}

export interface ChatMessageReportSnippet { 
  senderId: string;
  senderName: string;
  text?: string;
  timestamp: string | number | Timestamp;
}

export type ReportStatus = "Pending" | "Reviewed - No Action" | "Reviewed - Action Taken";

export interface ChatReport {
  id: string;
  chatRoomId: string;
  isGroupReport?: boolean; // To distinguish group reports
  reportedByUid: string;
  reportedUserName?: string;
  // For P2P, this is the other user. For group, this might be the group itself or a specific member.
  // Let's simplify for now and assume reportedUserUid is N/A for group reports, or refers to the group ID.
  reportedUserUid?: string; 
  targetUserName?: string; // Or group name
  timestamp: Timestamp;
  status: ReportStatus;
  lastThreeMessages: ChatMessageReportSnippet[]; // Or relevant messages from group
  adminNotes?: string;
}
