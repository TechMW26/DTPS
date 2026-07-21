"use client";

import {
  useEffect,
  useState,
  useRef,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/contexts/ThemeContext";
import { useUnreadCountsSafe } from "@/contexts/UnreadCountContext";
import { useRealtime } from "@/hooks/useRealtime";
import { ResponsiveLayout } from "@/components/client/layouts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { compressImage } from "@/lib/imageCompression";
import ImageLightbox from "@/components/ui/image-lightbox";
import { DocumentViewerModal } from "@/components/chat/DocumentViewerModal";
import {
  Send,
  Paperclip,
  Check,
  CheckCheck,
  ArrowLeft,
  User,
  Loader2,
  Mic,
  FileText,
  Download,
  Play,
  Pause,
  RotateCcw,
  Camera,
  File as FileIcon,
  ChevronDown,
  X,
  Eye,
  Image as ImageIcon,
  Video,
  CornerDownRight,
  MoreVertical,
  Trash2,
} from "lucide-react";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { toast } from "sonner";
import SpoonGifLoader from "@/components/ui/SpoonGifLoader";
import {
  getMediaKind,
  getMediaProxyUrl,
  getMediaUrl,
  isViewableDocument,
  normalizeMediaUrl,
} from "@/lib/media";

interface MessageUser {
  _id: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  role: string;
}

interface MessageAttachment {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
  fileId?: string;
  thumbnail?: string;
  duration?: number;
  width?: number;
  height?: number;
}

interface Message {
  _id: string;
  content: string;
  sender: MessageUser;
  receiver: MessageUser;
  type: "text" | "image" | "video" | "audio" | "voice" | "file";
  attachments?: MessageAttachment[];
  isRead: boolean;
  createdAt: string;
  replyTo?: {
    _id: string;
    content: string;
    type: "text" | "image" | "video" | "audio" | "voice" | "file";
    attachments?: MessageAttachment[];
    sender?: Pick<MessageUser, "firstName" | "lastName" | "avatar">;
    createdAt?: string;
  };
}

interface Conversation {
  _id: string;
  user: MessageUser;
  lastMessage: {
    content: string;
    type: string;
    createdAt: string;
    isRead: boolean;
  } | null;
  unreadCount: number;
}

interface MediaPreviewState {
  file: File;
  type: "image" | "video" | "file";
  previewUrl: string;
  caption: string;
}

interface UploadingMediaState {
  id: string;
  file: File;
  type: "image" | "video" | "file";
  previewUrl: string;
  caption: string;
  progress: number;
  error: string | null;
  replyToId?: string;
}

export default function UserMessagesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isDarkMode } = useTheme();
  const { refreshCounts } = useUnreadCountsSafe();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] =
    useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(
    null,
  );
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasDietitian, setHasDietitian] = useState(true);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<MediaPreviewState | null>(
    null,
  );
  const [uploadingMedia, setUploadingMedia] =
    useState<UploadingMediaState | null>(null);
  const [failedAttachments, setFailedAttachments] = useState<Set<string>>(
    new Set(),
  );
  const [attachmentRetryTick, setAttachmentRetryTick] = useState<
    Record<string, number>
  >({});
  const [voicePlayingId, setVoicePlayingId] = useState<string | null>(null);
  const [voiceProgress, setVoiceProgress] = useState<Record<string, number>>(
    {},
  );
  const [voiceDurations, setVoiceDurations] = useState<Record<string, number>>(
    {},
  );
  const [videoPlayerOpen, setVideoPlayerOpen] = useState(false);
  const [videoPlayerUrl, setVideoPlayerUrl] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState("");
  const [documentViewer, setDocumentViewer] = useState<{
    url: string;
    filename: string;
    mimeType: string;
  } | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messageElementRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<BlobPart[]>([]);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStartedAtRef = useRef<number>(0);
  const recordingReplyToIdRef = useRef<string | undefined>(undefined);
  const isInitialLoadRef = useRef(false);
  const userPressedBackRef = useRef(false);
  const lastTappedMessageRef = useRef<{ id: string; at: number } | null>(null);

  const openLightbox = (url: string) => {
    setLightboxImage(url);
    setLightboxOpen(true);
  };

  const detectAudioExtension = (mimeType: string) => {
    const normalized = mimeType.toLowerCase();
    if (
      normalized.includes("mp4") ||
      normalized.includes("m4a") ||
      normalized.includes("aac")
    )
      return "m4a";
    if (normalized.includes("webm")) return "webm";
    if (normalized.includes("ogg") || normalized.includes("opus")) return "ogg";
    if (normalized.includes("wav")) return "wav";
    if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
    if (normalized.includes("flac")) return "flac";
    return "webm";
  };

  const resolveAttachmentUrl = (rawUrl: string, messageId: string) => {
    if (!rawUrl) return "";

    let resolvedUrl = normalizeMediaUrl(rawUrl);
    if (!resolvedUrl) return "";

    // Cache-bust ImageKit URLs to avoid serving stale CDN-cached error
    // responses (e.g. from billing suspension periods).
    const isImageKit = /ik\.imagekit\.io/i.test(resolvedUrl);
    const retryTick = attachmentRetryTick[messageId] || 0;
    if (isImageKit || retryTick > 0) {
      const separator = resolvedUrl.includes("?") ? "&" : "?";
      // Use a stable daily cache-buster for non-retried URLs so that
      // the browser can still cache within a session, but stale CDN
      // error pages from previous billing outages are skipped.
      const bustParam =
        retryTick > 0
          ? `retry=${retryTick}`
          : `ts=${Math.floor(Date.now() / 600000)}`; // ~10 min rotation
      resolvedUrl = `${resolvedUrl}${separator}${bustParam}`;
    }

    return resolvedUrl;
  };

  const markAttachmentFailed = (messageId: string) => {
    setFailedAttachments((prev) => new Set([...prev, messageId]));
  };

  const retryAttachment = (messageId: string) => {
    const audio = audioRefs.current[messageId];
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audioRefs.current[messageId] = null;
    }

    setVoicePlayingId((prev) => (prev === messageId ? null : prev));
    setVoiceProgress((prev) => ({ ...prev, [messageId]: 0 }));
    setVoiceDurations((prev) => {
      const next = { ...prev };
      delete next[messageId];
      return next;
    });
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

  // Refs for SSE callbacks to avoid stale closures
  const selectedConversationRef = useRef<Conversation | null>(null);
  const fetchConversationsRef = useRef<() => void>(() => {});
  const scrollToBottomRef = useRef<(instant?: boolean) => void>(() => {});
  const isFetchingConversationsRef = useRef(false);
  const lastFetchTimeRef = useRef(0);

  // Real-time SSE connection for instant messaging
  useRealtime({
    onMessage: (evt) => {
      try {
        if (evt.type === "new_message") {
          const incoming = (evt.data as any)?.message;
          const conversationWith = (evt.data as any)?.conversationWith;
          if (incoming?._id) {
            const currentConv = selectedConversationRef.current;
            // If this belongs to the currently open conversation, append it
            if (
              currentConv &&
              (incoming.sender?._id === currentConv._id ||
                incoming.receiver?._id === currentConv._id)
            ) {
              setMessages((prev) =>
                prev.some((m) => m._id === incoming._id)
                  ? prev
                  : [...prev, incoming],
              );
              // Smooth scroll for new messages
              setTimeout(() => scrollToBottomRef.current(false), 50);
            }

            // Update ONLY the specific conversation in the list (not a full refetch)
            if (conversationWith) {
              setConversations((prev) => {
                const idx = prev.findIndex((c) => c._id === conversationWith);
                if (idx === -1) {
                  // New conversation partner — do a full refetch to pick them up
                  const now = Date.now();
                  if (now - lastFetchTimeRef.current > 2000) {
                    lastFetchTimeRef.current = now;
                    fetchConversationsRef.current();
                  }
                  return prev;
                }
                const updated = [...prev];
                updated[idx] = {
                  ...updated[idx],
                  lastMessage: {
                    content: incoming.content,
                    type: incoming.type || "text",
                    createdAt: incoming.createdAt,
                    isRead:
                      currentConv?._id === conversationWith ? true : false,
                  },
                  // If chat is currently open, keep unread at 0; otherwise increment
                  unreadCount:
                    currentConv?._id === conversationWith
                      ? 0
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
              const now = Date.now();
              if (now - lastFetchTimeRef.current > 2000) {
                lastFetchTimeRef.current = now;
                fetchConversationsRef.current();
              }
            }

            // Refresh unread counts
            refreshCounts();
          }
        }

        // Handle message deletion event
        if (evt.type === "message_deleted") {
          const deletedMessageId = (evt.data as any)?.messageId;
          if (deletedMessageId) {
            // Remove the deleted message from local state
            setMessages((prev) =>
              prev.filter((m) => m._id !== deletedMessageId),
            );
            setReplyingToMessage((current) =>
              current?._id === deletedMessageId ? null : current,
            );
            setMessageToDelete((current) =>
              current?._id === deletedMessageId ? null : current,
            );
            setDeleteDialogOpen(false);
            // Refresh conversations to update last message if needed
            const now = Date.now();
            if (now - lastFetchTimeRef.current > 1000) {
              lastFetchTimeRef.current = now;
              fetchConversationsRef.current();
            }
          }
        }

        // Handle message read event - update isRead status for messages
        if (evt.type === "message_read") {
          const readData = evt.data as any;
          if (readData?.conversationWith) {
            // Mark all messages in this conversation as read
            setMessages((prev) =>
              prev.map((msg) =>
                String(msg.receiver?._id) === String(readData.readBy)
                  ? { ...msg, isRead: true }
                  : msg,
              ),
            );
          }
        }
      } catch (e) {
        console.error("Failed handling realtime message event", e);
      }
    },
  });

  // Keep refs updated for SSE callbacks
  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    fetchConversationsRef.current = fetchConversations;
  });

  useEffect(() => {
    scrollToBottomRef.current = scrollToBottom;
  });

  useEffect(() => {
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (!attachMenuRef.current) return;
      if (!attachMenuRef.current.contains(event.target as Node)) {
        setShowAttachMenu(false);
      }
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);

    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (mediaPreview?.previewUrl) {
        URL.revokeObjectURL(mediaPreview.previewUrl);
      }
      if (uploadingMedia?.previewUrl) {
        URL.revokeObjectURL(uploadingMedia.previewUrl);
      }
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      if (recordStreamRef.current) {
        recordStreamRef.current.getTracks().forEach((track) => track.stop());
        recordStreamRef.current = null;
      }
    };
  }, [mediaPreview, uploadingMedia]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetchConversations();
    }
  }, [session]);

  // Handle conversationWith query param from push notification taps
  useEffect(() => {
    const conversationWith = searchParams.get("conversationWith");
    if (conversationWith && conversations.length > 0 && !selectedConversation) {
      // Find the conversation with this user ID
      const targetConversation = conversations.find(
        (c) => c._id === conversationWith,
      );
      if (targetConversation) {
        userPressedBackRef.current = false;
        setSelectedConversation(targetConversation);
        // Clear the query param from URL without triggering a navigation
        const newUrl = window.location.pathname;
        window.history.replaceState({}, "", newUrl);
      }
    }
  }, [searchParams, conversations, selectedConversation]);

  // Auto-select conversation if there's only one (the assigned dietitian)
  // But don't re-select if user manually pressed back or if URL has conversationWith
  useEffect(() => {
    const hasConversationWithParam = searchParams.get("conversationWith");
    if (
      conversations.length === 1 &&
      !selectedConversation &&
      !userPressedBackRef.current &&
      !hasConversationWithParam
    ) {
      setSelectedConversation(conversations[0]);
    }
  }, [conversations, selectedConversation, searchParams]);

  useEffect(() => {
    if (selectedConversation) {
      // Flag that we're doing an initial load (so scroll goes instant)
      isInitialLoadRef.current = true;
      // Clear previous messages first for a clean slate
      setMessages([]);
      setReplyingToMessage(null);
      fetchMessages(selectedConversation._id);
    }
  }, [selectedConversation]);

  // Scroll to bottom when NEW messages arrive (not on initial load — that's handled in fetchMessages)
  useEffect(() => {
    if (messages.length > 0 && !isInitialLoadRef.current) {
      // Smooth scroll for new incoming messages
      const timer = setTimeout(() => scrollToBottom(false), 50);
      return () => clearTimeout(timer);
    }
  }, [messages.length]);

  const fetchConversationsQuiet = async () => {
    // Prevent duplicate fetches
    if (isFetchingConversationsRef.current) return;

    try {
      isFetchingConversationsRef.current = true;
      const response = await fetch("/api/client/messages/conversations");
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      }
    } catch (error) {
      // Silent fail for background polling
    } finally {
      isFetchingConversationsRef.current = false;
    }
  };

  const fetchConversations = async () => {
    // Prevent duplicate fetches
    if (isFetchingConversationsRef.current) return;

    try {
      isFetchingConversationsRef.current = true;
      setLoading(true);
      const response = await fetch("/api/client/messages/conversations");
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
        setHasDietitian(data.hasDietitian !== false);
      }
    } catch (error) {
      console.error("Error fetching conversations:", error);
    } finally {
      setLoading(false);
      isFetchingConversationsRef.current = false;
    }
  };

  const fetchMessages = async (userId: string, showLoader = true) => {
    try {
      if (showLoader) setLoadingMessages(true);

      // Fetch ALL messages in one call - no limit
      const response = await fetch(
        `/api/client/messages?conversationWith=${userId}`,
      );
      if (!response.ok) {
        console.error("Failed to fetch messages");
        return;
      }

      const data = await response.json();
      const allMessages: Message[] = data.messages || [];

      // Messages are already sorted by createdAt from API (oldest first)
      // Set messages AND stop loading in same tick so messages render immediately
      setMessages(allMessages);
      setLoadingMessages(false);

      // Reset unread count for this conversation locally
      setConversations((prev) =>
        prev.map((conv) =>
          conv._id === userId ? { ...conv, unreadCount: 0 } : conv,
        ),
      );

      // Now schedule scrolls AFTER the messages have actually rendered
      // Using nested rAF ensures we scroll after React commits the DOM update
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container = messagesContainerRef.current;
          if (container) {
            container.scrollTop = container.scrollHeight;
          }
          // Additional delayed scrolls to catch images/media that load late
          setTimeout(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop =
                messagesContainerRef.current.scrollHeight;
            }
          }, 100);
          setTimeout(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop =
                messagesContainerRef.current.scrollHeight;
            }
          }, 300);
          setTimeout(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop =
                messagesContainerRef.current.scrollHeight;
            }
            isInitialLoadRef.current = false;
          }, 500);
        });
      });

      // Refresh unread counts in background (don't await - don't block rendering)
      refreshCounts().catch(() => {});
    } catch (error) {
      console.error("Error fetching messages:", error);
      setLoadingMessages(false);
    }
  };

  const scrollToBottom = (instant = false) => {
    requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      if (container) {
        if (instant) {
          // Direct scrollTop is the most reliable way to instantly jump to bottom
          container.scrollTop = container.scrollHeight;
        } else {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: "smooth",
          });
        }
      }
    });
  };

  // Show the floating down-arrow only when the user has scrolled up away from the latest message
  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowScrollToBottom(distanceFromBottom > 250);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || sending) return;

    const messageContent = newMessage.trim();
    const replyToId = replyingToMessage?._id;
    setSending(true);
    setNewMessage(""); // Optimistic clear
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    try {
      const response = await fetch("/api/client/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId: selectedConversation._id,
          content: messageContent,
          type: "text",
          replyTo: replyToId,
        }),
      });

      if (response.ok) {
        if (replyToId) {
          setReplyingToMessage((current) =>
            current?._id === replyToId ? null : current,
          );
        }
        // Message will appear via real-time SSE event
        inputRef.current?.focus();
        // Debounced refresh via SSE handler
      } else {
        // Restore message on failure and show error from API
        setNewMessage(messageContent);
        if (inputRef.current) {
          inputRef.current.style.height = "auto";
          inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
        }
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.error || "Failed to send message");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setNewMessage(messageContent);
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
        inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
      }
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleMessageInput = (value: string) => {
    setNewMessage(value);
    if (!inputRef.current) return;
    inputRef.current.style.height = "auto";
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
  };

  const compressVideoFile = async (file: File): Promise<File> => {
    if (
      !file.type.startsWith("video/") ||
      file.size < 1024 * 1024 ||
      typeof document === "undefined"
    ) {
      return file;
    }

    return new Promise((resolve) => {
      let settled = false;
      let objectUrl = "";

      const finish = (result: File) => {
        if (settled) return;
        settled = true;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        resolve(result);
      };

      try {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.muted = true;
        video.playsInline = true;

        objectUrl = URL.createObjectURL(file);

        video.onloadedmetadata = () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            finish(file);
            return;
          }

          const maxHeight = 480;
          let width = video.videoWidth;
          let height = video.videoHeight;
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }

          canvas.width = width;
          canvas.height = height;

          const stream = canvas.captureStream(24);
          const recorder = new MediaRecorder(stream, {
            mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
              ? "video/webm;codecs=vp9"
              : "video/webm",
            videoBitsPerSecond: 700000,
          });

          const chunks: Blob[] = [];
          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunks.push(event.data);
          };

          recorder.onstop = () => {
            const blob = new Blob(chunks, { type: "video/webm" });
            if (!blob.size) {
              finish(file);
              return;
            }
            const compressed = new File(
              [blob],
              file.name.replace(/\.[^.]+$/, ".webm"),
              {
                type: "video/webm",
                lastModified: Date.now(),
              },
            );
            finish(compressed);
          };

          recorder.start();
          video.currentTime = 0;
          video.play().catch(() => {
            recorder.stop();
          });

          const draw = () => {
            if (video.paused || video.ended) {
              if (recorder.state === "recording") recorder.stop();
              return;
            }
            ctx.drawImage(video, 0, 0, width, height);
            requestAnimationFrame(draw);
          };

          video.onplay = draw;
          video.onended = () => {
            if (recorder.state === "recording") recorder.stop();
          };

          setTimeout(() => {
            if (recorder.state === "recording") {
              video.pause();
              recorder.stop();
            }
          }, 60000);
        };

        video.onerror = () => finish(file);
        video.src = objectUrl;
      } catch {
        finish(file);
      }
    });
  };

  const compressAudioFile = async (
    file: File,
    mode: "audio" | "voice" = "audio",
  ): Promise<File> => {
    if (
      !file.type.startsWith("audio/") ||
      file.size < 1024 * 1024 ||
      typeof document === "undefined"
    ) {
      return file;
    }

    return new Promise((resolve) => {
      let settled = false;
      let objectUrl = "";
      let audioContext: AudioContext | null = null;

      const finish = (result: File) => {
        if (settled) return;
        settled = true;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        if (audioContext && audioContext.state !== "closed") {
          void audioContext.close().catch(() => undefined);
        }
        resolve(result);
      };

      try {
        const audio = document.createElement("audio");
        audio.preload = "metadata";
        audio.muted = true;

        objectUrl = URL.createObjectURL(file);

        audio.onloadedmetadata = async () => {
          try {
            const mimeType = MediaRecorder.isTypeSupported(
              "audio/webm;codecs=opus",
            )
              ? "audio/webm;codecs=opus"
              : MediaRecorder.isTypeSupported("audio/webm")
                ? "audio/webm"
                : "";

            if (!mimeType) {
              finish(file);
              return;
            }

            audioContext = new AudioContext();
            const source = audioContext.createMediaElementSource(audio);
            const destination = audioContext.createMediaStreamDestination();
            source.connect(destination);

            const recorder = new MediaRecorder(destination.stream, {
              mimeType,
              audioBitsPerSecond: mode === "voice" ? 24000 : 48000,
            });

            const chunks: Blob[] = [];
            recorder.ondataavailable = (event) => {
              if (event.data.size > 0) chunks.push(event.data);
            };

            recorder.onstop = () => {
              const recorderMimeType = recorder.mimeType || mimeType;
              const extension =
                recorderMimeType.includes("mp4") ||
                recorderMimeType.includes("m4a") ||
                recorderMimeType.includes("aac")
                  ? "m4a"
                  : recorderMimeType.includes("ogg") ||
                      recorderMimeType.includes("opus")
                    ? "ogg"
                    : recorderMimeType.includes("wav")
                      ? "wav"
                      : "webm";

              const blob = new Blob(chunks, { type: recorderMimeType });
              const compressed = new File(
                [blob],
                file.name.replace(/\.[^.]+$/, `.${extension}`),
                {
                  type: recorderMimeType,
                  lastModified: Date.now(),
                },
              );
              finish(compressed.size < file.size ? compressed : file);
            };

            recorder.start();
            audio.currentTime = 0;
            await audio.play();

            audio.onended = () => {
              if (recorder.state === "recording") recorder.stop();
            };

            const timeoutMs = Math.max(
              8000,
              Math.min(120000, Math.floor((audio.duration || 30) * 1200)),
            );
            setTimeout(() => {
              if (recorder.state === "recording") {
                audio.pause();
                recorder.stop();
              }
            }, timeoutMs);
          } catch {
            finish(file);
          }
        };

        audio.onerror = () => finish(file);
        audio.src = objectUrl;
      } catch {
        finish(file);
      }
    });
  };

  const uploadFileWithProgress = async (
    file: File,
    onProgress?: (progress: number) => void,
  ) => {
    return new Promise<any>((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "message");

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload");

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const progress = Math.round((event.loaded / event.total) * 100);
        onProgress?.(progress);
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error("Invalid upload response"));
          }
          return;
        }

        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.error || "Upload failed"));
        } catch {
          reject(new Error("Upload failed"));
        }
      };

      xhr.onerror = () => reject(new Error("Network upload error"));
      xhr.send(formData);
    });
  };

  const optimizeDocumentFile = async (file: File): Promise<File> => {
    const maxDocSize = 25 * 1024 * 1024; // 25MB
    if (file.size > maxDocSize) {
      throw new Error(
        "Document is too large. Please upload a file smaller than 25MB.",
      );
    }

    // Lightweight optimization for text-based documents
    const isTextLike =
      file.type === "text/plain" ||
      file.type === "text/csv" ||
      file.type === "application/json" ||
      file.type === "application/xml" ||
      file.type === "text/xml";

    if (isTextLike && file.size > 100 * 1024) {
      try {
        const text = await file.text();
        const normalized = text
          .replace(/\r\n/g, "\n")
          .replace(/[\t ]+\n/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim();

        if (normalized.length > 0 && normalized.length < text.length) {
          return new File([normalized], file.name, {
            type: file.type,
            lastModified: Date.now(),
          });
        }
      } catch {
        // Fallback to original file
      }
    }

    return file;
  };

  const sendAttachmentMessage = async (
    rawFile: File,
    messageType: "image" | "video" | "audio" | "voice" | "file",
    caption?: string,
    duration?: number,
    onProgress?: (progress: number) => void,
    replyToId = replyingToMessage?._id,
  ) => {
    if (!selectedConversation) return;

    setSending(true);

    try {
      let file = rawFile;

      if (messageType === "image" && rawFile.type.startsWith("image/")) {
        try {
          const compressed = await compressImage(rawFile, {
            maxWidth: 800,
            maxHeight: 800,
            quality: 0.7,
            format: "image/jpeg",
          });
          file = new File(
            [compressed.blob],
            rawFile.name.replace(/\.[^.]+$/, ".jpg"),
            {
              type: "image/jpeg",
              lastModified: Date.now(),
            },
          );
        } catch (compressionError) {
          // Some gallery images (e.g. iPhone HEIC/HEIF) can't be decoded by canvas.
          // Fall back to uploading the original file so the send still succeeds.
          console.warn(
            "Image compression failed, uploading original file:",
            compressionError,
          );
          file = rawFile;
        }
      }

      if (messageType === "video") {
        file = await compressVideoFile(rawFile);

        // Ensure large videos are compressed before upload
        if (rawFile.size > 1024 * 1024 && file === rawFile) {
          throw new Error(
            "Video compression failed. Please try a shorter/lower-quality video.",
          );
        }
      }

      if (messageType === "audio") {
        file = await compressAudioFile(rawFile, "audio");
      }

      if (messageType === "voice") {
        file = await compressAudioFile(rawFile, "voice");
      }

      if (messageType === "file") {
        file = await optimizeDocumentFile(rawFile);
      }

      const uploadData = await uploadFileWithProgress(file, onProgress);
      const uploadedUrl = uploadData?.url;
      const uploadedFileId =
        uploadData?.fileId || uploadData?.id || uploadData?.file?.fileId;

      if (!uploadedUrl) {
        throw new Error("Upload succeeded but file URL is missing");
      }

      const attachment: MessageAttachment = {
        url: uploadedUrl,
        fileId: uploadedFileId,
        filename: uploadData.filename || file.name,
        size: uploadData.size || file.size,
        mimeType: uploadData.type || file.type,
        thumbnail: uploadData.thumbnail || uploadData.thumbnailUrl,
        duration,
      };

      const mediaLabel =
        messageType === "image"
          ? "Photo"
          : messageType === "video"
            ? "Video"
            : messageType === "voice"
              ? "Voice message"
              : messageType === "audio"
                ? "Audio"
                : "File";

      const response = await fetch("/api/client/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId: selectedConversation._id,
          content: caption?.trim() || mediaLabel,
          type: messageType,
          attachments: [attachment],
          replyTo: replyToId,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send media message");
      }

      setShowAttachMenu(false);
      if (replyToId) {
        setReplyingToMessage((current) =>
          current?._id === replyToId ? null : current,
        );
      }
      setTimeout(() => scrollToBottom(false), 30);
      return true;
    } catch (error) {
      throw error;
    } finally {
      setSending(false);
    }
  };

  const setPreviewForFile = (file: File, type: "image" | "video" | "file") => {
    if (mediaPreview?.previewUrl) {
      URL.revokeObjectURL(mediaPreview.previewUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    setMediaPreview({
      file,
      type,
      previewUrl,
      caption: "",
    });
    setShowAttachMenu(false);
  };

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      setPreviewForFile(file, "image");
    } catch (error) {
      console.error("Error handling image upload:", error);
      toast.error("Failed to process image. Please try again.");
    }
  };

  const handleVideoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      setPreviewForFile(file, "video");
    } catch (error) {
      console.error("Error handling video upload:", error);
      toast.error("Failed to process video. Please try again.");
    }
  };

  const handleDocUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      setPreviewForFile(file, "file");
    } catch (error) {
      console.error("Error handling document upload:", error);
      toast.error("Failed to process document. Please try again.");
    }
  };

  const clearMediaPreview = () => {
    if (mediaPreview?.previewUrl) {
      URL.revokeObjectURL(mediaPreview.previewUrl);
    }
    setMediaPreview(null);
  };

  const confirmMediaSend = async () => {
    if (!mediaPreview) return;

    const replyToId = replyingToMessage?._id;

    setUploadingMedia({
      id: `upload-${Date.now()}`,
      file: mediaPreview.file,
      type: mediaPreview.type,
      previewUrl: mediaPreview.previewUrl,
      caption: mediaPreview.caption,
      progress: 0,
      error: null,
      replyToId,
    });

    setMediaPreview(null);

    try {
      await sendAttachmentMessage(
        mediaPreview.file,
        mediaPreview.type,
        mediaPreview.caption,
        undefined,
        (progress) => {
          setUploadingMedia((prev) => {
            if (!prev) return prev;
            return { ...prev, progress };
          });
        },
        replyToId,
      );

      setUploadingMedia((prev) => {
        if (!prev) return prev;
        if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return null;
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to send file";
      setUploadingMedia((prev) => {
        if (!prev) return prev;
        return { ...prev, error: message };
      });
      toast.error(message);
    }
  };

  const retryUploadingMedia = async () => {
    if (!uploadingMedia) return;
    setUploadingMedia((prev) =>
      prev ? { ...prev, progress: 0, error: null } : prev,
    );

    try {
      await sendAttachmentMessage(
        uploadingMedia.file,
        uploadingMedia.type,
        uploadingMedia.caption,
        undefined,
        (progress) => {
          setUploadingMedia((prev) => {
            if (!prev) return prev;
            return { ...prev, progress };
          });
        },
        uploadingMedia.replyToId,
      );

      setUploadingMedia((prev) => {
        if (!prev) return prev;
        if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return null;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Retry failed";
      setUploadingMedia((prev) => (prev ? { ...prev, error: message } : prev));
      toast.error(message);
    }
  };

  const startVoiceRecording = async (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (sending || isRecording || !selectedConversation) return;

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Use audio/webm for Chrome/Firefox, audio/mp4 for Safari
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });

      recordStreamRef.current = stream;
      recorderRef.current = recorder;
      recordChunksRef.current = [];
      recordStartedAtRef.current = Date.now();
      recordingReplyToIdRef.current = replyingToMessage?._id;
      setRecordingTime(0);
      setIsRecording(true);

      recorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) {
          recordChunksRef.current.push(evt.data);
        }
      };

      recorder.start();
      recordTimerRef.current = setInterval(() => {
        setRecordingTime(
          Math.floor((Date.now() - recordStartedAtRef.current) / 1000),
        );
      }, 250);
    } catch (error) {
      console.error("Voice recording start error:", error);
      toast.error("Microphone permission is required");
      setIsRecording(false);
    }
  };

  const stopVoiceRecording = async () => {
    if (!recorderRef.current) return;

    const recorder = recorderRef.current;
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }

    const duration = Math.max(
      1,
      Math.floor((Date.now() - recordStartedAtRef.current) / 1000),
    );

    await new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        // Use the actual MIME type from the recorder for the blob
        const actualMimeType = recorder.mimeType || "audio/webm";
        const voiceBlob = new Blob(recordChunksRef.current, {
          type: actualMimeType,
        });

        // Determine file extension based on MIME type
        const ext = detectAudioExtension(actualMimeType);
        const voiceFile = new File([voiceBlob], `voice_${Date.now()}.${ext}`, {
          type: actualMimeType,
        });

        if (recordStreamRef.current) {
          recordStreamRef.current.getTracks().forEach((track) => track.stop());
          recordStreamRef.current = null;
        }

        recorderRef.current = null;
        recordChunksRef.current = [];
        setIsRecording(false);
        setRecordingTime(0);

        try {
          await sendAttachmentMessage(
            voiceFile,
            "voice",
            "Voice message",
            duration,
            undefined,
            recordingReplyToIdRef.current,
          );
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Failed to send voice message",
          );
        }
        recordingReplyToIdRef.current = undefined;
        resolve();
      };

      if (recorder.state !== "inactive") {
        recorder.stop();
      } else {
        resolve();
      }
    });
  };

  // Format file size for display
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatMessageDate = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) return format(date, "h:mm a");
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMM d");
  };

  const formatMessageTime = (dateString: string) => {
    return format(new Date(dateString), "h:mm a");
  };

  // Format date for date separator (WhatsApp style)
  const formatDateSeparator = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMMM d, yyyy");
  };

  // Check if we should show date separator between two messages
  const shouldShowDateSeparator = (
    currentMsg: Message,
    prevMsg: Message | null,
  ) => {
    if (!prevMsg) return true; // Always show for first message
    const currentDate = new Date(currentMsg.createdAt);
    const prevDate = new Date(prevMsg.createdAt);
    return !isSameDay(currentDate, prevDate);
  };

  const getReplyPreviewText = (reply?: Message["replyTo"]) => {
    if (!reply) return "";

    if (reply.type === "image") return "Photo";
    if (reply.type === "video") return "Video";
    if (reply.type === "audio" || reply.type === "voice")
      return "Voice message";
    if (reply.type === "file")
      return reply.attachments?.[0]?.filename || "Document";

    return (reply.content || "").trim() || "Message";
  };

  const handleReplyToMessage = (message: Message) => {
    setReplyingToMessage(message);
    setShowAttachMenu(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleMessageTouchEnd = (message: Message) => {
    const now = Date.now();
    const previousTap = lastTappedMessageRef.current;

    if (
      previousTap?.id === message._id &&
      now - previousTap.at < 320
    ) {
      lastTappedMessageRef.current = null;
      handleReplyToMessage(message);
      return;
    }

    lastTappedMessageRef.current = { id: message._id, at: now };
  };

  const confirmDeleteMessage = (message: Message) => {
    setMessageToDelete(message);
    setDeleteDialogOpen(true);
  };

  const handleDeleteMessage = async () => {
    if (!messageToDelete || isDeleting) return;

    const messageId = messageToDelete._id;
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/client/messages/${messageId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete message");
      }

      setMessages((current) =>
        current.filter((message) => message._id !== messageId),
      );
      setReplyingToMessage((current) =>
        current?._id === messageId ? null : current,
      );
      fetchConversationsRef.current();
      toast.success("Message deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete message",
      );
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setMessageToDelete(null);
    }
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

  const toggleVoicePlayback = (messageId: string) => {
    const audio = audioRefs.current[messageId];
    if (!audio) {
      console.error("Audio element not found for message:", messageId);
      return;
    }

    // Pause all other audio elements first
    Object.entries(audioRefs.current).forEach(([id, element]) => {
      if (id !== messageId && element && !element.paused) {
        element.pause();
        element.currentTime = 0;
        setVoiceProgress((prev) => ({ ...prev, [id]: 0 }));
      }
    });

    if (voicePlayingId === messageId && !audio.paused) {
      audio.pause();
      setVoicePlayingId(null);
      return;
    }

    // Reset to beginning if ended
    if (audio.ended) {
      audio.currentTime = 0;
    }

    audio
      .play()
      .then(() => {
        setVoicePlayingId(messageId);
      })
      .catch((error) => {
        console.error("Audio playback error:", error);
        toast.error("Unable to play voice message");
        setVoicePlayingId(null);
      });
  };

  const formatVoiceDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  // Handle message deletion
  const getStatusIcon = (isRead: boolean, isOwn: boolean) => {
    if (!isOwn) return null;
    if (isRead) {
      return <Check className="h-3 w-3 opacity-70" />;
    }
    return <CheckCheck className="h-3 w-3 text-[#53BDEB]" />;
  };

  if (loading) {
    return (
      <div
        className={`fixed inset-0 flex items-center justify-center z-100 ${isDarkMode ? "bg-gray-950" : "bg-white"}`}
      >
        <SpoonGifLoader size="lg" />
      </div>
    );
  }

  return (
    <>
      <div
        className={`h-dvh md:h-screen overflow-hidden ${isDarkMode ? "bg-gray-950" : "bg-[#ECE5DD]"}`}
      >
        <div className="h-full md:h-[calc(100vh-120px)] flex flex-col md:flex-row md:gap-4 md:p-6 overflow-hidden">
          {/* Conversations List - Hidden on mobile when conversation selected */}
          <div
            className={`md:w-80 shrink-0 md:rounded-xl md:shadow-sm md:border ${
              isDarkMode
                ? "bg-gray-900 border-gray-800"
                : "bg-white border-gray-100"
            } ${selectedConversation ? "hidden md:block" : "block"}`}
          >
            {/* Header */}
            <div
              className={`p-4 border-b flex items-center gap-3 bg-[#075E54] md:rounded-t-xl ${
                isDarkMode
                  ? "md:bg-gray-900 border-gray-800"
                  : "md:bg-white border-gray-100"
              }`}
            >
              <Link href="/user" className="p-2 -ml-2 md:hidden">
                <ArrowLeft className="w-5 h-5 text-white md:text-gray-700" />
              </Link>
              <h2
                className={`font-bold text-lg text-white ${isDarkMode ? "md:text-white" : "md:text-[#075E54]"}`}
              >
                Messages
              </h2>
            </div>
            <div className="overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <div className="w-16 h-16 bg-[#075E54]/10 rounded-full flex items-center justify-center mb-4">
                    <User className="w-8 h-8 text-[#075E54]" />
                  </div>
                  <h3
                    className={`font-semibold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}
                  >
                    No dietitian assigned
                  </h3>
                  <p
                    className={`${isDarkMode ? "text-gray-300" : "text-gray-500"} text-sm text-center`}
                  >
                    You don't have a primary dietitian assigned yet. Please
                    contact support.
                  </p>
                </div>
              ) : (
                conversations.map((conv) => (
                  <button
                    key={conv._id}
                    onClick={() => {
                      userPressedBackRef.current = false;
                      setSelectedConversation(conv);
                    }}
                    className={`w-full flex items-center gap-3 p-4 transition-colors border-b ${
                      isDarkMode
                        ? "border-gray-800 hover:bg-gray-800"
                        : "border-gray-100 hover:bg-gray-50"
                    } ${
                      selectedConversation?._id === conv._id
                        ? "bg-[#075E54]/5"
                        : ""
                    }`}
                  >
                    <div className="relative">
                      <div className="h-12 w-12 rounded-full bg-[#075E54]/10 flex items-center justify-center overflow-hidden">
                        {conv.user.avatar ? (
                          <img
                            src={conv.user.avatar}
                            alt={conv.user.firstName}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User className="w-5 h-5 text-[#075E54]" />
                        )}
                      </div>
                      {conv.unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-5 w-5 bg-[#25D366] text-white text-xs font-semibold rounded-full flex items-center justify-center">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center justify-between">
                        <p
                          className={`font-medium truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}
                        >
                          {conv.user.firstName} {conv.user.lastName}
                        </p>
                        {conv.lastMessage && (
                          <span
                            className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                          >
                            {formatMessageDate(conv.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-sm truncate ${
                          conv.unreadCount > 0
                            ? isDarkMode
                              ? "text-white font-medium"
                              : "text-gray-900 font-medium"
                            : isDarkMode
                              ? "text-gray-300"
                              : "text-gray-500"
                        }`}
                      >
                        {conv.lastMessage?.type === "image"
                          ? "📷 Photo"
                          : conv.lastMessage?.type === "video"
                            ? "🎬 Video"
                            : conv.lastMessage?.type === "audio"
                              ? "🎵 Audio"
                              : conv.lastMessage?.type === "voice"
                                ? "🎤 Voice message"
                                : conv.lastMessage?.type === "file"
                                  ? "📄 Document"
                                  : conv.lastMessage?.content ||
                                    "Start a conversation"}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Chat Area */}
          <div
            className={`flex-1 flex flex-col min-h-0 md:rounded-xl md:shadow-sm md:border ${
              isDarkMode ? "border-gray-800" : "border-gray-100"
            } ${!selectedConversation ? "hidden md:flex" : "flex fixed inset-0 z-50 md:relative md:z-auto"}`}
          >
            {selectedConversation ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  height: "100dvh",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                {/* Chat Header - WhatsApp Style - Fixed at top */}
                <div
                  className={`flex items-center justify-between p-3 bg-[#075E54] text-white md:border-b md:rounded-t-xl shrink-0 ${
                    isDarkMode
                      ? "md:bg-gray-900 md:text-white md:border-gray-800"
                      : "md:bg-white md:text-gray-900 md:border-gray-100"
                  }`}
                  style={{ flexShrink: 0 }}
                >
                  <div className="flex items-center gap-3">
                    <button
                      className="p-2 -ml-2 md:hidden hover:bg-white/10 rounded-full"
                      onClick={() => {
                        userPressedBackRef.current = true;
                        setReplyingToMessage(null);
                        setSelectedConversation(null);
                      }}
                    >
                      <ArrowLeft className="w-5 h-5 text-white" />
                    </button>
                    <div className="h-10 w-10 rounded-full bg-white/20 md:bg-[#075E54]/10 flex items-center justify-center overflow-hidden">
                      {selectedConversation.user.avatar ? (
                        <img
                          src={selectedConversation.user.avatar}
                          alt={selectedConversation.user.firstName}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User className="w-5 h-5 text-white md:text-[#075E54]" />
                      )}
                    </div>
                    <div>
                      <p
                        className={`font-medium text-white ${isDarkMode ? "md:text-white" : "md:text-gray-900"}`}
                      >
                        {selectedConversation.user.firstName}{" "}
                        {selectedConversation.user.lastName}
                      </p>
                      <p className="text-xs text-white/80 md:text-[#25D366] capitalize">
                        {selectedConversation.user.role === "dietitian"
                          ? "Your Dietitian"
                          : selectedConversation.user.role}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Messages - WhatsApp Style - Scrollable area */}
                <div
                  ref={messagesContainerRef}
                  onScroll={handleMessagesScroll}
                  className="px-3 py-2 space-y-1"
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    backgroundColor: isDarkMode ? "#0B141A" : "#EFEAE2",
                    backgroundImage: isDarkMode
                      ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cdefs%3E%3Cpattern id='p' width='40' height='40' patternUnits='userSpaceOnUse'%3E%3Cpath d='M20 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM5 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM35 30a2 2 0 1 0 0 4 2 2 0 0 0 0-4z' fill='%23ffffff' opacity='.025'/%3E%3C/pattern%3E%3C/defs%3E%3Crect fill='url(%23p)' width='200' height='200'/%3E%3C/svg%3E")`
                      : `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cdefs%3E%3Cpattern id='p' width='40' height='40' patternUnits='userSpaceOnUse'%3E%3Cpath d='M20 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM5 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM35 30a2 2 0 1 0 0 4 2 2 0 0 0 0-4z' fill='%23000000' opacity='.03'/%3E%3C/pattern%3E%3C/defs%3E%3Crect fill='url(%23p)' width='200' height='200'/%3E%3C/svg%3E")`,
                    backgroundSize: "300px 300px",
                  }}
                >
                  {loadingMessages ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-12">
                      <div
                        className={`rounded-2xl p-6 shadow-sm ${isDarkMode ? "bg-gray-900/80" : "bg-white/80"}`}
                      >
                        <div className="w-16 h-16 bg-[#075E54]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Send className="w-8 h-8 text-[#075E54]" />
                        </div>
                        <h3
                          className={`font-semibold mb-1 text-center ${isDarkMode ? "text-white" : "text-gray-900"}`}
                        >
                          Start a conversation
                        </h3>
                        <p
                          className={`${isDarkMode ? "text-gray-300" : "text-gray-500"} text-sm text-center`}
                        >
                          Send a message to{" "}
                          {selectedConversation.user.firstName}
                        </p>
                      </div>
                    </div>
                  ) : (
                    messages.map((message, index) => {
                      // Convert both to strings for proper comparison (handles ObjectId vs string mismatch)
                      const isOwn =
                        String(message.sender?._id || "") ===
                        String(session?.user?.id || "");
                      const attachment = message.attachments?.[0];
                      const prevMessage =
                        index > 0 ? messages[index - 1] : null;
                      const showDateSeparator = shouldShowDateSeparator(
                        message,
                        prevMessage,
                      );

                      // Render message content based on type
                      const renderMessageContent = () => {
                        const mediaLabels = [
                          "Photo",
                          "Video",
                          "Audio",
                          "File",
                          "Voice message",
                          "File attachment",
                          "Image",
                        ];
                        const rawContent = (message.content || "").trim();
                        const contentLines = rawContent
                          .split(/\r?\n/)
                          .map((line) => line.trim())
                          .filter(Boolean);
                        const firstContentLine = contentLines[0] || "";
                        const url = getMediaUrl(attachment);
                        const resolvedUrl = resolveAttachmentUrl(
                          url,
                          message._id,
                        );
                        const mimeType = (
                          attachment?.mimeType || ""
                        ).toLowerCase();
                        const filename = (
                          attachment?.filename || ""
                        ).toLowerCase();
                        const lowerUrl = resolvedUrl.toLowerCase();
                        const hasValidUrl =
                          !!resolvedUrl &&
                          (/^https?:\/\//i.test(resolvedUrl) ||
                            /^blob:/i.test(resolvedUrl) ||
                            /^\/(?!\/)/.test(resolvedUrl));
                        const failed = failedAttachments.has(message._id);

                        // Check if URL is from ImageKit and appears to be an image
                        const isImageKitImage =
                          /ik\.imagekit\.io/i.test(lowerUrl) &&
                          (/\/(messages|complete-meal|meal-completions|progress|transformation|profile|recipes)\//i.test(
                            lowerUrl,
                          ) ||
                            /tr:[^/]*\.(jpg|jpeg|png|webp)/i.test(lowerUrl));

                        let resolvedType = message.type;
                        if (
                          attachment &&
                          (message.type === "text" || message.type === "file")
                        ) {
                          if (
                            mimeType.startsWith("image/") ||
                            /\.(jpg|jpeg|png|webp|gif|heic|heif)(\?|$)/i.test(
                              lowerUrl,
                            ) ||
                            isImageKitImage ||
                            /meal-completions?\//i.test(lowerUrl)
                          ) {
                            resolvedType = "image";
                          } else if (
                            mimeType.startsWith("video/") ||
                            /\.(mp4|mov|webm|mkv|avi)(\?|$)/i.test(lowerUrl)
                          ) {
                            resolvedType = "video";
                          } else if (
                            mimeType.startsWith("audio/") ||
                            /\.(mp3|wav|m4a|ogg)(\?|$)/i.test(lowerUrl)
                          ) {
                            resolvedType = "audio";
                          } else if (message.type !== "file") {
                            resolvedType = "file";
                          }
                        }

                        const isMealPicture =
                          /meal\s*(picture|photo|image)|meal\s*completion/i.test(
                            message.content || "",
                          ) ||
                          /meal[-_\s]*(picture|photo|image|completion)/i.test(
                            filename,
                          ) ||
                          /meal[-_\s]*(picture|photo|image|completion)/i.test(
                            lowerUrl,
                          ) ||
                          /meal-completions?\//i.test(lowerUrl);

                        const mealTypeText =
                          isMealPicture &&
                          /^meal\s*picture/i.test(firstContentLine)
                            ? firstContentLine
                                .replace(/^meal\s*picture\s*[:•\-]?\s*/i, "")
                                .trim()
                            : "";
                        const mealHeaderCaption = isMealPicture
                          ? `Meal Picture - ${mealTypeText || "Meal"}`
                          : "";
                        const mealNoteCaption =
                          isMealPicture &&
                          /^meal\s*picture/i.test(firstContentLine)
                            ? contentLines.slice(1).join("\n").trim()
                            : "";
                        const imageCaption = isMealPicture
                          ? [mealHeaderCaption, mealNoteCaption]
                              .filter(Boolean)
                              .join("\n")
                          : rawContent;
                        const hasCaption =
                          imageCaption &&
                          !mediaLabels.includes(imageCaption.trim());

                        if (attachment) {
                          switch (resolvedType) {
                            case "image":
                              if (!hasValidUrl || failed) {
                                return (
                                  <button
                                    type="button"
                                    onClick={() => retryAttachment(message._id)}
                                    className="w-55 h-40 rounded-lg flex flex-col items-center justify-center gap-2 text-xs opacity-70"
                                    style={{
                                      backgroundColor: isOwn
                                        ? "rgba(255,255,255,0.15)"
                                        : "rgba(0,0,0,0.08)",
                                    }}
                                  >
                                    <RotateCcw className="w-5 h-5" />
                                    <span>
                                      Image unavailable · Tap to retry
                                    </span>
                                  </button>
                                );
                              }
                              return (
                                <div className="relative">
                                  {isMealPicture && (
                                    <span className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#075E54]/90 text-white">
                                      Meal Picture
                                    </span>
                                  )}
                                  <img
                                    src={getMediaProxyUrl(resolvedUrl)}
                                    alt="Image attachment"
                                    className="rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                    onClick={() => openLightbox(resolvedUrl)}
                                    style={{
                                      maxWidth: "220px",
                                      maxHeight: "260px",
                                      objectFit: "cover",
                                    }}
                                    onError={() =>
                                      markAttachmentFailed(message._id)
                                    }
                                  />
                                  {hasCaption &&
                                    (isMealPicture ? (
                                      <div className="mt-1.5 leading-snug wrap-break-word whitespace-pre-line">
                                        <p className="text-[14px] font-semibold">
                                          {mealHeaderCaption}
                                        </p>
                                        {mealNoteCaption && (
                                          <p className="text-[14px]">
                                            {mealNoteCaption}
                                          </p>
                                        )}
                                      </div>
                                    ) : (
                                      <p className="text-[14px] mt-1.5 leading-snug wrap-break-word whitespace-pre-line">
                                        {imageCaption}
                                      </p>
                                    ))}
                                </div>
                              );
                            case "video":
                              if (!hasValidUrl || failed) {
                                return (
                                  <button
                                    type="button"
                                    onClick={() => retryAttachment(message._id)}
                                    className="w-55 h-40 rounded-lg flex flex-col items-center justify-center gap-2 text-xs opacity-70"
                                    style={{
                                      backgroundColor: isOwn
                                        ? "rgba(255,255,255,0.15)"
                                        : "rgba(0,0,0,0.08)",
                                    }}
                                  >
                                    <RotateCcw className="w-5 h-5" />
                                    <span>
                                      Video unavailable · Tap to retry
                                    </span>
                                  </button>
                                );
                              }
                              return (
                                <div className="relative">
                                  <video
                                    src={getMediaProxyUrl(resolvedUrl)}
                                    controls
                                    preload="metadata"
                                    playsInline
                                    poster={attachment.thumbnail ? getMediaProxyUrl(attachment.thumbnail) : undefined}
                                    className="rounded-lg bg-black"
                                    style={{
                                      maxWidth: "220px",
                                      maxHeight: "260px",
                                    }}
                                    onError={() =>
                                      markAttachmentFailed(message._id)
                                    }
                                  />
                                  <div className="mt-1 text-[11px] opacity-70">
                                    Video • {formatFileSize(attachment.size)}
                                  </div>
                                  {hasCaption && (
                                    <p className="text-[14px] mt-1.5 leading-snug wrap-break-word">
                                      {message.content}
                                    </p>
                                  )}
                                </div>
                              );
                            case "audio":
                            case "voice":
                              if (!hasValidUrl || failed) {
                                return (
                                  <button
                                    type="button"
                                    onClick={() => retryAttachment(message._id)}
                                    className="w-55 h-24 rounded-lg flex flex-col items-center justify-center gap-2 text-xs opacity-70"
                                    style={{
                                      backgroundColor: isOwn
                                        ? "rgba(255,255,255,0.15)"
                                        : "rgba(0,0,0,0.08)",
                                    }}
                                  >
                                    <RotateCcw className="w-5 h-5" />
                                    <span>
                                      Audio unavailable · Tap to retry
                                    </span>
                                  </button>
                                );
                              }
                              return (
                                <div className="flex items-center gap-3 min-w-50 max-w-65 py-1">
                                  <audio
                                    key={`${message._id}-${attachmentRetryTick[message._id] || 0}`}
                                    ref={(element) => {
                                      if (element)
                                        audioRefs.current[message._id] =
                                          element;
                                    }}
                                    src={getMediaProxyUrl(resolvedUrl)}
                                    preload="metadata"
                                    onTimeUpdate={(event) => {
                                      const audio = event.currentTarget;
                                      if (
                                        audio.duration &&
                                        isFinite(audio.duration)
                                      ) {
                                        setVoiceProgress((prev) => ({
                                          ...prev,
                                          [message._id]:
                                            (audio.currentTime /
                                              audio.duration) *
                                            100,
                                        }));
                                      }
                                    }}
                                    onLoadedMetadata={(event) => {
                                      const duration =
                                        event.currentTarget.duration;
                                      if (isFinite(duration) && duration > 0) {
                                        setVoiceDurations((prev) => ({
                                          ...prev,
                                          [message._id]: duration,
                                        }));
                                      }
                                    }}
                                    onEnded={() => {
                                      setVoicePlayingId(null);
                                      setVoiceProgress((prev) => ({
                                        ...prev,
                                        [message._id]: 0,
                                      }));
                                    }}
                                    onError={(e) => {
                                      const audioElement =
                                        e.currentTarget as HTMLAudioElement;
                                      const errorCode =
                                        audioElement?.error?.code;
                                      const errorMessage =
                                        audioElement?.error?.message ||
                                        "Unknown audio error";
                                      console.warn(
                                        `Audio load error for message ${message._id}:`,
                                        errorCode,
                                        errorMessage,
                                        resolvedUrl,
                                      );
                                      markAttachmentFailed(message._id);
                                    }}
                                    className="hidden"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleVoicePlayback(message._id)
                                    }
                                    className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center ${isOwn ? "bg-white/25 hover:bg-white/35" : "bg-[#00A884] hover:bg-[#00A884]/80"}`}
                                  >
                                    {voicePlayingId === message._id ? (
                                      <Pause className="w-4 h-4 text-white" />
                                    ) : (
                                      <Play className="w-4 h-4 text-white ml-0.5" />
                                    )}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    {/* Clickable seek bar */}
                                    <div
                                      className="h-2 rounded-full overflow-hidden cursor-pointer relative"
                                      style={{
                                        backgroundColor: isOwn
                                          ? "rgba(255,255,255,.28)"
                                          : "rgba(0,0,0,.15)",
                                      }}
                                      onClick={(e) => {
                                        const audio =
                                          audioRefs.current[message._id];
                                        if (!audio || !isFinite(audio.duration))
                                          return;
                                        const rect =
                                          e.currentTarget.getBoundingClientRect();
                                        const clickX = e.clientX - rect.left;
                                        const percent = clickX / rect.width;
                                        audio.currentTime =
                                          percent * audio.duration;
                                        setVoiceProgress((prev) => ({
                                          ...prev,
                                          [message._id]: percent * 100,
                                        }));
                                      }}
                                    >
                                      <div
                                        className="h-full rounded-full transition-all duration-100"
                                        style={{
                                          width: `${voiceProgress[message._id] || 0}%`,
                                          backgroundColor: isOwn
                                            ? "#fff"
                                            : "#00A884",
                                        }}
                                      />
                                    </div>
                                    <div className="flex justify-between mt-1">
                                      <span className="text-[10px] opacity-55">
                                        {voiceDurations[message._id]
                                          ? formatVoiceDuration(
                                              voiceDurations[message._id],
                                            )
                                          : attachment.duration
                                            ? formatVoiceDuration(
                                                attachment.duration,
                                              )
                                            : "0:00"}
                                      </span>
                                      <span className="text-[10px] opacity-55">
                                        {formatFileSize(attachment.size)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            case "file":
                              if (!hasValidUrl || failed) {
                                return (
                                  <button
                                    type="button"
                                    onClick={() => retryAttachment(message._id)}
                                    className="w-55 h-24 rounded-lg flex flex-col items-center justify-center gap-2 text-xs opacity-70"
                                    style={{
                                      backgroundColor: isOwn
                                        ? "rgba(255,255,255,0.15)"
                                        : "rgba(0,0,0,0.08)",
                                    }}
                                  >
                                    <RotateCcw className="w-5 h-5" />
                                    <span>
                                      Document unavailable · Tap to retry
                                    </span>
                                  </button>
                                );
                              }
                              const kind = getMediaKind(attachment.filename, attachment.mimeType, resolvedUrl);
                              const isViewableDoc = isViewableDocument(
                                attachment.filename,
                                attachment.mimeType,
                                resolvedUrl,
                              );
                              return (
                                <div className="max-w-65 sm:max-w-md lg:max-w-lg w-full">
                                  <div
                                    className={`rounded-2xl overflow-hidden cursor-pointer ${isOwn ? "bg-white/10" : isDarkMode ? "bg-white/5" : "bg-gray-100"}`}
                                    onClick={() => {
                                      if (isViewableDoc) {
                                        setDocumentViewer({ url: resolvedUrl, filename: attachment.filename || "Document", mimeType: attachment.mimeType || "" });
                                      } else {
                                        window.open(getMediaProxyUrl(resolvedUrl, { download: true, filename: attachment.filename || "Document" }), "_blank", "noopener,noreferrer");
                                      }
                                    }}
                                  >
                                    {/* File info row */}
                                    <div className="p-3 flex items-center gap-3">
                                      <div className="w-10 h-10 bg-blue-500/15 rounded-lg flex items-center justify-center shrink-0">
                                        <FileText className="w-5 h-5 text-blue-500" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">
                                          {attachment.filename || "Document"}
                                        </p>
                                        <p className="text-[10px] opacity-55">
                                          {formatFileSize(attachment.size)}
                                        </p>
                                      </div>
                                    </div>
                                    {/* Action button */}
                                    <button
                                      type="button"
                                      className={`w-full px-3 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 border-t border-white/10 ${isViewableDoc ? "text-blue-500" : "opacity-70"}`}
                                    >
                                      {isViewableDoc ? <><Eye className="w-4 h-4" /> View Document</> : <><Download className="w-4 h-4" /> Download File</>}
                                    </button>
                                  </div>
                                  {hasCaption && (
                                    <p className="text-[14px] mt-1.5 leading-snug wrap-break-word">
                                      {message.content}
                                    </p>
                                  )}
                                </div>
                              );
                            default:
                              return (
                                <p className="text-[14px] leading-relaxed whitespace-pre-wrap wrap-break-word">
                                  {message.content}
                                </p>
                              );
                          }
                        }
                        return (
                          <p className="text-[14px] leading-relaxed whitespace-pre-wrap wrap-break-word">
                            {message.content}
                          </p>
                        );
                      };

                      return (
                        <div
                          key={message._id}
                          ref={(element) => {
                            messageElementRefs.current[message._id] = element;
                          }}
                        >
                          {/* Date Separator - WhatsApp Style */}
                          {showDateSeparator && (
                            <div className="flex justify-center my-4 sticky top-2 z-10">
                              <div
                                className={`px-4 py-1.5 rounded-lg text-[12px] font-medium shadow-md ${
                                  isDarkMode
                                    ? "bg-[#1F2C34] text-[#8696A0] border border-[#2A3942]"
                                    : "bg-white text-[#54656F] shadow-[0_1px_3px_rgba(0,0,0,.12)]"
                                }`}
                              >
                                {formatDateSeparator(message.createdAt)}
                              </div>
                            </div>
                          )}

                          {/* Message Bubble */}
                          <div
                            className={`flex ${isOwn ? "justify-end" : "justify-start"} items-end gap-2 mb-1 group`}
                          >
                            {!isOwn && (
                              <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-[#075E54]/15 flex items-center justify-center">
                                {message.sender?.avatar ? (
                                  <img
                                    src={message.sender.avatar}
                                    alt={message.sender.firstName}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                  />
                                ) : (
                                  <User className="w-3.5 h-3.5 text-[#075E54]" />
                                )}
                              </div>
                            )}

                            {isOwn && (
                              <div className="order-1 flex shrink-0 items-center gap-1">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      className={`h-8 w-8 rounded-full border flex items-center justify-center active:scale-90 transition-colors ${
                                        isDarkMode
                                          ? "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-100"
                                      }`}
                                      aria-label="Message options"
                                      title="Message options"
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      className="cursor-pointer text-red-600 focus:text-red-600"
                                      onClick={() =>
                                        confirmDeleteMessage(message)
                                      }
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                <button
                                  type="button"
                                  onClick={() => handleReplyToMessage(message)}
                                  onTouchEnd={(event) =>
                                    event.stopPropagation()
                                  }
                                  className={`h-8 w-8 rounded-full border flex items-center justify-center active:scale-90 transition-colors ${
                                    isDarkMode
                                      ? "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-100"
                                  }`}
                                  title="Reply"
                                  aria-label="Reply to message"
                                >
                                  <CornerDownRight className="h-4 w-4" />
                                </button>
                              </div>
                            )}

                            <div
                              className={`max-w-[85%] sm:max-w-[75%] relative ${isOwn ? "order-2" : ""}`}
                            >
                              <div
                                className={`px-2.5 py-1.5 shadow-sm inline-block ${
                                  isOwn
                                    ? isDarkMode
                                      ? "bg-[#005C4B] text-white rounded-2xl rounded-tr-sm"
                                      : "bg-[#D9FDD3] text-gray-900 rounded-2xl rounded-tr-sm"
                                    : isDarkMode
                                      ? "bg-[#202C33] text-white rounded-2xl rounded-tl-sm"
                                      : "bg-white text-gray-900 rounded-2xl rounded-tl-sm"
                                } ${highlightedMessageId === message._id ? "ring-3 ring-yellow-300 ring-offset-2 ring-offset-transparent" : ""} transition-all duration-300`}
                                onDoubleClick={() =>
                                  handleReplyToMessage(message)
                                }
                                onTouchEnd={() =>
                                  handleMessageTouchEnd(message)
                                }
                              >
                                {message.replyTo && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      jumpToOriginalMessage(
                                        message.replyTo?._id,
                                      )
                                    }
                                    className={`mb-2 w-full rounded-lg border-l-3 px-2 py-1 text-left ${
                                      isOwn
                                        ? "bg-white/15 border-white/80"
                                        : isDarkMode
                                          ? "bg-black/20 border-[#00A884]"
                                          : "bg-gray-100 border-[#00A884]"
                                    }`}
                                  >
                                    <p
                                      className={`text-[11px] font-semibold ${isOwn ? "text-white/95" : "text-[#00A884]"}`}
                                    >
                                      {message.replyTo.sender?.firstName ||
                                        "Reply"}
                                    </p>
                                    <p
                                      className={`text-[12px] leading-snug truncate ${isOwn ? "text-white/90" : isDarkMode ? "text-gray-200" : "text-gray-700"}`}
                                    >
                                      {getReplyPreviewText(message.replyTo)}
                                    </p>
                                  </button>
                                )}

                                {renderMessageContent()}
                                <div className="flex items-center justify-end gap-1 mt-0.5">
                                  <span className="text-[10px] opacity-55">
                                    {formatMessageTime(message.createdAt)}
                                  </span>
                                  {getStatusIcon(message.isRead, isOwn)}
                                </div>
                              </div>
                            </div>

                            {!isOwn && (
                              <button
                                type="button"
                                onClick={() => handleReplyToMessage(message)}
                                onTouchEnd={(event) => event.stopPropagation()}
                                className={`shrink-0 h-8 w-8 rounded-full border flex items-center justify-center active:scale-90 transition-colors ${
                                  isDarkMode
                                    ? "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                                    : "bg-white border-gray-200 text-gray-600 hover:bg-gray-100"
                                }`}
                                title="Reply"
                                aria-label="Reply to message"
                              >
                                <CornerDownRight className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}

                  {uploadingMedia && (
                    <div className="flex justify-end mb-1">
                      <div
                        className={`px-2.5 py-1.5 shadow-sm inline-block rounded-2xl rounded-tr-sm ${isDarkMode ? "bg-[#005C4B] text-white" : "bg-[#D9FDD3] text-gray-900"} max-w-[85%] sm:max-w-[75%]`}
                      >
                        <div className="rounded-lg overflow-hidden bg-black/5 min-w-45 max-w-55">
                          {uploadingMedia.type === "image" && (
                            <img
                              src={uploadingMedia.previewUrl}
                              alt="Uploading"
                              className="w-full h-40 object-cover"
                            />
                          )}
                          {uploadingMedia.type === "video" && (
                            <div className="w-full h-40 bg-black/60 flex items-center justify-center">
                              <Play className="w-7 h-7 text-white" />
                            </div>
                          )}
                          {uploadingMedia.type === "file" && (
                            <div className="p-3 flex items-center gap-3">
                              <FileText className="w-7 h-7 text-blue-500" />
                              <div className="min-w-0">
                                <p className="text-sm truncate">
                                  {uploadingMedia.file.name}
                                </p>
                                <p className="text-[10px] opacity-60">
                                  {formatFileSize(uploadingMedia.file.size)}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        {!uploadingMedia.error ? (
                          <div className="mt-2">
                            <div className="h-1.5 rounded-full bg-white/30 overflow-hidden">
                              <div
                                className="h-full bg-[#00A884] transition-all"
                                style={{ width: `${uploadingMedia.progress}%` }}
                              />
                            </div>
                            <p className="text-[11px] mt-1 opacity-80">
                              Uploading... {uploadingMedia.progress}%
                            </p>
                          </div>
                        ) : (
                          <div className="mt-2">
                            <p className="text-[11px] text-red-200">
                              {uploadingMedia.error}
                            </p>
                            <button
                              type="button"
                              onClick={retryUploadingMedia}
                              className="mt-1 text-[11px] px-2 py-1 rounded bg-red-500/80 text-white"
                            >
                              Retry
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Floating scroll-to-latest button */}
                {showScrollToBottom && (
                  <button
                    type="button"
                    onClick={() => {
                      scrollToBottom(false);
                      setShowScrollToBottom(false);
                    }}
                    aria-label="Scroll to latest message"
                    className="absolute right-4 bottom-24 z-60 h-10 w-10 rounded-full bg-[#075E54] text-white shadow-lg flex items-center justify-center transition-transform active:scale-95 hover:bg-[#0a6e62] md:bottom-28"
                  >
                    <ChevronDown className="h-5 w-5" />
                  </button>
                )}

                <div
                  className="border-t"
                  style={{
                    flexShrink: 0,
                    position: "sticky",
                    bottom: 0,
                    zIndex: 50,
                    background: "#f0f0f0",
                    padding: "8px 12px",
                    paddingBottom: "max(8px, env(safe-area-inset-bottom))",
                  }}
                >
                  <div className="relative" ref={attachMenuRef}>
                    {showAttachMenu && (
                      <div
                        className="fixed inset-0 z-90 bg-black/35"
                        onClick={() => setShowAttachMenu(false)}
                      />
                    )}

                    {showAttachMenu && (
                      <div className="absolute bottom-16 left-0 z-100 w-64 bg-white rounded-2xl shadow-xl border border-gray-200 p-3">
                        <div className="grid grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            className="h-20 rounded-xl border border-gray-200 hover:bg-gray-100 active:scale-95 transition-all flex flex-col items-center justify-center gap-1.5"
                            onClick={() => {
                              try {
                                if (docRef.current) {
                                  docRef.current.click();
                                }
                              } catch (error) {
                                console.error(
                                  "Error opening document picker:",
                                  error,
                                );
                                toast.error("Unable to open file picker");
                              }
                            }}
                          >
                            <FileIcon className="h-5 w-5 text-[#075E54]" />
                            <span className="text-xs text-gray-700">
                              Document
                            </span>
                          </button>
                          <button
                            type="button"
                            className="h-20 rounded-xl border border-gray-200 hover:bg-gray-100 active:scale-95 transition-all flex flex-col items-center justify-center gap-1.5"
                            onClick={() => {
                              try {
                                if (imageRef.current) {
                                  imageRef.current.click();
                                }
                              } catch (error) {
                                console.error(
                                  "Error opening image picker:",
                                  error,
                                );
                                toast.error("Unable to open file picker");
                              }
                            }}
                          >
                            <ImageIcon className="h-5 w-5 text-[#075E54]" />
                            <span className="text-xs text-gray-700">
                              Image
                            </span>
                          </button>
                          <button
                            type="button"
                            className="h-20 rounded-xl border border-gray-200 hover:bg-gray-100 active:scale-95 transition-all flex flex-col items-center justify-center gap-1.5"
                            onClick={() => {
                              try {
                                if (videoRef.current) {
                                  videoRef.current.click();
                                }
                              } catch (error) {
                                console.error(
                                  "Error opening video picker:",
                                  error,
                                );
                                toast.error("Unable to open file picker");
                              }
                            }}
                          >
                            <Video className="h-5 w-5 text-[#075E54]" />
                            <span className="text-xs text-gray-700">
                              Video
                            </span>
                          </button>
                          <button
                            type="button"
                            className="h-20 rounded-xl border border-gray-200 hover:bg-gray-100 active:scale-95 transition-all flex flex-col items-center justify-center gap-1.5"
                            onClick={() => {
                              try {
                                if (cameraRef.current) {
                                  cameraRef.current.click();
                                }
                              } catch (error) {
                                console.error("Error opening camera:", error);
                                toast.error("Unable to open camera");
                              }
                            }}
                          >
                            <Camera className="h-5 w-5 text-[#075E54]" />
                            <span className="text-xs text-gray-700">
                              Camera
                            </span>
                          </button>
                        </div>
                      </div>
                    )}

                    {replyingToMessage && (
                      <div
                        className={`mb-2 flex items-center gap-3 rounded-xl border-l-4 border-[#00A884] px-3 py-2 shadow-sm ${
                          isDarkMode
                            ? "bg-[#202C33] text-white"
                            : "bg-white text-gray-900"
                        }`}
                        role="status"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-[#00A884]">
                            {replyingToMessage.sender._id === session?.user?.id
                              ? "You"
                              : `${replyingToMessage.sender.firstName} ${replyingToMessage.sender.lastName}`.trim()}
                          </p>
                          <p
                            className={`truncate text-xs ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
                          >
                            {getReplyPreviewText(replyingToMessage)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReplyingToMessage(null)}
                          className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center ${isDarkMode ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                          aria-label="Cancel reply"
                          title="Cancel reply"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}

                    <div className="flex items-end gap-2">
                      <button
                        type="button"
                        className="h-10 w-10 shrink-0 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100"
                        onClick={() => setShowAttachMenu((prev) => !prev)}
                        disabled={sending || isRecording}
                      >
                        <Paperclip className="h-5 w-5 text-gray-600" />
                      </button>

                      <div className="flex-1 rounded-full bg-white border border-gray-200 px-4 py-2 min-h-10 flex items-center">
                        {isRecording ? (
                          <div className="w-full flex items-center justify-between text-sm text-gray-700">
                            <span>
                              Recording... {formatVoiceDuration(recordingTime)}
                            </span>
                            <span className="text-xs text-gray-500">
                              Release to send
                            </span>
                          </div>
                        ) : (
                          <textarea
                            ref={inputRef}
                            value={newMessage}
                            onChange={(event) =>
                              handleMessageInput(event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                handleSendMessage();
                              }
                            }}
                            placeholder="Type a message..."
                            rows={1}
                            className="w-full resize-none bg-transparent border-0 outline-none text-[15px] leading-5 max-h-30"
                            disabled={sending}
                          />
                        )}
                      </div>

                      {newMessage.trim() ? (
                        <button
                          type="button"
                          className="h-10 w-10 shrink-0 rounded-full bg-[#075E54] text-white flex items-center justify-center hover:bg-[#064e47] disabled:opacity-60"
                          onClick={handleSendMessage}
                          disabled={sending}
                        >
                          <Send className="h-5 w-5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="h-10 w-10 shrink-0 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100 disabled:opacity-60"
                          onPointerDown={startVoiceRecording}
                          onPointerUp={() => {
                            void stopVoiceRecording();
                          }}
                          onPointerCancel={() => {
                            void stopVoiceRecording();
                          }}
                          disabled={sending}
                        >
                          <Mic className="h-5 w-5 text-gray-600" />
                        </button>
                      )}
                    </div>

                    <input
                      ref={imageRef}
                      type="file"
                      accept="image/*,.heic,.heif,.jpg,.jpeg,.png,.webp,.gif"
                      hidden
                      onChange={handleImageUpload}
                    />
                    <input
                      ref={videoRef}
                      type="file"
                      accept="video/*"
                      hidden
                      onChange={handleVideoUpload}
                    />
                    <input
                      ref={docRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.ppt,.pptx"
                      hidden
                      onChange={handleDocUpload}
                    />
                    <input
                      ref={cameraRef}
                      type="file"
                      accept="image/*,.heic,.heif"
                      capture="environment"
                      hidden
                      onChange={handleImageUpload}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div
                className={`flex-1 flex items-center justify-center ${isDarkMode ? "bg-gray-950" : "bg-[#ECE5DD]"}`}
              >
                <div
                  className={`text-center rounded-2xl p-8 shadow-sm ${isDarkMode ? "bg-gray-900/80" : "bg-white/80"}`}
                >
                  <div className="w-16 h-16 bg-[#075E54]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Send className="w-8 h-8 text-[#075E54]" />
                  </div>
                  <h3
                    className={`font-semibold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
                  >
                    Select a conversation
                  </h3>
                  <p
                    className={`${isDarkMode ? "text-gray-300" : "text-gray-500"} text-sm`}
                  >
                    Choose a conversation from the list to start chatting
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {mediaPreview && (
        <div
          className="fixed inset-0 z-200 bg-black/70 flex items-center justify-center p-4"
          onClick={clearMediaPreview}
        >
          <div
            className="relative w-[92vw] max-w-md max-h-[85vh] rounded-2xl bg-white overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center"
              onClick={clearMediaPreview}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="h-[52vh] max-h-[52vh] bg-gray-100 flex items-center justify-center">
              {mediaPreview.type === "image" && (
                <img
                  src={mediaPreview.previewUrl}
                  alt="Preview"
                  className="max-w-full max-h-full object-contain"
                />
              )}

              {mediaPreview.type === "video" && (
                <div className="relative w-full h-full flex items-center justify-center bg-black/70">
                  <video
                    src={mediaPreview.previewUrl}
                    className="max-w-full max-h-full object-contain"
                    muted
                    playsInline
                    preload="metadata"
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="h-12 w-12 rounded-full bg-black/60 flex items-center justify-center">
                      <Play className="w-6 h-6 text-white ml-0.5" />
                    </div>
                  </div>
                </div>
              )}

              {mediaPreview.type === "file" && (
                <div className="p-6 text-center">
                  <FileText className="w-12 h-12 text-[#075E54] mx-auto mb-3" />
                  <p className="text-sm font-medium break-all">
                    {mediaPreview.file.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatFileSize(mediaPreview.file.size)}
                  </p>
                </div>
              )}
            </div>

            <div className="p-3 border-t bg-white">
              <textarea
                value={mediaPreview.caption}
                onChange={(event) =>
                  setMediaPreview((prev) =>
                    prev ? { ...prev, caption: event.target.value } : prev,
                  )
                }
                placeholder="Add a caption (optional)"
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none outline-none"
              />

              <div className="flex justify-end mt-3">
                <button
                  type="button"
                  onClick={confirmMediaSend}
                  disabled={sending}
                  className="h-10 px-4 rounded-full bg-[#075E54] hover:bg-[#064e47] text-white text-sm disabled:opacity-60"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {videoPlayerOpen && (
        <div
          className="fixed inset-0 z-90 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setVideoPlayerOpen(false)}
        >
          <div
            className="w-full max-w-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <video
              src={videoPlayerUrl}
              controls
              autoPlay
              playsInline
              className="w-full rounded-xl bg-black"
            />
          </div>
        </div>
      )}

      {/* Image Lightbox */}
      <ImageLightbox
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        src={lightboxImage}
        alt="Message attachment"
      />

      <DocumentViewerModal
        isOpen={Boolean(documentViewer)}
        onClose={() => setDocumentViewer(null)}
        url={documentViewer?.url || ""}
        filename={documentViewer?.filename || "Document"}
        mimeType={documentViewer?.mimeType || ""}
      />

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open && !isDeleting) setMessageToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete message?</AlertDialogTitle>
            <AlertDialogDescription>
              This message will be permanently deleted for everyone. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteMessage();
              }}
              disabled={isDeleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
