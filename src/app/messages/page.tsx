"use client";

import { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useRealtime } from "@/hooks/useRealtime";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { DocumentViewerModal } from "@/components/chat/DocumentViewerModal";

// Import the desktop version for non-clients
const DesktopMessagesPage = dynamic(() => import("./page-old-desktop"), {
  ssr: false,
});
import { Input } from "@/components/ui/input";
import {
  Send,
  MessageCircle,
  Search,
  ChevronLeft,
  Check,
  CheckCheck,
  Plus,
  Smile,
  Paperclip,
  Video,
  MoreVertical,
  Home,
  Target,
  TrendingUp,
  User as UserIcon,
  Camera,
  Mic,
  PhoneCall,
  PhoneOff,
  MicOff,
  VideoOff,
  Volume2,
  VolumeX,
  Download,
  File as FileIcon,
  Loader2,
  X,
  Image as ImageIcon,
  Play,
  Eye,
  RotateCcw,
} from "lucide-react";
import { format, isToday, isYesterday, formatDistanceToNow } from "date-fns";
import {
  getDocumentViewerUrl,
  getMediaProxyUrl,
  getMediaUrl,
  isViewableDocument,
} from "@/lib/media";
import { uploadFileReliably } from "@/lib/client-upload";

interface Message {
  _id: string;
  content: string;
  type: "text" | "image" | "file" | "video" | "audio" | "voice";
  isRead: boolean;
  createdAt: string;
  isFromMe?: boolean;
  attachments?: {
    url: string;
    fileId?: string;
    filename: string;
    size: number;
    mimeType: string;
    thumbnail?: string;
    duration?: number;
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
  };
}

interface Conversation {
  user: {
    _id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    role: string;
    phone?: string;
    clientId?: string;
  };
  lastMessage: Message;
  unreadCount: number;
  isOnline?: boolean;
}

interface Dietitian {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string;
  bio?: string;
  specializations?: string[];
  experience?: number;
  consultationFee?: number;
}

