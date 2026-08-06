"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRealtime } from "@/hooks/useRealtime";
import { useSimpleWebRTC } from "@/hooks/useSimpleWebRTC";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Send,
  MessageCircle,
  Paperclip,
  Image as ImageIcon,
  Smile,
  Phone,
  Video,
  Search,
  ArrowLeft,
  Check,
  CheckCheck,
  Plus,
  X,
  Camera,
  Mic,
  File as FileIcon,
  Play,
  Pause,
  Download,
  Eye,
  Volume2,
  VolumeX,
  User,
  PhoneOff,
  MicOff,
  VideoOff,
  Megaphone,
  MoreVertical,
  Trash2,
  Loader2,
  CornerDownRight,
  RotateCcw,
} from "lucide-react";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import BulkMessageModal from "@/components/messages/BulkMessageModal";
import { DocumentViewerModal } from "@/components/chat/DocumentViewerModal";
import {
  getDocumentViewerUrl,
  getMediaProxyUrl,
  getMediaUrl,
  isViewableDocument,
} from "@/lib/media";
import {
  getPreferredVoiceMimeType,
  getVoiceFileExtension,
  normalizeVoiceMimeType,
} from "@/lib/voice-recording";
import { uploadFileReliably } from "@/lib/client-upload";

// Dynamic import for emoji picker to avoid SSR issues
const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

interface Message {
  _id: string;
  content: string;
  type: "text" | "image" | "file" | "video" | "audio" | "voice";
  isRead: boolean;
  createdAt: string;
  attachments?: {
    url: string;
    fileId?: string;
    filename: string;
    size: number;
    mimeType: string;
  }[];
  sender: {
    _id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
  };
  receiver: {
    _id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
  };
  replyTo?: {
    _id: string;
    content: string;
    type: "text" | "image" | "file" | "video" | "audio" | "voice";
    attachments?: {
      url: string;
      fileId?: string;
      filename: string;
      size: number;
      mimeType: string;
    }[];
    sender?: {
      _id: string;
      firstName: string;
      lastName: string;
    };
  };
}

interface Conversation {
  user: {
    _id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    role: string;
    clientStatus?: "lead" | "active" | "inactive";
    clientId?: string;
  };
  lastMessage: Message;
  unreadCount: number;
  isOnline?: boolean;
  lastSeen?: string;
}

interface AvailableUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string;
  role: string;
  clientStatus?: "lead" | "active" | "inactive";
  hasExistingConversation: boolean;
}

function MessagesContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<
    string | null
  >(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(
    null,
  );
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showNewChatDialog, setShowNewChatDialog] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [searchUsers, setSearchUsers] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [conversationSearch, setConversationSearch] = useState("");

  // Enhanced WhatsApp-like features
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [documentViewer, setDocumentViewer] = useState<{
    url: string;
    filename: string;
    mimeType: string;
  } | null>(null);
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [isAudioCall, setIsAudioCall] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Retry state for failed media attachments
  const [failedAttachments, setFailedAttachments] = useState<Set<string>>(
    new Set(),
  );
  const [attachmentRetryTick, setAttachmentRetryTick] = useState<
    Record<string, number>
  >({});

  // Bulk messaging state
  const [showBulkMessageModal, setShowBulkMessageModal] = useState(false);

  // Message deletion state
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // WebRTC calling states
  const [callState, setCallState] = useState<
    "idle" | "calling" | "incoming" | "connected" | "ended"
  >("idle");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [peerConnection, setPeerConnection] =
    useState<RTCPeerConnection | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [callId, setCallId] = useState<string | null>(null);
  const [isInitiator, setIsInitiator] = useState<boolean>(false);
  const [remoteUserId, setRemoteUserId] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<any | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingStartedAtRef = useRef(0);
  const recordingCancelledRef = useRef(false);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastTappedMessageRef = useRef<{ id: string; at: number } | null>(null);
  const messageElementRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // WebRTC refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const initialConversationsFetchedRef = useRef(false);

  // Refs to hold latest state/functions for SSE callbacks (avoids stale closures)
  const selectedConversationRef = useRef<string | null>(null);
  const fetchConversationsRef = useRef<() => void>(() => {});

  // ICE buffering to avoid race where candidates arrive before remote description is set
  const pendingRemoteCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescriptionSetRef = useRef(false);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Use ref to avoid stale closures in event handlers
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    return () => {
      recordingCancelledRef.current = true;
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
    };
  }, []);

  const flushPendingIce = async (
    pc: RTCPeerConnection | null = peerConnection,
  ) => {
    if (!pc) return;
    const queue = pendingRemoteCandidatesRef.current;
    while (queue.length) {
      const cand = queue.shift()!;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        console.warn("Failed to add queued ICE candidate", e);
      }
    }
  };

  const scrollToBottom = (instant = true) => {
    requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      if (container) {
        if (instant) {
          container.scrollTop = container.scrollHeight;
        } else {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: "smooth",
          });
        }
      }
      // Also use scrollIntoView as backup
      messagesEndRef.current?.scrollIntoView({
        behavior: instant ? "instant" : "smooth",
      });
    });
  };

  // Real-time connection for online status updates + call signaling
  const { isConnected, onlineUsers, forceReconnect } = useRealtime({
    onMessage: (evt) => {
      try {
        const data = evt.data; // already parsed in hook

        if (evt.type === "new_message") {
          const incoming = (data as any)?.message;
          if (incoming?._id) {
            // If this belongs to the currently open conversation, append it
            const currentConv = selectedConversationRef.current;
            if (
              currentConv &&
              (String(incoming.sender?._id) === currentConv ||
                String(incoming.receiver?._id) === currentConv)
            ) {
              setMessages((prev) =>
                prev.some((m) => m._id === incoming._id)
                  ? prev
                  : [...prev, incoming],
              );
              setTimeout(() => scrollToBottom(false), 50);
            }
            // Always refresh conversations list (keeps last message + unread counts in sync)
            fetchConversationsRef.current();
          }
          return;
        }

        // Handle message read event - update isRead status for messages
        if (evt.type === "message_read") {
          const readData = data as any;
          if (readData?.conversationWith) {
            // Mark all messages in this conversation as read
            setMessages((prev) =>
              prev.map((msg) =>
                String(msg.receiver?._id) === String(readData.readBy)
                  ? { ...msg, isRead: true }
                  : msg,
              ),
            );
            // Refresh conversations to update unread count
            fetchConversationsRef.current();
          }
          return;
        }

        // Handle message deletion event
        if (evt.type === "message_deleted") {
          const deletedMessageId = (data as any)?.messageId;
          if (deletedMessageId) {
            // Remove the deleted message from local state
            setMessages((prev) =>
              prev.filter((m) => m._id !== deletedMessageId),
            );
            // Refresh conversations to update last message if needed
            fetchConversationsRef.current();
          }
          return;
        }

        // Check connection health for critical call events (do not drop the event)
        // If we're temporarily disconnected, still handle the event and nudge a reconnect
        if (
          [
            "incoming_call",
            "call_accepted",
            "call_rejected",
            "call_ended",
          ].includes(evt.type) &&
          !isConnected
        ) {
          console.warn(
            "Received call event during transient SSE reconnect; handling event and triggering reconnect in background...",
          );
          forceReconnect();
          // Do not return here — we already have the event, so proceed to process it
        }
        if (evt.type === "incoming_call") {
          // If we are the target, prepare incoming state
          setIncomingCall(data);
          setCallId(data.callId);
          setIsInitiator(false);
          setRemoteUserId(data.callerId);
          setCallState("incoming");
        } else if (evt.type === "call_accepted") {
          // We are the caller and got the answer
          // Use ref to get the latest peer connection (avoid stale closure)
          const pc = peerConnectionRef.current;
          // Check if this is for our current call (only if we have a callId)
          if (callId && data.callId && data.callId !== callId) {
            return; // ignore stale/other calls
          }

          // If we don't have a callId but we're in calling state, accept it anyway
          if (!callId && callState === "calling") {
            setCallId(data.callId);
          }

          if (!pc) {
            console.error(
              "No peer connection available for call_accepted (ref is null)",
            );
            return;
          }

          if (!data.answer) {
            console.error("No answer provided in call_accepted event");
            return;
          }

          pc.setRemoteDescription(data.answer)
            .then(async () => {
              remoteDescriptionSetRef.current = true;
              await flushPendingIce(pc);
              setCallState("connected");

              // Force clear any pending timeouts
              if (callTimeoutRef.current) {
                clearTimeout(callTimeoutRef.current);
                callTimeoutRef.current = null;
              }

              // Also clear timeout based on state change
              setTimeout(() => {
                if (callTimeoutRef.current) {
                  clearTimeout(callTimeoutRef.current);
                  callTimeoutRef.current = null;
                }
              }, 100);
            })
            .catch((error) => {
              console.error("❌ Error setting remote description:", error);
            });
        } else if (evt.type === "ice_candidate") {
          if (callId && data.callId && data.callId !== callId) return; // ignore wrong call
          // Candidates can arrive before answer/offer is applied; queue until ready
          if (data.iceCandidate) {
            if (peerConnection && remoteDescriptionSetRef.current) {
              peerConnection
                .addIceCandidate(new RTCIceCandidate(data.iceCandidate))
                .catch(console.error);
            } else {
              pendingRemoteCandidatesRef.current.push(data.iceCandidate);
            }
          }
        } else if (evt.type === "call_ended") {
          endCall();
        } else if (evt.type === "webrtc-signal") {
          // 🚀 NEW: Handle Simple WebRTC signals
          handleSimpleSignal(data);
        }
      } catch (e) {
        console.error("Failed handling realtime event", e);
      }
    },
    onUserOnline: (userId) => {
      setConversations((prev) =>
        prev.map((conv) =>
          conv.user._id === userId ? { ...conv, isOnline: true } : conv,
        ),
      );
    },
    onUserOffline: (userId) => {
      setConversations((prev) =>
        prev.map((conv) =>
          conv.user._id === userId ? { ...conv, isOnline: false } : conv,
        ),
      );
    },
  });

  // 🚀 NEW: Simple WebRTC Integration
  const {
    callState: simpleCallState,
    localStream: simpleLocalStream,
    remoteStream: simpleRemoteStream,
    error: simpleCallError,
    startCall: startSimpleCall,
    acceptCall: acceptSimpleCall,
    rejectCall: rejectSimpleCall,
    endCall: endSimpleCall,
    handleSignal: handleSimpleSignal,
  } = useSimpleWebRTC({
    onIncomingCall: (callData) => {
      // You can integrate this with your existing incoming call UI
      // For now, let's use the existing incomingCall state
      setIncomingCall({
        callerId: callData.fromUserId,
        callerName: callData.fromUserId, // You might want to fetch the actual name
        callId: callData.callId,
        callType: callData.callType,
        isSimpleWebRTC: true, // Flag to identify simple WebRTC calls
      });
    },
    onCallAccepted: () => {
      setCallState("connected");
    },
    onCallRejected: () => {
      setCallState("ended");
      setIncomingCall(null);
    },
    onCallEnded: () => {
      setCallState("ended");
      setIncomingCall(null);
    },
    onRemoteStream: (stream) => {
      // Handle remote stream for simple WebRTC
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
      }
    },
  });

  useEffect(() => {
    scrollToBottom(false);
  }, [messages]);

  useEffect(() => {
    if (session?.user?.id && !initialConversationsFetchedRef.current) {
      initialConversationsFetchedRef.current = true;
      fetchConversations();
    }
  }, [session?.user?.id]);

  // Handle user parameter from URL to open specific chat
  useEffect(() => {
    const userId = searchParams?.get("user");

    if (userId && session?.user && conversations.length >= 0) {
      // Always try to start conversation, regardless of existing conversations
      handleUserFromURL(userId);
    }
  }, [searchParams, session, conversations]);

  // Attach remote audio stream for audio-only calls
  // Auto mark missed call if not answered within 30s (caller side)
  useEffect(() => {
    if (isInitiator && callState === "calling" && callId && remoteUserId) {
      callTimeoutRef.current = setTimeout(async () => {
        try {
          // notify receiver of missed call
          await fetch("/api/webrtc/signal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "missed_call",
              callId,
              receiverId: remoteUserId,
            }),
          });

          // end the call as not answered
          await fetch("/api/webrtc/signal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "call_ended",
              callId,
              callerId: session?.user?.id,
              receiverId: remoteUserId,
            }),
          });

          // persist a missed-call system message in the chat
          await fetch("/api/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipientId: remoteUserId,
              content: "Missed call",
              type: "call_missed",
            }),
          });
        } catch (_) {}
        setCallState("ended");
        setIsAudioCall(false);
        setIsVideoCall(false);
      }, 30000);
    } else if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
    return () => {
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
      }
    };
  }, [isInitiator, callState, callId, remoteUserId, session?.user?.id]);

  // Additional useEffect to clear timeout when call state changes to connected
  useEffect(() => {
    if (callState === "connected" && callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
  }, [callState]);

  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      // @ts-ignore
      remoteAudioRef.current.srcObject = remoteStream;
      // @ts-ignore
      remoteAudioRef.current.play?.().catch(() => {});
    }
  }, [remoteStream]);

  const handleUserFromURL = async (userId: string) => {
    try {
      // Check if conversation already exists
      const existingConversation = conversations.find(
        (c) => c.user._id === userId,
      );

      if (existingConversation) {
        // Conversation exists, just select it
        setSelectedConversation(userId);
        fetchMessages(userId);
      } else {
        // No conversation exists, fetch user details and create new conversation
        await fetchUserAndStartConversation(userId);
      }
    } catch (error) {
      // Handle error silently in production
    }
  };

  const fetchUserAndStartConversation = async (userId: string) => {
    try {
      const response = await fetch(`/api/users/${userId}`);

      if (response.ok) {
        const userData = await response.json();

        // Create new conversation object
        const newConversation: Conversation = {
          user: {
            _id: userData._id,
            firstName: userData.firstName,
            lastName: userData.lastName,
            avatar: userData.avatar || "",
            role: userData.role,
          },
          lastMessage: {} as Message,
          unreadCount: 0,
          isOnline: false,
        };

        // Add to conversations list if not already there
        setConversations((prev) => {
          const exists = prev.find((c) => c.user._id === userId);
          if (!exists) {
            return [newConversation, ...prev];
          } else {
            return prev;
          }
        });

        // Select the conversation and start with empty messages
        setSelectedConversation(userId);
        setMessages([]); // Start with empty messages for new conversation

        // Try to fetch any existing messages
        fetchMessages(userId);
      } else {
        // Still create a conversation to allow messaging
        createFallbackConversation(userId);
      }
    } catch (error) {
      // Still create a conversation to allow messaging
      createFallbackConversation(userId);
    }
  };

  const createFallbackConversation = (userId: string) => {
    const fallbackConversation: Conversation = {
      user: {
        _id: userId,
        firstName: "User",
        lastName: "",
        avatar: "",
        role: "client",
      },
      lastMessage: {} as Message,
      unreadCount: 0,
      isOnline: false,
    };

    setConversations((prev) => {
      const exists = prev.find((c) => c.user._id === userId);
      if (!exists) {
        return [fallbackConversation, ...prev];
      }
      return prev;
    });

    setSelectedConversation(userId);
    setMessages([]);
    fetchMessages(userId);
  };

  useEffect(() => {
    if (showNewChatDialog) {
      fetchAvailableUsers();
    }
  }, [showNewChatDialog, searchUsers, roleFilter]);

  const fetchConversations = async () => {
    try {
      const response = await fetch("/api/messages/conversations");
      if (response.ok) {
        const data = await response.json();
        const conversations = data.conversations || [];
        setConversations(conversations);

        // Fetch online status for all conversation users
        if (conversations.length > 0) {
          const userIds = conversations.map(
            (conv: Conversation) => conv.user._id,
          );
          fetchOnlineStatus(userIds);
        }
      }
    } catch (error) {
      // Handle error silently in production
    } finally {
      setLoading(false);
    }
  };

  // Keep refs updated for SSE callbacks (avoids stale closures)
  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    fetchConversationsRef.current = fetchConversations;
  });

  const fetchOnlineStatus = async (userIds: string[]) => {
    try {
      const response = await fetch(
        `/api/realtime/status?userIds=${userIds.join(",")}`,
      );
      if (response.ok) {
        const data = await response.json();

        // Update conversations with online status
        setConversations((prev) =>
          prev.map((conv) => ({
            ...conv,
            isOnline: data.users?.[conv.user._id]?.isOnline || false,
          })),
        );
      }
    } catch (error) {
      console.error("Failed to fetch online status:", error);
    }
  };

  const fetchAvailableUsers = async () => {
    setLoadingUsers(true);
    try {
      const params = new URLSearchParams();
      if (searchUsers) params.append("search", searchUsers);
      if (roleFilter && roleFilter !== "all") params.append("role", roleFilter);

      const response = await fetch(`/api/users/available-for-chat?${params}`);
      if (response.ok) {
        const data = await response.json();
        setAvailableUsers(data.users || []);
      }
    } catch (error) {
      // Handle error silently in production
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchMessages = async (
    conversationWith: string,
    scrollAfterLoad = true,
  ) => {
    try {
      // Fetch ALL messages for the conversation (no limit) to ensure no messages are missed
      const response = await fetch(
        `/api/messages?conversationWith=${conversationWith}`,
      );
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);

        // Reset unread count for this conversation locally
        setConversations((prev) =>
          prev.map((conv) =>
            conv.user._id === conversationWith
              ? { ...conv, unreadCount: 0 }
              : conv,
          ),
        );

        if (scrollAfterLoad) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              scrollToBottom(true);
              setTimeout(() => scrollToBottom(true), 100);
              setTimeout(() => scrollToBottom(true), 300);
            });
          });
        }
      } else if (response.status === 404) {
        // No messages found, start with empty array (this is normal for new conversations)
        setMessages([]);
      } else {
        setMessages([]);
      }
    } catch (error) {
      setMessages([]);
    }
  };

  useEffect(() => {
    if (!session?.user?.id) return;

    const refreshVisibleMessages = () => {
      if (document.visibilityState !== "visible") return;
      void fetchConversations();
      if (selectedConversation) {
        void fetchMessages(selectedConversation, false);
      }
    };

    const interval = window.setInterval(refreshVisibleMessages, 8_000);
    window.addEventListener("focus", refreshVisibleMessages);
    document.addEventListener("visibilitychange", refreshVisibleMessages);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisibleMessages);
      document.removeEventListener("visibilitychange", refreshVisibleMessages);
    };
  }, [session?.user?.id, selectedConversation]);

  const sendMessage = async (
    content: string,
    type: "text" | "image" | "file" | "video" | "audio" | "voice" = "text",
    attachments?: any[],
    replyToId?: string,
  ) => {
    if ((!content.trim() && !attachments) || !selectedConversation || sending)
      return false;

    setSending(true);
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipientId: selectedConversation,
          content: content.trim() || (type === "image" ? "Image" : "File"),
          type,
          attachments,
          replyTo: replyToId || replyingToMessage?._id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "Failed to send message");
      }

      const sentMessage = (await response.json()) as Message;
      if (sentMessage?._id) {
        setMessages((previous) =>
          previous.some((message) => message._id === sentMessage._id)
            ? previous
            : [...previous, sentMessage],
        );
        setTimeout(() => scrollToBottom(false), 30);
      }
      setNewMessage("");
      setReplyingToMessage(null);
      fetchConversations();
      return true;
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to send message",
      );
      return false;
    } finally {
      setSending(false);
    }
  };

  const handleSendText = () => {
    sendMessage(newMessage, "text", undefined, replyingToMessage?._id);
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      const uploadData = await uploadFileReliably(file, "message");

      const attachment = {
        url: uploadData.url,
        fileId: uploadData.fileId,
        filename: uploadData.filename || file.name,
        size: uploadData.size || file.size,
        mimeType: uploadData.type || file.type,
      };

      const type = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : file.type.startsWith("audio/")
            ? "audio"
            : "file";

      await sendMessage("", type, [attachment]);
    } catch (error) {
      alert("Failed to upload file. Please try again.");
    } finally {
      setUploadingFile(false);
      setShowAttachmentMenu(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  // Enhanced WhatsApp-like functions
  const handleEmojiSelect = (emojiData: any) => {
    setNewMessage((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  const startAudioRecording = async () => {
    if (isRecording || sending || uploadingFile || !selectedConversation)
      return;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      toast.error("Voice recording is not supported in this browser");
      return;
    }

    recordingCancelledRef.current = false;
    setIsRecording(true);
    setRecordingTime(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (recordingCancelledRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const preferredMimeType = getPreferredVoiceMimeType((mimeType) =>
        MediaRecorder.isTypeSupported(mimeType),
      );
      const mediaRecorder = preferredMimeType
        ? new MediaRecorder(stream, {
            mimeType: preferredMimeType,
            audioBitsPerSecond: 64000,
          })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current);
          recordingIntervalRef.current = null;
        }
        const duration = Math.max(
          1,
          Math.round((Date.now() - recordingStartedAtRef.current) / 1000),
        );
        const mimeType = normalizeVoiceMimeType(
          mediaRecorder.mimeType || preferredMimeType || "audio/webm",
        );
        const audioBlob = new Blob(recordingChunksRef.current, {
          type: mimeType,
        });

        recordingChunksRef.current = [];
        mediaRecorderRef.current = null;
        recordingStreamRef.current
          ?.getTracks()
          .forEach((track) => track.stop());
        recordingStreamRef.current = null;
        setIsRecording(false);

        if (recordingCancelledRef.current) {
          setRecordingTime(0);
          return;
        }

        if (audioBlob.size === 0) {
          toast.error("No audio was captured. Please record again.");
          setRecordingTime(0);
          return;
        }

        const extension = getVoiceFileExtension(mimeType);
        const audioFile = new File(
          [audioBlob],
          `voice_${Date.now()}.${extension}`,
          { type: mimeType },
        );

        setUploadingFile(true);
        try {
          const uploadData = await uploadFileReliably(audioFile, "message");
          const attachment = {
            url: uploadData.url,
            fileId: uploadData.fileId,
            filename: uploadData.filename || audioFile.name,
            size: uploadData.size || audioFile.size,
            mimeType: normalizeVoiceMimeType(uploadData.type || mimeType),
            duration,
          };
          const sent = await sendMessage("Voice message", "voice", [
            attachment,
          ]);
          if (!sent) return;
        } catch (error) {
          console.error("Voice message failed:", error);
          toast.error(
            error instanceof Error
              ? error.message
              : "Failed to send voice message",
          );
        } finally {
          setUploadingFile(false);
          setRecordingTime(0);
        }
      };

      mediaRecorder.onerror = () => {
        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current);
          recordingIntervalRef.current = null;
        }
        recordingStreamRef.current
          ?.getTracks()
          .forEach((track) => track.stop());
        recordingStreamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecording(false);
        setRecordingTime(0);
        toast.error("Recording failed. Please try again.");
      };

      mediaRecorder.start(250);

      // Start recording timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      setIsRecording(false);
      setRecordingTime(0);
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      console.error("Could not start voice recording:", error);
      toast.error("Could not access the microphone. Please check permissions.");
    }
  };

  const stopAudioRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      recordingCancelledRef.current = true;
      setIsRecording(false);
      return;
    }
    if (recorder.state === "recording") {
      recorder.requestData();
      recorder.stop();
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
  };

  const cancelAudioRecording = () => {
    recordingCancelledRef.current = true;
    stopAudioRecording();
    setRecordingTime(0);
  };

  const handleImageCapture = () => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = "image/*";
      fileInputRef.current.click();
    }
  };

  const handleVideoCapture = () => {
    if (videoInputRef.current) {
      videoInputRef.current.click();
    }
  };

  const handleDocumentUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = ".pdf,.doc,.docx,.txt";
      fileInputRef.current.click();
    }
  };

  // WebRTC Configuration (robust STUN/TURN set)
  const iceServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turns:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ];

  const initializePeerConnection = (activeCallId?: string) => {
    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = async (event) => {
      const id = activeCallId || callId; // ensure we have the correct call ID even before state updates propagate
      if (event.candidate && id && session?.user?.id && remoteUserId) {
        try {
          await fetch("/api/webrtc/signal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "ice_candidate",
              callId: id,
              iceCandidate: event.candidate.toJSON(),
              // needed by the signaling route to figure out the target
              callerId: isInitiator ? session.user.id : incomingCall?.callerId,
              receiverId: isInitiator ? remoteUserId : session.user.id,
            }),
          });
        } catch (e) {
          console.error("Failed to send ICE candidate", e);
        }
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      setRemoteStream(stream);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
        // Attempt to play (some browsers require explicit play())
        // @ts-ignore
        remoteVideoRef.current.play?.().catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setCallState("connected");
      } else if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      ) {
        endCall();
      }
    };

    setPeerConnection(pc);
    peerConnectionRef.current = pc; // Keep ref in sync
    return pc;
  };

  // 🚀 NEW: Simple WebRTC call functions
  const startSimpleVideoCall = async () => {
    if (!selectedConversation || !session?.user?.id) return;

    await startSimpleCall(selectedConversation, "video");
  };

  const startSimpleAudioCall = async () => {
    if (!selectedConversation || !session?.user?.id) return;

    await startSimpleCall(selectedConversation, "audio");
  };

  const handleSimpleCallAccept = () => {
    acceptSimpleCall();
    setIncomingCall(null);
  };

  const handleSimpleCallReject = () => {
    rejectSimpleCall();
    setIncomingCall(null);
  };

  const handleSimpleCallEnd = () => {
    endSimpleCall();
  };

  const startVideoCall = async () => {
    try {
      if (!selectedConversation || !session?.user?.id) return;

      // Check SSE connection health before starting call
      if (!isConnected) {
        console.warn(
          "SSE connection not healthy, attempting reconnect before call...",
        );
        await forceReconnect();
        // Wait a bit for connection to stabilize
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (!isConnected) {
          console.error(
            "Failed to establish SSE connection, cannot start call",
          );
          return;
        }
      }

      setIsVideoCall(true);
      setIsInitiator(true);
      setRemoteUserId(selectedConversation);
      setCallState("calling");

      // Allocate a call ID before creating the peer connection so ICE uses the right ID
      const newCallId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      setCallId(newCallId);

      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        // @ts-ignore
        localVideoRef.current.muted = true; // avoid echo locally
        // @ts-ignore
        localVideoRef.current.play?.().catch(() => {});
      }

      // Initialize peer connection with the call ID
      const pc = initializePeerConnection(newCallId);

      // Add local stream to peer connection
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Create offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      } as any);
      await pc.setLocalDescription(offer);

      // Send offer to signaling server
      await fetch("/api/webrtc/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "video",
          callId: newCallId,
          receiverId: selectedConversation,
          offer,
        }),
      });
    } catch (error) {
      console.error(error);
      alert(
        "Failed to start video call. Please check camera/microphone permissions.",
      );
      setCallState("idle");
      setIsVideoCall(false);
    }
  };

  const startAudioCall = async () => {
    try {
      if (!selectedConversation || !session?.user?.id) return;

      // Check SSE connection health before starting call
      if (!isConnected) {
        console.warn(
          "SSE connection not healthy, attempting reconnect before call...",
        );
        await forceReconnect();
        // Wait a bit for connection to stabilize
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (!isConnected) {
          console.error(
            "Failed to establish SSE connection, cannot start call",
          );
          return;
        }
      }

      setIsAudioCall(true);
      setIsInitiator(true);
      setRemoteUserId(selectedConversation);
      setCallState("calling");

      // Allocate a call ID before creating the peer connection so ICE uses the right ID
      const newCallId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      setCallId(newCallId);

      // Get user media (audio only)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
      });
      setLocalStream(stream);

      // Initialize peer connection
      const pc = initializePeerConnection(newCallId);

      // Add local stream to peer connection
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Create offer
      const offer = await pc.createOffer({ offerToReceiveAudio: true } as any);
      await pc.setLocalDescription(offer);

      // Send offer to signaling server
      await fetch("/api/webrtc/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "audio",
          callId: newCallId,
          receiverId: selectedConversation,
          offer,
        }),
      });
    } catch (error) {
      alert("Failed to start audio call. Please check microphone permissions.");
      setCallState("idle");
      setIsAudioCall(false);
    }
  };

  const acceptIncomingCall = async () => {
    try {
      if (!incomingCall || !incomingCall.offer) return;
      setIsInitiator(false);
      setRemoteUserId(incomingCall.callerId);
      const isVideo = incomingCall.type === "video";
      setIsVideoCall(isVideo);
      setIsAudioCall(!isVideo);

      const theCallId = callId || incomingCall.callId;
      if (theCallId) setCallId(theCallId);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: isVideo,
        audio: true,
      });
      setLocalStream(stream);
      if (localVideoRef.current) {
        // @ts-ignore
        localVideoRef.current.srcObject = stream;
        // @ts-ignore
        localVideoRef.current.muted = true;
        // @ts-ignore
        localVideoRef.current.play?.().catch(() => {});
      }

      const pc = initializePeerConnection(theCallId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(incomingCall.offer);
      remoteDescriptionSetRef.current = true;
      await flushPendingIce(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await fetch("/api/webrtc/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "call_accepted",
          callId: theCallId,
          callerId: incomingCall.callerId,
          answer,
        }),
      });

      setCallState("connected");
    } catch (e) {
      console.error("Failed to accept call", e);
      setCallState("idle");
      setIsVideoCall(false);
      setIsAudioCall(false);
      setIncomingCall(null);
    }
  };

  const rejectIncomingCall = async () => {
    try {
      if (!incomingCall) return;
      const theCallId = callId || incomingCall.callId;
      if (theCallId) setCallId(theCallId);
      await fetch("/api/webrtc/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "call_rejected",
          callId: theCallId,
          callerId: incomingCall.callerId,
        }),
      });
    } catch (e) {
      console.warn("Failed to send call_rejected", e);
    }
    setIncomingCall(null);
    setCallState("idle");
  };

  const endCall = async () => {
    // Reset ICE buffering flags
    remoteDescriptionSetRef.current = false;
    pendingRemoteCandidatesRef.current.length = 0;

    try {
      if (
        callId &&
        session?.user?.id &&
        (remoteUserId || incomingCall?.callerId)
      ) {
        await fetch("/api/webrtc/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "call_ended",
            callId,
            callerId: isInitiator ? session.user.id : incomingCall?.callerId,
            receiverId: isInitiator ? remoteUserId : session?.user?.id,
          }),
        });
      }
    } catch (e) {
      console.warn("Failed to notify call end", e);
    }

    // Stop local stream
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }

    // Close peer connection
    if (peerConnection) {
      peerConnection.close();
      setPeerConnection(null);
      peerConnectionRef.current = null; // Clear ref too
    }

    // Reset states
    setCallState("idle");
    setIsVideoCall(false);
    setIsAudioCall(false);
    setRemoteStream(null);
    setIsMuted(false);
    setIsVideoEnabled(true);
    setCallId(null);
    setIsInitiator(false);
    setRemoteUserId(null);
    setIncomingCall(null);
  };

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  // Bridge notification actions from Service Worker and custom events to in-page call handlers
  useEffect(() => {
    const hydrateFromNotification = (nd: any) => {
      if (!nd || nd.type !== "call") return;
      if (!incomingCall || !incomingCall.offer) {
        setIncomingCall({
          type: nd.callType || nd.type,
          callId: nd.callId,
          callerId: nd.callerId,
          callerName: nd.callerName,
          offer: nd.offer,
        });
        setCallId(nd.callId || callId);
        setIsInitiator(false);
        if (nd.callerId) setRemoteUserId(nd.callerId);
        setCallState("incoming");
      }
    };

    const onSWMessage = (event: MessageEvent) => {
      try {
        const data: any = (event as any).data;
        if (
          data?.type === "notification-click" &&
          data.notificationData?.type === "call"
        ) {
          hydrateFromNotification(data.notificationData);
          if (data.action === "accept") {
            acceptIncomingCall();
          } else if (data.action === "decline") {
            rejectIncomingCall();
          }
        }
      } catch (e) {
        console.warn("SW message handling failed", e);
      }
    };

    const onCustom = (e: Event) => {
      try {
        const detail: any = (e as CustomEvent).detail;
        const nd = detail?.notificationData;
        if (nd) hydrateFromNotification(nd);
        if (detail?.action === "accept") {
          acceptIncomingCall();
        } else if (detail?.action === "decline") {
          rejectIncomingCall();
        }
      } catch (e) {
        console.warn("custom call-notification-action handling failed", e);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("call-notification-action", onCustom as any);
    }
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onSWMessage as any);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("call-notification-action", onCustom as any);
      }
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener(
          "message",
          onSWMessage as any,
        );
      }
    };
  }, [acceptIncomingCall, rejectIncomingCall, incomingCall, callId]);

  const selectConversation = (userId: string) => {
    setSelectedConversation(userId);
    setReplyingToMessage(null);
    setMessages([]); // Clear messages first to show loading state

    fetchMessages(userId);
  };

  const startNewConversation = (user: AvailableUser) => {
    // Close the dialog first
    setShowNewChatDialog(false);

    // Check if conversation already exists
    const existingConversation = conversations.find(
      (c) => c.user._id === user._id,
    );

    if (existingConversation) {
      // Conversation exists, just select it
      setSelectedConversation(user._id);
      fetchMessages(user._id);
    } else {
      // Create new conversation
      const newConversation: Conversation = {
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
          role: user.role,
        },
        lastMessage: {} as Message,
        unreadCount: 0,
        isOnline: false,
      };

      // Add to conversations list
      setConversations((prev) => [newConversation, ...prev]);

      // Select the conversation and start with empty messages
      setSelectedConversation(user._id);
      setMessages([]); // Start with empty messages for new conversation
    }
  };

  const getMessageStatus = (message: Message) => {
    if (message.sender._id !== session?.user.id) return null;

    return message.isRead ? (
      <CheckCheck className="h-3 w-3 text-blue-400" />
    ) : (
      <Check className="h-3 w-3 text-gray-400" />
    );
  };

  const getReplyPreviewText = (message: Message | Message["replyTo"]) => {
    if (!message) return "";

    if (message.type === "image") return "Image";
    if (message.type === "video") return "Video";
    if (message.type === "audio" || message.type === "voice")
      return "Voice message";
    if (message.type === "file")
      return message.attachments?.[0]?.filename || "File";

    return message.content || "";
  };

  const jumpToOriginalMessage = (messageId?: string) => {
    if (!messageId) return;

    const targetElement = messageElementRefs.current[messageId];
    if (!targetElement) return;

    targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(messageId);

    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }

    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedMessageId((current) =>
        current === messageId ? null : current,
      );
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  // Handle message deletion
  const handleDeleteMessage = async () => {
    if (!messageToDelete || isDeleting) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/messages/${messageToDelete._id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Remove message from local state immediately
        setMessages((prev) =>
          prev.filter((m) => m._id !== messageToDelete._id),
        );
        toast.success("Message deleted");
      } else {
        const data = await response.json();
        toast.error(data.error || "Failed to delete message");
      }
    } catch (error) {
      console.error("Error deleting message:", error);
      toast.error("Failed to delete message");
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setMessageToDelete(null);
    }
  };

  const confirmDeleteMessage = (message: Message) => {
    setMessageToDelete(message);
    setDeleteDialogOpen(true);
  };

  // Date formatting helper functions
  const formatDateSeparator = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMMM d, yyyy");
  };

  const shouldShowDateSeparator = (
    currentMsg: Message,
    prevMsg: Message | null,
  ) => {
    if (!prevMsg) return true; // Always show for first message
    const currentDate = new Date(currentMsg.createdAt);
    const prevDate = new Date(prevMsg.createdAt);
    return !isSameDay(currentDate, prevDate);
  };

  const selectedUser = conversations.find(
    (c) => c.user._id === selectedConversation,
  );

  if (!session) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Please sign in to view messages.</p>
        </div>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="dietitian-messages-page h-[calc(100vh-80px)] flex">
        {/* Conversations Sidebar */}
        <div
          className={cn(
            "border-r bg-white flex flex-col",
            selectedConversation
              ? "hidden md:flex md:w-1/3"
              : "flex w-full md:w-1/3",
          )}
        >
          {/* Header */}
          <div className="p-4 border-b bg-green-600 text-white">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold">DTPS Chat</h1>
              <div className="flex items-center gap-1">
                {/* Bulk Message Button - staff only */}
                {session?.user?.role &&
                  ["admin", "dietitian", "health_counselor"].includes(
                    session.user.role.toLowerCase(),
                  ) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-white hover:bg-green-700"
                      onClick={() => setShowBulkMessageModal(true)}
                      title="Bulk Message"
                    >
                      <Megaphone className="h-5 w-5" />
                    </Button>
                  )}
                <Dialog
                  open={showNewChatDialog}
                  onOpenChange={setShowNewChatDialog}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-white hover:bg-green-700"
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Start New Conversation</DialogTitle>
                      <DialogDescription>
                        Choose someone to start chatting with
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                      {/* Role Filter Tabs */}
                      <div className="flex flex-wrap gap-2">
                        {[
                          { value: "all", label: "All" },
                          { value: "client", label: "Clients" },
                          { value: "dietitian", label: "Dietitians" },
                          {
                            value: "health_counselor",
                            label: "Health Counselors",
                          },
                          { value: "admin", label: "Admin" },
                        ].map((tab) => (
                          <button
                            key={tab.value}
                            onClick={() => setRoleFilter(tab.value)}
                            className={cn(
                              "px-3 py-1.5 text-sm font-medium rounded-full transition-colors",
                              roleFilter === tab.value
                                ? "bg-green-600 text-white"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                            )}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {/* Search Users */}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Search users..."
                          value={searchUsers}
                          onChange={(e) => setSearchUsers(e.target.value)}
                          className="pl-10"
                        />
                      </div>

                      {/* Available Users List */}
                      <div className="max-h-64 overflow-y-auto space-y-2">
                        {loadingUsers ? (
                          <div className="flex justify-center py-4">
                            <LoadingSpinner />
                          </div>
                        ) : availableUsers.length === 0 ? (
                          <p className="text-gray-500 text-center py-4">
                            No users found
                          </p>
                        ) : (
                          availableUsers.map((user) => (
                            <div
                              key={user._id}
                              onClick={() => startNewConversation(user)}
                              className="p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors"
                            >
                              <div className="flex items-center space-x-3">
                                <Avatar className="h-10 w-10">
                                  <AvatarImage src={user.avatar} />
                                  <AvatarFallback className="bg-green-100 text-green-600">
                                    {user.firstName[0]}
                                    {user.lastName[0]}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-gray-900">
                                      {user.firstName} {user.lastName}
                                    </p>
                                    <span
                                      className={cn(
                                        "px-2 py-0.5 text-xs font-medium rounded-full",
                                        user.role === "admin" &&
                                          "bg-purple-100 text-purple-700",
                                        user.role === "dietitian" &&
                                          "bg-blue-100 text-blue-700",
                                        user.role === "health_counselor" &&
                                          "bg-orange-100 text-orange-700",
                                        user.role === "client" &&
                                          "bg-green-100 text-green-700",
                                      )}
                                    >
                                      {user.role === "health_counselor"
                                        ? "HC"
                                        : user.role?.charAt(0).toUpperCase() +
                                          user.role?.slice(1)}
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-500 truncate">
                                    {user.email}
                                  </p>
                                  {user.hasExistingConversation && (
                                    <p className="text-xs text-blue-600">
                                      Existing conversation
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            {/* Search */}
            <div className="mt-3 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name or C-ID..."
                className="pl-10 bg-white text-gray-900"
                value={conversationSearch}
                onChange={(e) => setConversationSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="text-center py-8 px-4">
                <MessageCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No conversations yet</p>
                <p className="text-sm text-gray-400 mb-4">
                  Start a conversation with a client or dietitian
                </p>
                <Button onClick={() => setShowNewChatDialog(true)} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Start Chat
                </Button>
              </div>
            ) : (
              conversations
                .filter((conversation) => conversation.user)
                .filter((conversation) => {
                  if (!conversationSearch.trim()) return true;
                  const search = conversationSearch.toLowerCase().trim();
                  const fullName =
                    `${conversation.user.firstName} ${conversation.user.lastName}`.toLowerCase();
                  const clientId =
                    conversation.user.clientId?.toLowerCase() || "";
                  return fullName.includes(search) || clientId.includes(search);
                })
                .map((conversation) => (
                  <div
                    key={conversation.user._id}
                    onClick={() => selectConversation(conversation.user._id)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors border-b ${
                      selectedConversation === conversation.user._id
                        ? "bg-green-50"
                        : ""
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="relative">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={conversation.user.avatar} />
                          <AvatarFallback className="bg-green-100 text-green-600">
                            {conversation.user.firstName[0]}
                            {conversation.user.lastName[0]}
                          </AvatarFallback>
                        </Avatar>
                        {conversation.isOnline && (
                          <div className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 rounded-full border-2 border-white"></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {conversation.user.firstName}{" "}
                              {conversation.user.lastName}
                              {conversation.user.clientId && (
                                <span className="ml-1 text-xs text-gray-500">
                                  ({conversation.user.clientId})
                                </span>
                              )}
                            </p>
                            {conversation.user.clientStatus && (
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 ${
                                  conversation.user.clientStatus === "active"
                                    ? "bg-green-100 text-green-700"
                                    : conversation.user.clientStatus ===
                                        "inactive"
                                      ? "bg-gray-100 text-gray-700"
                                      : "bg-blue-100 text-blue-700"
                                }`}
                              >
                                {conversation.user.clientStatus
                                  .charAt(0)
                                  .toUpperCase() +
                                  conversation.user.clientStatus.slice(1)}
                              </span>
                            )}
                          </div>
                          {conversation.lastMessage?.createdAt &&
                            (() => {
                              try {
                                const date = new Date(
                                  conversation.lastMessage.createdAt,
                                );
                                if (!isNaN(date.getTime())) {
                                  return (
                                    <p className="text-xs text-gray-500 shrink-0">
                                      {format(date, "MMM d, yyyy • h:mm a")}
                                    </p>
                                  );
                                }
                              } catch (error) {
                                return null;
                              }
                              return null;
                            })()}
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-gray-500 truncate">
                            {conversation.lastMessage?.type === "image"
                              ? "📷 Photo"
                              : conversation.lastMessage?.type === "video"
                                ? "🎬 Video"
                                : conversation.lastMessage?.type === "audio"
                                  ? "🎵 Audio"
                                  : conversation.lastMessage?.type === "voice"
                                    ? "🎤 Voice message"
                                    : conversation.lastMessage?.type === "file"
                                      ? "Document"
                                      : conversation.lastMessage?.content ||
                                        "Start conversation..."}
                          </p>
                          {conversation.unreadCount > 0 && (
                            <div className="bg-green-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center shrink-0 ml-2">
                              {conversation.unreadCount}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div
          className={cn(
            "flex-1 flex flex-col",
            selectedConversation ? "flex" : "hidden md:flex",
          )}
        >
          {selectedConversation && selectedUser ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="md:hidden"
                    onClick={() => setSelectedConversation(null)}
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={selectedUser.user.avatar} />
                      <AvatarFallback className="bg-green-100 text-green-600">
                        {selectedUser.user.firstName[0]}
                        {selectedUser.user.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                    {selectedUser.isOnline && (
                      <div className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 rounded-full border-2 border-white"></div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">
                        {selectedUser.user.firstName}{" "}
                        {selectedUser.user.lastName}
                        {selectedUser.user.clientId && (
                          <span className="ml-1 text-sm font-normal text-gray-500">
                            ({selectedUser.user.clientId})
                          </span>
                        )}
                      </h3>
                      {selectedUser.user.clientStatus && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            selectedUser.user.clientStatus === "active"
                              ? "bg-green-100 text-green-700"
                              : selectedUser.user.clientStatus === "inactive"
                                ? "bg-gray-100 text-gray-700"
                                : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {selectedUser.user.clientStatus
                            .charAt(0)
                            .toUpperCase() +
                            selectedUser.user.clientStatus.slice(1)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      {selectedUser.user.role} •{" "}
                      {selectedUser.isOnline
                        ? "Online"
                        : selectedUser.lastSeen
                          ? `Last seen ${selectedUser.lastSeen}`
                          : "Offline"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {selectedUser.user.role === "client" &&
                    selectedUser.user._id && (
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          href={`/dietician/clients/${selectedUser.user._id}`}
                          aria-label="View client dashboard"
                        >
                          View Dashboard
                        </Link>
                      </Button>
                    )}
                </div>
              </div>

              {/* Messages */}
              <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50"
                style={{
                  backgroundImage:
                    'url(\'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="50" cy="50" r="0.5" fill="%23000" opacity="0.02"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>\')',
                }}
              >
                {messages.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No messages yet</p>
                    <p className="text-sm text-gray-400">
                      Start the conversation!
                    </p>
                  </div>
                ) : (
                  messages
                    .map((message, index) => {
                      // Safety check for sender
                      if (!message.sender) {
                        return null;
                      }

                      // Convert both to strings for proper comparison (handles ObjectId vs string mismatch)
                      const isOwn =
                        String(message.sender._id || "") ===
                        String(session?.user?.id || "");
                      const prevMessage =
                        index > 0 ? messages[index - 1] : null;
                      const showDateSeparator = shouldShowDateSeparator(
                        message,
                        prevMessage,
                      );

                      return (
                        <div key={message._id}>
                          {/* Date Separator - WhatsApp style */}
                          {showDateSeparator && (
                            <div className="flex justify-center my-4 sticky top-2 z-10">
                              <div className="px-4 py-1.5 rounded-lg text-[12px] font-medium text-gray-600 bg-white shadow-md">
                                {formatDateSeparator(message.createdAt)}
                              </div>
                            </div>
                          )}

                          {/* Message */}
                          <div
                            className={`flex items-end gap-2 ${
                              isOwn ? "justify-end" : "justify-start"
                            }`}
                            ref={(element) => {
                              messageElementRefs.current[message._id] = element;
                            }}
                          >
                            {/* Avatar for received messages */}
                            {!isOwn && (
                              <Avatar className="h-7 w-7 shrink-0">
                                <AvatarImage src={message.sender?.avatar} />
                                <AvatarFallback className="bg-green-100 text-green-600 text-xs">
                                  {message.sender?.firstName?.[0]}
                                  {message.sender?.lastName?.[0]}
                                </AvatarFallback>
                              </Avatar>
                            )}

                            {/* Delete menu only for own messages/media - always visible on left */}
                            {isOwn && (
                              <div className="order-2">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 rounded-full hover:bg-gray-200"
                                    >
                                      <MoreVertical className="h-3.5 w-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="start"
                                    className="min-w-40"
                                  >
                                    <DropdownMenuItem
                                      className="text-red-600 focus:text-red-600 cursor-pointer"
                                      onClick={() =>
                                        confirmDeleteMessage(message)
                                      }
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            )}

                            {/* ── Reply arrow button (always visible) ── */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setReplyingToMessage(message);
                              }}
                              className="shrink-0 p-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-600 active:scale-90 transition-all duration-150 border border-gray-200"
                              title="Reply"
                              aria-label="Reply to message"
                            >
                              <CornerDownRight className="w-4 h-4" />
                            </button>

                            <div className="max-w-xs lg:max-w-md">
                              {/* Sender name for received messages */}
                              {!isOwn && (
                                <p className="text-xs text-gray-500 mb-1 ml-1">
                                  {message.sender?.firstName}{" "}
                                  {message.sender?.lastName}
                                </p>
                              )}
                              <div
                                className={`px-3 py-2 rounded-2xl shadow-sm ${
                                  isOwn
                                    ? "bg-[#25D366] text-white rounded-tr-sm"
                                    : "bg-white text-gray-900 rounded-tl-sm border border-gray-100"
                                } ${highlightedMessageId === message._id ? "ring-3 ring-yellow-400 ring-offset-2 ring-offset-[#f5f5f5]" : ""} transition-all duration-300`}
                                onDoubleClick={() =>
                                  setReplyingToMessage(message)
                                }
                                onTouchEnd={() => {
                                  const now = Date.now();
                                  const previousTap =
                                    lastTappedMessageRef.current;
                                  if (
                                    previousTap &&
                                    previousTap.id === message._id &&
                                    now - previousTap.at < 320
                                  ) {
                                    setReplyingToMessage(message);
                                    lastTappedMessageRef.current = null;
                                    return;
                                  }
                                  lastTappedMessageRef.current = {
                                    id: message._id,
                                    at: now,
                                  };
                                }}
                              >
                                {message.replyTo && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      jumpToOriginalMessage(
                                        message.replyTo?._id,
                                      )
                                    }
                                    className={`mb-2 w-full text-left rounded-lg border-l-3 px-2 py-1 text-xs cursor-pointer ${isOwn ? "bg-green-400/20 border-white/70 text-white/95 hover:bg-green-400/30" : "bg-gray-100 border-green-500 text-gray-700 hover:bg-gray-200"} transition-colors`}
                                  >
                                    <p
                                      className={`font-semibold ${isOwn ? "text-white" : "text-green-700"}`}
                                    >
                                      {message.replyTo.sender?.firstName ||
                                        "Reply"}
                                    </p>
                                    <p className="truncate">
                                      {getReplyPreviewText(message.replyTo)}
                                    </p>
                                  </button>
                                )}

                                {/* Image Messages */}
                                {message.type === "image" &&
                                  message.attachments?.[0] && (
                                    <div className="mb-2">
                                      {failedAttachments.has(message._id) ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setFailedAttachments((prev) => {
                                              const next = new Set(prev);
                                              next.delete(message._id);
                                              return next;
                                            });
                                            setAttachmentRetryTick((prev) => ({
                                              ...prev,
                                              [message._id]:
                                                (prev[message._id] || 0) + 1,
                                            }));
                                          }}
                                          className="w-40 h-32 rounded-lg flex flex-col items-center justify-center gap-2 text-xs bg-gray-200 text-gray-500 hover:bg-gray-300 transition-colors"
                                        >
                                          <RotateCcw className="w-5 h-5" />
                                          <span>
                                            Image unavailable · Tap to retry
                                          </span>
                                        </button>
                                      ) : (
                                        <img
                                          src={((): string => {
                                            const retryTick =
                                              attachmentRetryTick[
                                                message._id
                                              ] || 0;
                                            const rawUrl =
                                              message.attachments[0].url;
                                            const isImageKit =
                                              /ik\.imagekit\.io/i.test(rawUrl);
                                            if (isImageKit || retryTick > 0) {
                                              const sep = rawUrl.includes("?")
                                                ? "&"
                                                : "?";
                                              const bust =
                                                retryTick > 0
                                                  ? `retry=${retryTick}`
                                                  : `ts=${Math.floor(Date.now() / 600000)}`;
                                              return getMediaProxyUrl({
                                                url: `${rawUrl}${sep}${bust}`,
                                                filename:
                                                  message.attachments[0]
                                                    .filename,
                                              });
                                            }
                                            return getMediaProxyUrl(
                                              message.attachments[0],
                                            );
                                          })()}
                                          alt="Shared image"
                                          className="rounded-lg max-w-xs sm:max-w-sm h-auto cursor-pointer hover:opacity-90 transition-opacity"
                                          onClick={() =>
                                            setPreviewImage(
                                              getMediaUrl(
                                                message.attachments?.[0],
                                              ),
                                            )
                                          }
                                          onError={() => {
                                            console.error(
                                              "[Messages] Image load error (desktop)",
                                              {
                                                messageId: message._id,
                                                url: message.attachments?.[0]
                                                  ?.url,
                                              },
                                            );
                                            setFailedAttachments(
                                              (prev) =>
                                                new Set([...prev, message._id]),
                                            );
                                          }}
                                        />
                                      )}
                                    </div>
                                  )}

                                {/* Video Messages */}
                                {message.type === "video" &&
                                  message.attachments?.[0] && (
                                    <div className="mb-2">
                                      <video
                                        src={getMediaProxyUrl(
                                          message.attachments[0],
                                        )}
                                        controls
                                        className="rounded-lg max-w-xs h-auto"
                                        preload="metadata"
                                      >
                                        Your browser does not support video
                                        playback.
                                      </video>
                                    </div>
                                  )}

                                {/* Audio Messages */}
                                {(message.type === "audio" ||
                                  message.type === "voice") &&
                                  message.attachments?.[0] && (
                                    <div className="mb-2 flex items-center space-x-2 p-2 bg-gray-100 rounded-lg">
                                      <Volume2 className="h-4 w-4 text-gray-600" />
                                      <audio
                                        controls
                                        className="flex-1"
                                        preload="metadata"
                                      >
                                        <source
                                          src={getMediaProxyUrl(
                                            message.attachments[0],
                                          )}
                                          type={
                                            message.attachments[0].mimeType ||
                                            "audio/*"
                                          }
                                        />
                                        <a
                                          href={getDocumentViewerUrl(
                                            message.attachments[0],
                                            message.attachments[0].filename,
                                            message.attachments[0].mimeType,
                                          )}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          Open audio message
                                        </a>
                                      </audio>
                                    </div>
                                  )}

                                {/* File Messages */}
                                {message.type === "file" &&
                                  message.attachments?.[0] &&
                                  (() => {
                                    const att = message.attachments[0];
                                    const viewable = isViewableDocument(
                                      att.filename || "",
                                      att.mimeType || "",
                                      att.url || "",
                                    );
                                    const mediaUrl = getMediaUrl(att);
                                    const isPdf =
                                      (att.mimeType || "") ===
                                        "application/pdf" ||
                                      (att.filename || "").endsWith(".pdf");
                                    return (
                                      <div
                                        className="w-full max-w-xs sm:max-w-md lg:max-w-lg mb-2 bg-white rounded-xl border border-gray-200 overflow-hidden cursor-pointer"
                                        onClick={() => {
                                          if (viewable) {
                                            setDocumentViewer({
                                              url: mediaUrl,
                                              filename: att.filename,
                                              mimeType: att.mimeType,
                                            });
                                          } else {
                                            window.open(
                                              getMediaProxyUrl(att, {
                                                download: true,
                                                filename: att.filename,
                                              }),
                                              "_blank",
                                              "noopener,noreferrer",
                                            );
                                          }
                                        }}
                                      >
                                        {isPdf && (
                                          <div className="w-full h-32 bg-gray-200 overflow-hidden">
                                            <iframe
                                              src={`${mediaUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0`}
                                              className="w-[200%] h-[200%] scale-50 origin-top-left pointer-events-none"
                                              title={att.filename}
                                              loading="lazy"
                                            />
                                          </div>
                                        )}
                                        <div className="p-3 flex items-center gap-3">
                                          <div className="h-10 w-10 shrink-0 rounded-lg bg-blue-50 flex items-center justify-center">
                                            <FileIcon className="h-5 w-5 text-blue-600" />
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <span className="block text-sm font-semibold text-gray-900 truncate">
                                              {att.filename}
                                            </span>
                                            <p className="text-xs text-gray-500">
                                              {(att.size / 1024 / 1024).toFixed(
                                                2,
                                              )}{" "}
                                              MB
                                            </p>
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          className={`w-full px-3 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 border-t transition-colors ${viewable ? "text-blue-600 hover:bg-blue-50" : "text-gray-600 hover:bg-gray-50"}`}
                                        >
                                          {viewable ? (
                                            <>
                                              <Eye className="h-4 w-4" /> View
                                              Document
                                            </>
                                          ) : (
                                            <>
                                              <Download className="h-4 w-4" />{" "}
                                              Download File
                                            </>
                                          )}
                                        </button>
                                      </div>
                                    );
                                  })()}
                                <p className="text-sm">{message.content}</p>
                                <div
                                  className={`flex items-center ${isOwn ? "justify-end" : "justify-start"} space-x-1 mt-1`}
                                >
                                  <p
                                    className={`text-xs ${
                                      isOwn ? "text-green-100" : "text-gray-500"
                                    }`}
                                  >
                                    {(() => {
                                      try {
                                        const date = new Date(
                                          message.createdAt,
                                        );
                                        return !isNaN(date.getTime())
                                          ? format(date, "h:mm a")
                                          : "";
                                      } catch (error) {
                                        return "";
                                      }
                                    })()}
                                  </p>
                                  {getMessageStatus(message)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                    .filter(Boolean)
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Enhanced WhatsApp-like Message Input */}
              <div className="relative">
                {/* Emoji Picker */}
                {showEmojiPicker && (
                  <div className="absolute bottom-full right-4 mb-2 z-50">
                    <EmojiPicker onEmojiClick={handleEmojiSelect} />
                  </div>
                )}

                {/* Attachment Menu */}
                {showAttachmentMenu && (
                  <div className="absolute bottom-full left-4 mb-2 bg-white rounded-lg shadow-lg border p-2 z-50">
                    <div className="grid grid-cols-2 gap-2 w-48">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleImageCapture}
                        className="flex flex-col items-center p-3 h-auto"
                      >
                        <Camera className="h-6 w-6 mb-1 text-blue-500" />
                        <span className="text-xs">Camera</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleImageCapture}
                        className="flex flex-col items-center p-3 h-auto"
                      >
                        <ImageIcon className="h-6 w-6 mb-1 text-green-500" />
                        <span className="text-xs">Gallery</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleVideoCapture}
                        className="flex flex-col items-center p-3 h-auto"
                      >
                        <Video className="h-6 w-6 mb-1 text-red-500" />
                        <span className="text-xs">Video</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDocumentUpload}
                        className="flex flex-col items-center p-3 h-auto"
                      >
                        <FileIcon className="h-6 w-6 mb-1 text-purple-500" />
                        <span className="text-xs">Document</span>
                      </Button>
                    </div>
                  </div>
                )}

                {/* Recording Indicator */}
                {isRecording && (
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 bg-red-500 text-white px-4 py-2 rounded-lg flex items-center space-x-2">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    <span className="text-sm">
                      Recording... {recordingTime}s
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={cancelAudioRecording}
                      className="text-white hover:bg-red-600"
                      aria-label="Cancel voice recording"
                      title="Cancel recording"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                <div className="p-4 bg-white border-t">
                  {replyingToMessage && (
                    <div className="mb-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-green-700">
                            Replying to{" "}
                            {String(replyingToMessage.sender?._id || "") ===
                            String(session?.user?.id || "")
                              ? "yourself"
                              : `${replyingToMessage.sender?.firstName || ""} ${replyingToMessage.sender?.lastName || ""}`.trim()}
                          </p>
                          <p className="text-xs text-gray-700 truncate">
                            {getReplyPreviewText(replyingToMessage)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 shrink-0"
                          onClick={() => setReplyingToMessage(null)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center space-x-2">
                    {/* Attachment Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                      className="text-gray-600 hover:text-gray-800"
                    >
                      <Paperclip className="h-5 w-5" />
                    </Button>

                    {/* Message Input */}
                    <div className="flex-1 relative">
                      <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={handleKeyPress}
                        placeholder="Type a message..."
                        className="pr-12 rounded-full border-gray-300 focus:border-green-500"
                        disabled={sending || uploadingFile}
                      />

                      {/* Emoji Button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-600 hover:text-gray-800"
                      >
                        <Smile className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Send/Voice Button */}
                    {newMessage.trim() ? (
                      <Button
                        onClick={handleSendText}
                        disabled={sending || uploadingFile}
                        size="sm"
                        className="bg-green-500 hover:bg-green-600 rounded-full w-10 h-10 p-0"
                      >
                        {sending || uploadingFile ? (
                          <LoadingSpinner className="h-4 w-4" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    ) : (
                      <Button
                        onClick={
                          isRecording ? stopAudioRecording : startAudioRecording
                        }
                        disabled={sending || uploadingFile}
                        size="sm"
                        className="rounded-full w-10 h-10 p-0 bg-green-500 hover:bg-green-600"
                        aria-label={
                          isRecording
                            ? "Send voice message"
                            : "Record voice message"
                        }
                        title={
                          isRecording
                            ? "Send voice message"
                            : "Record voice message"
                        }
                      >
                        {uploadingFile ? (
                          <LoadingSpinner className="h-4 w-4" />
                        ) : isRecording ? (
                          <Send className="h-4 w-4" />
                        ) : (
                          <Mic className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Hidden File Inputs */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,*/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {/* Image Preview Modal */}
              {previewImage && (
                <Dialog
                  open={!!previewImage}
                  onOpenChange={() => setPreviewImage(null)}
                >
                  <DialogContent className="max-w-4xl">
                    <DialogHeader>
                      <DialogTitle>Image Preview</DialogTitle>
                    </DialogHeader>
                    <div className="flex justify-center">
                      <img
                        src={getMediaProxyUrl(previewImage)}
                        alt="Preview"
                        className="max-w-full max-h-96 object-contain rounded-lg"
                      />
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <MessageCircle className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Welcome to DTPS Chat
                </h3>
                <p className="text-gray-500 mb-4">
                  Select a conversation to start messaging
                </p>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <Button onClick={() => setShowNewChatDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Chat
                  </Button>
                  {session?.user?.role &&
                    ["admin", "dietitian", "health_counselor"].includes(
                      session.user.role.toLowerCase(),
                    ) && (
                      <Button
                        variant="outline"
                        onClick={() => setShowBulkMessageModal(true)}
                      >
                        <Megaphone className="h-4 w-4 mr-2" />
                        Bulk Message
                      </Button>
                    )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Message Modal */}
      <BulkMessageModal
        isOpen={showBulkMessageModal}
        onClose={() => setShowBulkMessageModal(false)}
        currentUserId={session?.user?.id || ""}
      />

      {/* Delete Message Dialog */}
      <DocumentViewerModal
        isOpen={Boolean(documentViewer)}
        onClose={() => setDocumentViewer(null)}
        url={documentViewer?.url || ""}
        filename={documentViewer?.filename || "Document"}
        mimeType={documentViewer?.mimeType || ""}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Message?</AlertDialogTitle>
            <AlertDialogDescription>
              This message will be permanently deleted. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMessage}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <style jsx global>{`
        @media (max-width: 768px) {
          /* mobile only — max-width: 768px */
          .dietitian-messages-page {
            overflow-x: hidden;
          }

          .dietitian-messages-page .text-xs {
            font-size: 14px;
          }

          .dietitian-messages-page button,
          .dietitian-messages-page input,
          .dietitian-messages-page [role="button"],
          .dietitian-messages-page [role="combobox"] {
            min-height: 44px;
          }
        }
      `}</style>

      {/* Call Interface */}
      {(isVideoCall || isAudioCall) && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          {/* Call Header */}
          <div className="flex items-center justify-between p-4 text-white">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center">
                <User className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-medium">
                  {(() => {
                    const conversation = conversations.find(
                      (c) => c.user._id === selectedConversation,
                    );
                    return conversation
                      ? `${conversation.user.firstName} ${conversation.user.lastName}`
                      : "Unknown";
                  })()}
                </h3>
                <p className="text-sm text-gray-300">
                  {callState === "calling"
                    ? "Calling..."
                    : callState === "connected"
                      ? "Connected"
                      : callState === "incoming"
                        ? "Incoming call..."
                        : "Connecting..."}
                </p>
              </div>
            </div>
          </div>

          {/* Incoming Call Banner/Modal */}
          {callState === "incoming" && incomingCall && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 text-center">
                <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <Phone className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold mb-1">
                  Incoming {incomingCall.type === "video" ? "Video" : "Audio"}{" "}
                  Call
                </h3>
                <p className="text-gray-600 mb-6">
                  from{" "}
                  {(() => {
                    const conv = conversations.find(
                      (c) => c.user._id === incomingCall.callerId,
                    );
                    return conv
                      ? `${conv.user.firstName} ${conv.user.lastName}`
                      : "Unknown";
                  })()}
                </p>
                <div className="flex justify-center gap-4">
                  <Button
                    onClick={
                      incomingCall?.isSimpleWebRTC
                        ? handleSimpleCallReject
                        : rejectIncomingCall
                    }
                    className="bg-red-500 hover:bg-red-600"
                  >
                    <X className="w-4 h-4 mr-2" /> Reject
                  </Button>
                  <Button
                    onClick={
                      incomingCall?.isSimpleWebRTC
                        ? handleSimpleCallAccept
                        : acceptIncomingCall
                    }
                    className="bg-green-500 hover:bg-green-600"
                  >
                    <Phone className="w-4 h-4 mr-2" /> Accept{" "}
                    {incomingCall?.isSimpleWebRTC ? "🚀" : ""}
                  </Button>
                </div>
              </div>

              {/* Hidden remote audio element for audio-only calls */}
              <audio
                ref={remoteAudioRef}
                autoPlay
                playsInline
                className="hidden"
              />
            </div>
          )}

          {/* 🚀 Simple WebRTC Call Status */}
          {simpleCallState.isInCall && (
            <div className="fixed top-4 right-4 z-40 bg-white rounded-lg shadow-lg p-4 border-2 border-blue-500">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <div>
                  <div className="font-semibold text-sm">
                    🚀 Simple WebRTC Call
                  </div>
                  <div className="text-xs text-gray-600">
                    Status: {simpleCallState.status} | Type:{" "}
                    {simpleCallState.callType}
                  </div>
                  <div className="text-xs text-gray-500">
                    Role: {simpleCallState.isInitiator ? "Caller" : "Receiver"}
                  </div>
                </div>
                <Button
                  onClick={handleSimpleCallEnd}
                  size="sm"
                  className="bg-red-500 hover:bg-red-600 text-white"
                >
                  End
                </Button>
              </div>

              {/* Simple WebRTC Error Display */}
              {simpleCallError && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  Error: {simpleCallError}
                </div>
              )}
            </div>
          )}

          {/* Video Area */}
          {isVideoCall && (
            <div className="flex-1 relative">
              {/* Remote video */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover bg-gray-800"
              />

              {/* Local video (picture-in-picture) */}
              <div className="absolute top-4 right-4 w-32 h-24 bg-gray-800 rounded-lg overflow-hidden border-2 border-white/20">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              </div>

              {/* No video placeholder */}
              {!remoteStream && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                  <div className="text-center text-white">
                    <div className="w-24 h-24 bg-gray-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <User className="w-12 h-12" />
                    </div>
                    <p className="text-lg">
                      {(() => {
                        const conversation = conversations.find(
                          (c) => c.user._id === selectedConversation,
                        );
                        return conversation
                          ? conversation.user.firstName
                          : "Contact";
                      })()}
                    </p>
                    <p className="text-sm text-gray-300">
                      {callState === "calling" ? "Calling..." : "Connecting..."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Audio-only interface */}
          {isAudioCall && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-white">
                <div className="w-32 h-32 bg-gray-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <User className="w-16 h-16" />
                </div>
                <h2 className="text-2xl font-medium mb-2">
                  {(() => {
                    const conversation = conversations.find(
                      (c) => c.user._id === selectedConversation,
                    );
                    return conversation
                      ? `${conversation.user.firstName} ${conversation.user.lastName}`
                      : "Contact";
                  })()}
                </h2>
                <p className="text-gray-300">
                  {callState === "calling"
                    ? "Calling..."
                    : callState === "connected"
                      ? "Connected"
                      : "Connecting..."}
                </p>
              </div>
            </div>
          )}

          {/* Call Controls */}
          <div className="p-6">
            <div className="flex justify-center items-center space-x-4">
              {/* Mute button */}
              <Button
                onClick={toggleMute}
                variant="outline"
                className={`w-12 h-12 rounded-full ${
                  isMuted
                    ? "bg-red-500 text-white border-red-500"
                    : "bg-white/10 text-white border-white/20"
                }`}
              >
                {isMuted ? (
                  <MicOff className="w-5 h-5" />
                ) : (
                  <Mic className="w-5 h-5" />
                )}
              </Button>

              {/* Video toggle button (only for video calls) */}
              {isVideoCall && (
                <Button
                  onClick={toggleVideo}
                  variant="outline"
                  className={`w-12 h-12 rounded-full ${
                    !isVideoEnabled
                      ? "bg-red-500 text-white border-red-500"
                      : "bg-white/10 text-white border-white/20"
                  }`}
                >
                  {!isVideoEnabled ? (
                    <VideoOff className="w-5 h-5" />
                  ) : (
                    <Video className="w-5 h-5" />
                  )}
                </Button>
              )}

              {/* End call button */}
              <Button
                onClick={endCall}
                className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600"
              >
                <PhoneOff className="w-6 h-6" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Message</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this message? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDeleteMessage}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <div className="flex h-screen bg-gray-100">
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-4"></div>
                <p className="text-gray-500">Loading messages...</p>
              </div>
            </div>
          </div>
        </DashboardLayout>
      }
    >
      <MessagesContent />
    </Suspense>
  );
}