// Client WhatsApp-style UI Component
function ClientMessagesUI() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { registerToken } = usePushNotifications({ autoRegister: false });

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(
    searchParams?.get("userId"),
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [dietitians, setDietitians] = useState<Dietitian[]>([]);
  const [dietitianSearchQuery, setDietitianSearchQuery] = useState("");
  const [loadingDietitians, setLoadingDietitians] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const [selectedChatUser, setSelectedChatUser] = useState<any>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [documentViewer, setDocumentViewer] = useState<{
    url: string;
    filename: string;
    mimeType: string;
  } | null>(null);

  // Retry state for failed media attachments (mirrors client messages page)
  const [failedAttachments, setFailedAttachments] = useState<Set<string>>(
    new Set(),
  );
  const [attachmentRetryTick, setAttachmentRetryTick] = useState<
    Record<string, number>
  >({});

  // Call state management
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [currentCall, setCurrentCall] = useState<any>(null);
  const [callState, setCallState] = useState<
    "idle" | "incoming" | "calling" | "connecting" | "connected" | "ended"
  >("idle");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [peerConnection, setPeerConnection] =
    useState<RTCPeerConnection | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Refs to avoid stale closures in SSE callbacks
  const selectedChatRef = useRef<string | null>(null);
  const fetchConversationsQuietRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/auth/signin");
      return;
    }

    // Request notification permissions and register FCM token
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          // Register FCM token for push notifications
          registerToken().catch((error) =>
            console.error("Failed to register push notifications:", error),
          );
        }
      });
    } else if (Notification.permission === "granted") {
      // Already granted, register the token
      registerToken().catch((error) =>
        console.error("Failed to register push notifications:", error),
      );
    }
  }, [session, status, router, registerToken]);

  useEffect(() => {
    if (session) {
      fetchConversations();
    }
  }, [session]);

  useEffect(() => {
    if (selectedChat) {
      fetchMessages(selectedChat);
      // Mark messages as read
      markAsRead(selectedChat);
      // Fetch user data if not in conversations
      const existingConv = conversations.find(
        (c) => c.user._id === selectedChat,
      );
      if (!existingConv) {
        fetchSelectedChatUser(selectedChat);
      } else {
        setSelectedChatUser(null); // Clear if exists in conversations
      }
    }
  }, [selectedChat, conversations]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Keep refs updated for SSE callbacks (avoids stale closures)
  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  // Handle incoming SSE messages for real-time updates
  const handleRealtimeMessage = useCallback((event: any) => {
    console.log("[Messages Page] SSE event received:", event.type, event.data);

    if (event.type === "new_message") {
      const newMsg = event.data?.message;
      const conversationWith = event.data?.conversationWith;
      console.log(
        "[Messages Page] New message received:",
        newMsg,
        "conversationWith:",
        conversationWith,
      );

      if (newMsg) {
        // Use ref to get the current selected chat (avoids stale closure)
        const currentChat = selectedChatRef.current;
        // Update messages if this is the active conversation
        if (
          currentChat &&
          (newMsg.sender._id === currentChat ||
            newMsg.receiver._id === currentChat)
        ) {
          console.log("[Messages Page] Adding message to current conversation");
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m._id === newMsg._id)) {
              console.log("[Messages Page] Message already exists, skipping");
              return prev;
            }
            return [...prev, newMsg];
          });
          // Scroll to bottom after adding new message
          setTimeout(() => scrollToBottom(), 100);
        }

        // Update ONLY the specific conversation in the list (not a full refetch)
        if (conversationWith) {
          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.user._id === conversationWith);
            if (idx === -1) {
              // New conversation partner — do a full refetch to pick them up
              fetchConversationsQuietRef.current();
              return prev;
            }
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              lastMessage: newMsg,
              unreadCount:
                conversationWith === currentChat
                  ? updated[idx].unreadCount
                  : updated[idx].unreadCount + 1,
            };
            // Move to top of list
            if (idx > 0) {
              const [target] = updated.splice(idx, 1);
              updated.unshift(target);
            }
            return updated;
          });
        } else {
          // Fallback for events without conversationWith (backwards compat)
          fetchConversationsQuietRef.current();
        }
      }
    } else if (event.type === "incoming_call") {
      handleIncomingCall(event.data);
    } else if (event.type === "call_accepted") {
      // Only handle if we are the caller (initiated the call)
    } else if (event.type === "call_rejected") {
      handleCallRejected(event.data);
    } else if (event.type === "call_ended") {
      handleCallEnded(event.data);
    } else if (event.type === "ice_candidate") {
      handleIceCandidate(event.data);
    }
  }, []); // No dependencies - using refs to avoid stale closures

  // Real-time event handling for calls and messages via SSE
  const { isConnected } = useRealtime({
    onMessage: handleRealtimeMessage,
  });

  // Call duration timer
  useEffect(() => {
    if (callState === "connected" && callStartTime) {
      callTimerRef.current = setInterval(() => {
        setCallDuration(Math.floor((Date.now() - callStartTime) / 1000));
      }, 1000);
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
    }

    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, [callState, callStartTime]);

  // Quiet fetch for real-time updates (no loading state change)
  const fetchConversationsQuiet = async () => {
    try {
      const response = await fetch("/api/messages/conversations");
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      }
    } catch (error) {
      // Silent fail for background updates
    }
  };

  // Keep ref updated for SSE callback
  useEffect(() => {
    fetchConversationsQuietRef.current = fetchConversationsQuiet;
  });

  const fetchConversations = async () => {
    try {
      const response = await fetch("/api/messages/conversations");
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      }
    } catch (error) {
      console.error("Error fetching conversations:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (userId: string) => {
    try {
      const response = await fetch(`/api/messages?conversationWith=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  };

  useEffect(() => {
    if (!session?.user?.id) return;

    const refreshVisibleMessages = () => {
      if (document.visibilityState !== "visible") return;
      void fetchConversationsQuiet();
      if (selectedChat) void fetchMessages(selectedChat);
    };

    const interval = window.setInterval(refreshVisibleMessages, 8_000);
    window.addEventListener("focus", refreshVisibleMessages);
    document.addEventListener("visibilitychange", refreshVisibleMessages);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisibleMessages);
      document.removeEventListener("visibilitychange", refreshVisibleMessages);
    };
  }, [session?.user?.id, selectedChat]);

  const markAsRead = async (userId: string) => {
    try {
      await fetch(`/api/messages/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationWith: userId, status: "read" }),
      });
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  const fetchDietitians = async () => {
    try {
      setLoadingDietitians(true);
      const response = await fetch("/api/users/dietitians");
      if (response.ok) {
        const data = await response.json();
        setDietitians(data.dietitians || []);
      }
    } catch (error) {
      console.error("Error fetching dietitians:", error);
    } finally {
      setLoadingDietitians(false);
    }
  };

  const fetchSelectedChatUser = async (userId: string) => {
    try {
      const response = await fetch(`/api/users/${userId}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedChatUser(data.user);
      }
    } catch (error) {
      console.error("Error fetching selected chat user:", error);
    }
  };

  const startNewChat = (dietitianId: string) => {
    setSelectedChat(dietitianId);
    setShowNewChatModal(false);
    setDietitianSearchQuery("");
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedChat || sending) return;

    const messageText = newMessage.trim();
    setNewMessage("");
    setSending(true);

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId: selectedChat,
          content: messageText,
          type: "text",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const sentMessage = (await response.json()) as Message;
      if (sentMessage?._id) {
        setMessages((previous) =>
          previous.some((message) => message._id === sentMessage._id)
            ? previous
            : [...previous, sentMessage],
        );
        void fetchConversationsQuiet();
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setNewMessage(messageText); // Restore message on error
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // WebRTC Call Initiation
  const initiateWebRTCCall = async (
    receiverId: string,
    callType: "audio" | "video",
  ) => {
    try {
      // Generate unique call ID
      const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

      // Get user media based on call type
      const constraints = {
        audio: true,
        video: callType === "video",
      };

      const localStream =
        await navigator.mediaDevices.getUserMedia(constraints);

      // Create peer connection
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });

      // Add local stream to peer connection
      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
      });

      // Create offer
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === "video",
      });

      await peerConnection.setLocalDescription(offer);

      // Send call initiation signal to server
      const response = await fetch("/api/webrtc/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: callType,
          callId,
          receiverId,
          offer,
        }),
      });

      if (response.ok) {
        alert(
          `📞 ${callType === "video" ? "Video" : "Voice"} call initiated!\n\nWaiting for ${conversations.find((c) => c.user._id === receiverId)?.user.firstName} to answer...`,
        );
      } else {
        throw new Error("Failed to initiate call");
      }
    } catch (error) {
      console.error("Error initiating call:", error);
      alert(
        `Failed to start ${callType} call.\n\nPlease check your internet connection and try again.`,
      );
    }
  };

  // Call handling functions
  const handleIncomingCall = async (callData: any) => {
    // Calling is disabled in messages UI
    return;
  };

  const acceptCall = async () => {
    if (!incomingCall) {
      console.error("No incoming call to accept");
      return;
    }

    try {
      setCallState("connecting");

      // Set current call info immediately
      setCurrentCall({
        id: incomingCall.callId,
        type: incomingCall.type,
        caller: {
          id: incomingCall.callerId,
          name: incomingCall.callerName,
          avatar: incomingCall.callerAvatar,
        },
      });

      // Get user media
      const constraints = {
        audio: true,
        video: incomingCall.type === "video",
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);

      // Set up local video
      if (localVideoRef.current && incomingCall.type === "video") {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true; // Prevent echo
      }

      // Create peer connection
      const pc = createPeerConnection(
        incomingCall.callId,
        incomingCall.callerId,
      );
      setPeerConnection(pc);

      // Add local stream to peer connection
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Set remote description (offer)
      await pc.setRemoteDescription(incomingCall.offer);

      // Create answer
      const answer = await pc.createAnswer();

      await pc.setLocalDescription(answer);

      // Send answer to caller
      const signalPayload = {
        type: "call_accepted",
        callId: incomingCall.callId,
        callerId: incomingCall.callerId,
        answer,
      };

      const response = await fetch("/api/webrtc/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signalPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Signal response error:", errorText);
        throw new Error(`Signal failed: ${response.status} ${errorText}`);
      }

      // Update state to connected immediately
      setCallState("connected");
      setCallStartTime(Date.now());
      setIncomingCall(null);
    } catch (error) {
      console.error("Error accepting call:", error);
      rejectCall();
    }
  };

  const rejectCall = async () => {
    if (!incomingCall) return;

    try {
      await fetch("/api/webrtc/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "call_rejected",
          callId: incomingCall.callId,
          callerId: incomingCall.callerId,
        }),
      });
    } catch (error) {
      console.error("Error rejecting call:", error);
    }

    // Clean up
    setIncomingCall(null);
    setCallState("idle");
    setCurrentCall(null);
  };

  const endCall = async () => {
    try {
      if (currentCall?.id) {
        await fetch("/api/webrtc/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "call_ended",
            callId: currentCall.id,
            callerId: currentCall.caller?.id,
            receiverId: session?.user?.id,
          }),
        });
      }
    } catch (error) {
      console.error("Error ending call:", error);
    }

    // Clean up streams and connections
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach((track) => track.stop());
      setRemoteStream(null);
    }
    if (peerConnection) {
      peerConnection.close();
      setPeerConnection(null);
    }

    // Reset state
    setCallState("idle");
    setCurrentCall(null);
    setIncomingCall(null);
    setCallDuration(0);
    setCallStartTime(null);
    setIsMuted(false);
    setIsVideoOff(false);
  };

  // Additional call handlers

  const handleCallRejected = (data?: any) => {
    endCall();
  };

  const handleCallEnded = (data?: any) => {
    endCall();
  };

  const handleIceCandidate = async (data: any) => {
    if (peerConnection && data.iceCandidate) {
      await peerConnection.addIceCandidate(data.iceCandidate);
    }
  };

  // Create peer connection with proper configuration
  const createPeerConnection = (callId?: string, remoteUserId?: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      const activeCallId = callId || currentCall?.id;
      const activeRemoteUserId = remoteUserId || currentCall.caller?.id;

      if (event.candidate && activeCallId) {
        fetch("/api/webrtc/signal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "ice_candidate",
            callId: activeCallId,
            iceCandidate: event.candidate.toJSON(),
            callerId: session?.user?.id,
            receiverId: activeRemoteUserId,
          }),
        }).catch((error) => {
          console.error("Failed to send ICE candidate:", error);
        });
      } else {
      }
    };

    // Handle remote stream
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      setRemoteStream(remoteStream);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setCallState("connected");
      } else if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed"
      ) {
        endCall();
      }
    };

    return pc;
  };

  // Call control functions
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
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  // Format call duration
  const formatCallDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleEmojiClick = () => {
    setShowEmojiPicker(!showEmojiPicker);
  };

  const addEmoji = (emoji: string) => {
    setNewMessage((prev) => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const handleFileAttachment = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChat) return;

    // Check file size (max 25MB for messages)
    if (file.size > 25 * 1024 * 1024) {
      alert("File size must be less than 25MB");
      e.target.value = "";
      return;
    }

    setUploadingFile(true);
    try {
      const uploadData = await uploadFileReliably(file, "message");

      // Determine message type based on file MIME type
      const type = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : file.type.startsWith("audio/")
            ? "audio"
            : "file";

      const attachment = {
        url: uploadData.url,
        fileId: uploadData.fileId,
        filename: uploadData.filename || file.name,
        size: uploadData.size || file.size,
        mimeType: uploadData.type || file.type,
      };

      // Send message with attachment
      await sendMessageWithAttachment(type, [attachment], file.name);
    } catch (error) {
      console.error("File upload error:", error);
      alert("Failed to upload file. Please try again.");
    } finally {
      setUploadingFile(false);
      e.target.value = "";
    }
  };

  const handleCameraClick = () => {
    cameraInputRef.current?.click();
  };

  const handleCameraCapture = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChat) return;

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

      // Send image message
      await sendMessageWithAttachment("image", [attachment], "Photo");
    } catch (error) {
      console.error("Camera upload error:", error);
      alert("Failed to upload photo. Please try again.");
    } finally {
      setUploadingFile(false);
      e.target.value = "";
    }
  };

  const sendMessageWithAttachment = async (
    type: string,
    attachments: any[],
    content: string,
  ) => {
    if (!selectedChat) return;

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipientId: selectedChat,
          content: content || "",
          type,
          attachments,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const sentMessage = (await response.json()) as Message;
      if (sentMessage?._id) {
        setMessages((previous) =>
          previous.some((message) => message._id === sentMessage._id)
            ? previous
            : [...previous, sentMessage],
        );
        void fetchConversationsQuiet();
      }
    } catch (error) {
      console.error("Error sending attachment message:", error);
    }
  };

  const startRecording = async () => {
    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      // In production, use MediaRecorder API to record audio
      alert(
        "Voice recording started!\n\nPress stop to send voice message.\n\nFeature will be fully implemented with MediaRecorder API.",
      );

      // Stop tracks
      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      alert(
        "Microphone access denied.\n\nPlease allow microphone access to send voice messages.",
      );
      console.error("Recording error:", error);
    }
  };

  const stopRecording = () => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    setIsRecording(false);

    if (recordingTime > 0) {
      alert(
        `Voice message recorded!\n\nDuration: ${recordingTime} seconds\n\nWill be sent as audio message.`,
      );
    }

    setRecordingTime(0);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const formatMessageTime = (date: string) => {
    const messageDate = new Date(date);
    if (isToday(messageDate)) {
      return format(messageDate, "HH:mm");
    } else if (isYesterday(messageDate)) {
      return "Yesterday";
    } else {
      return format(messageDate, "MMM d");
    }
  };

  // Cache-bust ImageKit URLs to avoid serving stale CDN-cached error
  // responses (e.g. from billing suspension periods).
  // Cache-bust params go on the RAW ImageKit URL BEFORE it's wrapped in the
  // media proxy, so the proxy fetches the cache-busted URL from ImageKit.
  const getCacheBustedProxyUrl = (
    messageId: string,
    attachment: { url: string; filename?: string },
  ) => {
    const retryTick = attachmentRetryTick[messageId] || 0;
    const rawUrl = attachment.url;
    const isImageKit = /ik\.imagekit\.io/i.test(rawUrl);

    if (isImageKit || retryTick > 0) {
      const separator = rawUrl.includes("?") ? "&" : "?";
      const bustParam =
        retryTick > 0
          ? `retry=${retryTick}`
          : `ts=${Math.floor(Date.now() / 600000)}`; // ~10 min rotation
      const cacheBustedUrl = `${rawUrl}${separator}${bustParam}`;
      return getMediaProxyUrl({
        url: cacheBustedUrl,
        filename: attachment.filename,
      });
    }
    return getMediaProxyUrl(attachment);
  };

  const markAttachmentFailed = (messageId: string) => {
    console.warn("[Messages] Media load failed for message:", messageId);
    setFailedAttachments((prev) => new Set([...prev, messageId]));
  };

  const retryAttachment = (messageId: string) => {
    setFailedAttachments((prev) => {
      const next = new Set(prev);
      next.delete(messageId);
      return next;
    });
    setAttachmentRetryTick((prev) => ({
      ...prev,
      [messageId]: (prev[messageId] || 0) + 1,
    }));
  };

  const formatLastMessageTime = (date: string) => {
    try {
      if (!date) return "";
      const messageDate = new Date(date);
      if (isNaN(messageDate.getTime())) return "";
      if (isToday(messageDate)) {
        return format(messageDate, "HH:mm");
      } else if (isYesterday(messageDate)) {
        return "Yesterday";
      } else {
        return format(messageDate, "dd/MM/yy");
      }
    } catch (error) {
      return "";
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase();
  };

  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const fullName =
      `${conv.user.firstName} ${conv.user.lastName}`.toLowerCase();
    const phone = (conv.user.phone || "").replace(/\D/g, "");
    const clientId = (conv.user.clientId || "").toLowerCase();
    return (
      fullName.includes(q) ||
      phone.includes(q.replace(/\D/g, "")) ||
      clientId.includes(q)
    );
  });

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner className="h-12 w-12 text-emerald-500" />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  // Chat View (WhatsApp Style)
  if (selectedChat) {
    const currentChat = conversations.find((c) => c.user._id === selectedChat);
    // Use selectedChatUser if currentChat is not found (new conversation)
    const chatUser = currentChat?.user || selectedChatUser;

    return (
      <div className="fixed inset-0 bg-[#ECE5DD] flex flex-col">
        {/* Chat Header - WhatsApp Style */}
        <div className="bg-[#075E54] text-white safe-area-top shadow-md z-50">
          <div className="flex items-center px-3 py-2">
            <button
              onClick={() => setSelectedChat(null)}
              className="mr-3 p-2 hover:bg-white/10 rounded-full active:scale-95 transition-all"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>

            <div className="flex items-center flex-1 min-w-0">
              <div className="relative mr-3">
                {chatUser?.avatar ? (
                  <img
                    src={chatUser.avatar}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center text-white font-semibold text-sm">
                    {getInitials(
                      chatUser?.firstName || "",
                      chatUser?.lastName || "",
                    )}
                  </div>
                )}
                {currentChat?.isOnline && (
                  <div className="absolute bottom-0 right-0 h-3 w-3 bg-green-400 rounded-full border-2 border-[#075E54]" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h1 className="text-base font-semibold truncate text-white">
                  {chatUser?.firstName} {chatUser?.lastName}
                </h1>
                <p className="text-xs text-white/90">
                  {chatUser?.role === "dietitian" ||
                  chatUser?.role === "health_counselor"
                    ? "Dietitian"
                    : currentChat?.isOnline
                      ? "Online"
                      : "Available"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Messages Area - WhatsApp Style */}
        <div
          className="flex-1 overflow-y-auto px-2 sm:px-3 py-3 sm:py-4 space-y-2"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h100v100H0z' fill='%23ECE5DD'/%3E%3Cpath d='M20 20h60v60H20z' fill='%23D9D9D9' opacity='.05'/%3E%3C/svg%3E\")",
            backgroundSize: "300px 300px",
          }}
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="bg-white/80 rounded-2xl p-6 shadow-sm">
                <MessageCircle className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                  No messages yet
                </h3>
                <p className="text-gray-500 text-sm">Start the conversation!</p>
              </div>
            </div>
          ) : (
            messages.map((message, index) => {
              const isSent = message.sender._id === session.user.id;
              const showTime =
                index === 0 ||
                new Date(messages[index - 1].createdAt).getTime() -
                  new Date(message.createdAt).getTime() >
                  300000;

              return (
                <div key={message._id}>
                  {showTime && (
                    <div className="flex justify-center my-4">
                      <div className="bg-white/90 px-3 py-1 rounded-lg shadow-sm">
                        <span className="text-xs text-gray-600 font-medium">
                          {formatMessageTime(message.createdAt)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div
                    className={`flex ${isSent ? "justify-end" : "justify-start"} mb-1 px-1`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-[75%] ${isSent ? "order-2" : "order-1"}`}
                    >
                      <div
                        className={`rounded-lg px-3 py-2 shadow-sm inline-block ${
                          isSent
                            ? "bg-[#DCF8C6] text-gray-900 rounded-tr-none"
                            : "bg-white text-gray-900 rounded-tl-none"
                        }`}
                      >
                        {/* Image Messages */}
                        {message.type === "image" &&
                          message.attachments?.[0] && (
                            <div className="mb-2">
                              {failedAttachments.has(message._id) ? (
                                <button
                                  type="button"
                                  onClick={() => retryAttachment(message._id)}
                                  className="w-40 h-32 rounded-lg flex flex-col items-center justify-center gap-2 text-xs bg-gray-200 text-gray-500 hover:bg-gray-300 transition-colors"
                                >
                                  <RotateCcw className="w-5 h-5" />
                                  <span>Image unavailable · Tap to retry</span>
                                </button>
                              ) : (
                                <img
                                  src={getCacheBustedProxyUrl(
                                    message._id,
                                    message.attachments[0],
                                  )}
                                  alt="Shared image"
                                  className="rounded-lg max-w-full max-h-64 h-auto cursor-pointer hover:opacity-90 transition-opacity"
                                  onClick={() =>
                                    setPreviewImage(
                                      getMediaUrl(message.attachments?.[0]) ||
                                        null,
                                    )
                                  }
                                  onError={(e) => {
                                    console.error(
                                      "[Messages] Image load error",
                                      {
                                        messageId: message._id,
                                        url: message.attachments?.[0]?.url,
                                      },
                                    );
                                    markAttachmentFailed(message._id);
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
                                src={getMediaProxyUrl(message.attachments[0])}
                                controls
                                className="rounded-lg max-w-full max-h-64 h-auto"
                                preload="metadata"
                              >
                                Your browser does not support video playback.
                              </video>
                            </div>
                          )}

                        {/* Audio/Voice Messages */}
                        {(message.type === "audio" ||
                          message.type === "voice") &&
                          message.attachments?.[0] && (
                            <div className="mb-2 flex items-center space-x-2 p-2 bg-gray-100 rounded-lg min-w-50">
                              <Volume2 className="h-5 w-5 text-gray-600 shrink-0" />
                              <audio
                                controls
                                className="flex-1 h-8"
                                preload="metadata"
                              >
                                <source
                                  src={getMediaProxyUrl(message.attachments[0])}
                                  type={
                                    message.attachments[0].mimeType || "audio/*"
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

                        {/* File/Document Messages */}
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
                              (att.mimeType || "") === "application/pdf" ||
                              (att.filename || "").endsWith(".pdf");
                            return (
                              <div
                                className="w-full max-w-xs sm:max-w-md lg:max-w-lg mb-2 bg-white rounded-xl border border-gray-200 overflow-hidden cursor-pointer"
                                onClick={() => {
                                  if (viewable) {
                                    setDocumentViewer({
                                      url: mediaUrl,
                                      filename: att.filename,
                                      mimeType: att.mimeType || "",
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
                                  <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center shrink-0">
                                    <FileIcon className="h-5 w-5 text-white" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                      {att.filename}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {(att.size / 1024 / 1024).toFixed(2)} MB
                                    </p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className={`w-full px-3 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 border-t transition-colors ${viewable ? "text-blue-600 hover:bg-blue-50" : "text-gray-600 hover:bg-gray-50"}`}
                                >
                                  {viewable ? (
                                    <>
                                      <Eye className="h-4 w-4" /> View Document
                                    </>
                                  ) : (
                                    <>
                                      <Download className="h-4 w-4" /> Download
                                      File
                                    </>
                                  )}
                                </button>
                              </div>
                            );
                          })()}

                        {/* Text Content */}
                        {message.content && (
                          <p className="text-[14px] sm:text-[15px] leading-relaxed wrap-break-word whitespace-pre-wrap">
                            {message.content}
                          </p>
                        )}
                        <div
                          className={`flex items-center justify-end space-x-1 mt-1`}
                        >
                          <span className="text-[10px] sm:text-[11px] text-gray-500">
                            {format(new Date(message.createdAt), "HH:mm")}
                          </span>
                          {isSent &&
                            (message.isRead ? (
                              <CheckCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500" />
                            ) : (
                              <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-500" />
                            ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Emoji Picker */}
        {showEmojiPicker && (
          <div className="absolute bottom-16 left-4 right-4 bg-white rounded-2xl shadow-2xl p-4 z-50 max-h-64 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Emojis</h3>
              <button
                onClick={() => setShowEmojiPicker(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-8 gap-2">
              {[
                "😊",
                "😂",
                "❤️",
                "👍",
                "🙏",
                "😍",
                "🎉",
                "🔥",
                "💪",
                "✨",
                "🌟",
                "💯",
                "👏",
                "🤗",
                "😎",
                "🥳",
                "😋",
                "🤤",
                "🍎",
                "🥗",
                "🥑",
                "🍓",
                "🥦",
                "🥕",
                "🍊",
                "🍌",
                "🥤",
                "💧",
                "🏃",
                "🧘",
                "💊",
                "📊",
                "📈",
                "⚖️",
                "🎯",
                "✅",
                "❌",
                "⏰",
                "📅",
                "💬",
                "📞",
              ].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => addEmoji(emoji)}
                  className="text-2xl p-2 hover:bg-gray-100 rounded-lg active:scale-95 transition-all"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Image Preview Modal */}
        {previewImage && (
          <div
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setPreviewImage(null)}
          >
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <X className="h-6 w-6 text-white" />
            </button>
            <img
              src={getMediaProxyUrl(previewImage)}
              alt="Preview"
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {/* Uploading Indicator */}
        {uploadingFile && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-40">
            <div className="bg-white rounded-2xl p-6 shadow-xl flex flex-col items-center">
              <Loader2 className="h-10 w-10 text-green-500 animate-spin mb-3" />
              <p className="text-gray-700 font-medium">Uploading file...</p>
              <p className="text-gray-500 text-sm mt-1">Please wait</p>
            </div>
          </div>
        )}

        <DocumentViewerModal
          isOpen={Boolean(documentViewer)}
          onClose={() => setDocumentViewer(null)}
          url={documentViewer?.url || ""}
          filename={documentViewer?.filename || "Document"}
          mimeType={documentViewer?.mimeType || ""}
        />

        {/* Message Input - WhatsApp Style */}
        <div className="bg-[#F0F0F0] px-2 sm:px-3 py-2 safe-area-bottom">
          {/* Recording Indicator */}
          {isRecording && (
            <div className="mb-2 px-3 sm:px-4 py-2 bg-red-500 text-white rounded-full flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 bg-white rounded-full animate-pulse" />
                <span className="text-xs sm:text-sm font-medium">
                  Recording... {recordingTime}s
                </span>
              </div>
              <button
                onClick={stopRecording}
                className="px-2 sm:px-3 py-1 bg-white text-red-500 rounded-full text-xs sm:text-sm font-medium active:scale-95 transition-all"
              >
                Stop
              </button>
            </div>
          )}

          <div className="flex items-end space-x-1.5 sm:space-x-2">
            <div className="flex-1 bg-white rounded-3xl flex items-center px-2 sm:px-3 py-1.5 sm:py-2 shadow-sm min-w-0">
              <button
                className="p-0.5 sm:p-1 hover:bg-gray-100 rounded-full active:scale-95 transition-all shrink-0"
                onClick={handleEmojiClick}
              >
                <Smile className="h-5 w-5 sm:h-6 sm:w-6 text-gray-500" />
              </button>

              <input
                ref={inputRef}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message"
                className="flex-1 px-2 sm:px-3 py-1 text-[14px] sm:text-[15px] bg-transparent border-none outline-none min-w-0"
              />

              <button
                onClick={handleFileAttachment}
                className="p-0.5 sm:p-1 hover:bg-gray-100 rounded-full active:scale-95 transition-all shrink-0"
              >
                <Paperclip className="h-5 w-5 sm:h-6 sm:w-6 text-gray-500" />
              </button>

              {!newMessage.trim() && !isRecording && (
                <button
                  onClick={handleCameraClick}
                  className="p-0.5 sm:p-1 hover:bg-gray-100 rounded-full active:scale-95 transition-all ml-0.5 sm:ml-1 shrink-0"
                >
                  <Camera className="h-5 w-5 sm:h-6 sm:w-6 text-gray-500" />
                </button>
              )}
            </div>

            <button
              onClick={
                newMessage.trim()
                  ? sendMessage
                  : isRecording
                    ? stopRecording
                    : startRecording
              }
              disabled={sending}
              className={`p-2.5 sm:p-3 rounded-full shadow-lg active:scale-95 transition-all shrink-0 ${
                isRecording
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-[#075E54] hover:bg-[#064e47]"
              } disabled:opacity-50`}
            >
              {newMessage.trim() ? (
                <Send className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-white" />
              ) : isRecording ? (
                <div className="h-4.5 w-4.5 sm:h-5 sm:w-5 bg-white rounded-sm" />
              ) : (
                <Mic className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-white" />
              )}
            </button>
          </div>

          {/* Hidden File Inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="*/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCameraCapture}
            className="hidden"
          />
        </div>
      </div>
    );
  }

  // Conversations List - WhatsApp Style
  return (
    <div className="fixed inset-0 bg-white flex flex-col">
      {/* Header - WhatsApp Style */}
      <div className="bg-[#075E54] text-white safe-area-top md:mt-0 mt-18.75 shadow-md">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-semibold">Messages</h1>
            <div className="flex items-center space-x-1">
              <button className="p-2 hover:bg-white/10 rounded-full active:scale-95 transition-all">
                <Camera className="h-5 w-5" />
              </button>
              <button className="p-2 hover:bg-white/10 rounded-full active:scale-95 transition-all">
                <Search className="h-5 w-5" />
              </button>
              <button className="p-2 hover:bg-white/10 rounded-full active:scale-95 transition-all">
                <MoreVertical className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search or start new chat"
              className="w-full h-10 pl-10 pr-4 rounded-lg bg-white/20 text-white placeholder-white/60 border-none outline-none"
            />
          </div>
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto bg-white pb-20">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 px-4">
            <MessageCircle className="h-20 w-20 text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              No conversations
            </h3>
            <p className="text-gray-500 text-sm mb-4">
              Start chatting with your dietitian
            </p>
            <button
              onClick={() => {
                setShowNewChatModal(true);
                fetchDietitians();
              }}
              className="px-6 py-3 bg-[#075E54] text-white rounded-full font-medium shadow-lg hover:bg-[#064e47] active:scale-95 transition-all"
            >
              Find Dietitian
            </button>
          </div>
        ) : (
          filteredConversations.map((conv) => (
            <button
              key={conv.user._id}
              onClick={() => setSelectedChat(conv.user._id)}
              className="w-full flex items-center px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-100"
            >
              <div className="relative mr-3">
                {conv.user.avatar ? (
                  <img
                    src={conv.user.avatar}
                    alt=""
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-full bg-linear-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold text-lg">
                    {getInitials(conv.user.firstName, conv.user.lastName)}
                  </div>
                )}
                {conv.isOnline && (
                  <div className="absolute bottom-0 right-0 h-4 w-4 bg-green-500 rounded-full border-2 border-white" />
                )}
              </div>

              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-[16px] font-semibold text-gray-900 truncate">
                    {conv.user.firstName} {conv.user.lastName}
                  </h3>
                  <span className="text-xs text-gray-500 ml-2 shrink-0">
                    {formatLastMessageTime(conv.lastMessage.createdAt)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-[14px] text-gray-600 truncate flex-1 pr-2">
                    {conv.lastMessage.isFromMe && (
                      <Check className="inline h-4 w-4 mr-1 text-gray-500" />
                    )}
                    {conv.lastMessage.content}
                  </p>
                  {conv.unreadCount > 0 && (
                    <div className="shrink-0 h-5 min-w-5 px-1.5 rounded-full bg-[#25D366] flex items-center justify-center">
                      <span className="text-xs font-semibold text-white">
                        {conv.unreadCount}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Floating Action Button - New Chat */}
      {!showNewChatModal && (
        <button
          onClick={() => {
            setShowNewChatModal(true);
            fetchDietitians();
          }}
          className="fixed bottom-24 right-6 h-14 w-14 rounded-full bg-[#25D366] text-white shadow-2xl hover:bg-[#20ba5a] active:scale-95 transition-all z-40 flex items-center justify-center"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md z-50 flex items-end sm:items-center sm:justify-center">
          <div className="bg-white h-[75vh] w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl max-h-[80vh] flex flex-col animate-slide-up">
            {/* Modal Header */}
            <div className="bg-[#075E54] text-white px-4 py-4 sm:rounded-t-2xl rounded-t-3xl flex items-center justify-between">
              <h2 className="text-lg font-semibold">New Chat</h2>
              <button
                onClick={() => {
                  setShowNewChatModal(false);
                  setDietitianSearchQuery("");
                }}
                className="p-2 hover:bg-white/10 rounded-full active:scale-95 transition-all"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="p-4 border-b border-gray-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  value={dietitianSearchQuery}
                  onChange={(e) => setDietitianSearchQuery(e.target.value)}
                  placeholder="Search dietitians..."
                  className="w-full h-11 pl-10 pr-4 rounded-xl bg-gray-100 border-none outline-none text-gray-900 placeholder-gray-500"
                  autoFocus
                />
              </div>
            </div>

            {/* Dietitians List */}
            <div className="flex-1 overflow-y-auto">
              {loadingDietitians ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingSpinner className="h-8 w-8 text-[#075E54]" />
                </div>
              ) : (
                (() => {
                  const filteredDietitians = dietitians.filter((d) =>
                    `${d.firstName} ${d.lastName} ${d.email}`
                      .toLowerCase()
                      .includes(dietitianSearchQuery.toLowerCase()),
                  );

                  if (filteredDietitians.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                        <UserIcon className="h-16 w-16 text-gray-300 mb-3" />
                        <h3 className="text-base font-semibold text-gray-700 mb-1">
                          No dietitians found
                        </h3>
                        <p className="text-sm text-gray-500">
                          Try a different search
                        </p>
                      </div>
                    );
                  }

                  return filteredDietitians.map((dietitian) => (
                    <button
                      key={dietitian._id}
                      onClick={() => startNewChat(dietitian._id)}
                      className="w-full flex items-center px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-100"
                    >
                      <div className="relative mr-3">
                        {dietitian.avatar ? (
                          <img
                            src={dietitian.avatar}
                            alt=""
                            className="h-12 w-12 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-full bg-linear-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-semibold">
                            {getInitials(
                              dietitian.firstName,
                              dietitian.lastName,
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 text-left">
                        <h3 className="text-[15px] font-semibold text-gray-900 truncate">
                          {dietitian.firstName} {dietitian.lastName}
                        </h3>
                        <p className="text-[13px] text-gray-600 truncate">
                          {dietitian.email}
                        </p>
                        {dietitian.specializations &&
                          dietitian.specializations.length > 0 && (
                            <p className="text-[12px] text-emerald-600 truncate mt-0.5">
                              {dietitian.specializations.join(", ")}
                            </p>
                          )}
                      </div>

                      <ChevronLeft className="h-5 w-5 text-gray-400 rotate-180" />
                    </button>
                  ));
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-bottom z-50">
        <div className="grid grid-cols-5 h-16">
          <Link
            href="/client-dashboard"
            className="flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 active:bg-gray-50 transition-colors"
          >
            <Home className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">Home</span>
          </Link>
          <Link
            href="/my-plan"
            className="flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 active:bg-gray-50 transition-colors"
          >
            <Target className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">Plan</span>
          </Link>
          <button className="flex flex-col items-center justify-center -mt-6">
            <div className="h-14 w-14 rounded-full bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg active:scale-95 transition-transform">
              <Plus className="h-7 w-7 text-white" />
            </div>
          </button>
          <Link
            href="/progress"
            className="flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 active:bg-gray-50 transition-colors"
          >
            <TrendingUp className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">Progress</span>
          </Link>
          <Link
            href="/messages"
            className="flex flex-col items-center justify-center text-[#075E54] active:bg-gray-50 transition-colors"
          >
            <MessageCircle className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">Messages</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

// Main routing component
function MessagesPageContent() {
  const { data: session } = useSession();
  const isClient = session?.user?.role === "client";

  // Route to appropriate UI based on role
  if (!isClient && session) {
    return <DesktopMessagesPage />;
  }

  // Show client WhatsApp-style UI
  return <ClientMessagesUI />;
}

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <LoadingSpinner className="h-12 w-12 text-emerald-500" />
        </div>
      }
    >
      <MessagesPageContent />
    </Suspense>
  );
}
