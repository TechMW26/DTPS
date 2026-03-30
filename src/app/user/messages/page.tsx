'use client';

import { useEffect, useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageTransition from '@/components/animations/PageTransition';
import { useTheme } from '@/contexts/ThemeContext';
import { useUnreadCountsSafe } from '@/contexts/UnreadCountContext';
import { useRealtime } from '@/hooks/useRealtime';
import { ResponsiveLayout } from '@/components/client/layouts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MediaUploadModal } from '@/components/chat/MediaUploadModal';
import { VoiceRecorder } from '@/components/chat/VoiceRecorder';
import ImageLightbox from '@/components/ui/image-lightbox';
import {
  Send,
  Paperclip,
  Image as ImageIcon,
  Check,
  CheckCheck,
  Clock,
  ArrowLeft,
  User,
  Loader2,
  Mic,
  FileText,
  Download,
  Trash2,
  MoreVertical,
  X
} from 'lucide-react';
import { format, isToday, isYesterday, isSameDay, parseISO } from 'date-fns';
import { toast } from 'sonner';
import SpoonGifLoader from '@/components/ui/SpoonGifLoader';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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
  type: 'text' | 'image' | 'video' | 'audio' | 'voice' | 'file';
  attachments?: MessageAttachment[];
  isRead: boolean;
  createdAt: string;
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

export default function UserMessagesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const { refreshCounts } = useUnreadCountsSafe();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasDietitian, setHasDietitian] = useState(true);
  const [showMediaUpload, setShowMediaUpload] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isInitialLoadRef = useRef(false);
  const userPressedBackRef = useRef(false);

  const openLightbox = (url: string) => {
    setLightboxImage(url);
    setLightboxOpen(true);
  };

  // Refs for SSE callbacks to avoid stale closures
  const selectedConversationRef = useRef<Conversation | null>(null);
  const fetchConversationsRef = useRef<() => void>(() => { });
  const scrollToBottomRef = useRef<(instant?: boolean) => void>(() => { });
  const isFetchingConversationsRef = useRef(false);
  const lastFetchTimeRef = useRef(0);

  // Real-time SSE connection for instant messaging
  useRealtime({
    onMessage: (evt) => {
      try {
        if (evt.type === 'new_message') {
          const incoming = (evt.data as any)?.message;
          const conversationWith = (evt.data as any)?.conversationWith;
          if (incoming?._id) {
            const currentConv = selectedConversationRef.current;
            // If this belongs to the currently open conversation, append it
            if (
              currentConv &&
              (incoming.sender?._id === currentConv._id || incoming.receiver?._id === currentConv._id)
            ) {
              setMessages(prev => (prev.some(m => m._id === incoming._id) ? prev : [...prev, incoming]));
              // Smooth scroll for new messages
              setTimeout(() => scrollToBottomRef.current(false), 50);
            }

            // Update ONLY the specific conversation in the list (not a full refetch)
            if (conversationWith) {
              setConversations(prev => {
                const idx = prev.findIndex(c => c._id === conversationWith);
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
                    type: incoming.type || 'text',
                    createdAt: incoming.createdAt,
                    isRead: currentConv?._id === conversationWith ? true : false
                  },
                  unreadCount: currentConv?._id === conversationWith
                    ? updated[idx].unreadCount
                    : updated[idx].unreadCount + 1
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
        if (evt.type === 'message_deleted') {
          const deletedMessageId = (evt.data as any)?.messageId;
          if (deletedMessageId) {
            // Remove the deleted message from local state
            setMessages(prev => prev.filter(m => m._id !== deletedMessageId));
            // Refresh conversations to update last message if needed
            const now = Date.now();
            if (now - lastFetchTimeRef.current > 1000) {
              lastFetchTimeRef.current = now;
              fetchConversationsRef.current();
            }
          }
        }
      } catch (e) {
        console.error('Failed handling realtime message event', e);
      }
    }
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
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetchConversations();
    }
  }, [session]);

  // Auto-select conversation if there's only one (the assigned dietitian)
  // But don't re-select if user manually pressed back
  useEffect(() => {
    if (conversations.length === 1 && !selectedConversation && !userPressedBackRef.current) {
      setSelectedConversation(conversations[0]);
    }
  }, [conversations, selectedConversation]);

  useEffect(() => {
    if (selectedConversation) {
      // Flag that we're doing an initial load (so scroll goes instant)
      isInitialLoadRef.current = true;
      // Clear previous messages first for a clean slate
      setMessages([]);
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
      const response = await fetch('/api/client/messages/conversations');
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
      const response = await fetch('/api/client/messages/conversations');
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
        setHasDietitian(data.hasDietitian !== false);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
      isFetchingConversationsRef.current = false;
    }
  };

  const fetchMessages = async (userId: string, showLoader = true) => {
    try {
      if (showLoader) setLoadingMessages(true);

      // Fetch ALL messages in one call - no limit
      const response = await fetch(`/api/client/messages?conversationWith=${userId}`);
      if (!response.ok) {
        console.error('Failed to fetch messages');
        return;
      }

      const data = await response.json();
      const allMessages: Message[] = data.messages || [];

      // Messages are already sorted by createdAt from API (oldest first)
      // Set messages AND stop loading in same tick so messages render immediately
      setMessages(allMessages);
      setLoadingMessages(false);

      // Now schedule scrolls AFTER the messages have actually rendered
      // Using nested rAF ensures we scroll after React commits the DOM update
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container = messagesContainerRef.current;
          if (container) {
            container.scrollTop = container.scrollHeight;
          }
          // Additional delayed scroll to catch images/media that load late
          setTimeout(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
            }
            isInitialLoadRef.current = false;
          }, 400);
        });
      });

      // Refresh unread counts in background (don't await - don't block rendering)
      refreshCounts().catch(() => { });
    } catch (error) {
      console.error('Error fetching messages:', error);
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
            behavior: 'smooth'
          });
        }
      }
    });
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation || sending) return;

    const messageContent = newMessage.trim();
    setSending(true);
    setNewMessage(''); // Optimistic clear

    try {
      const response = await fetch('/api/client/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: selectedConversation._id,
          content: messageContent,
          type: 'text'
        })
      });

      if (response.ok) {
        // Message will appear via real-time SSE event
        inputRef.current?.focus();
        // Debounced refresh via SSE handler
      } else {
        // Restore message on failure and show error from API
        setNewMessage(messageContent);
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.error || 'Failed to send message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setNewMessage(messageContent);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  // Handle media upload (images, videos, files)
  const handleMediaUpload = async (file: File, caption?: string) => {
    if (!selectedConversation) return;

    try {
      setSending(true);

      // Upload file to server
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'message');

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to upload file');
      }

      const uploadData = await uploadResponse.json();

      // Determine message type based on file type
      let messageType: 'text' | 'image' | 'file' | 'video' | 'audio' = 'file';
      if (file.type.startsWith('image/')) messageType = 'image';
      else if (file.type.startsWith('video/')) messageType = 'video';
      else if (file.type.startsWith('audio/')) messageType = 'audio';

      // Create attachment data
      const attachment = {
        url: uploadData.url,
        filename: uploadData.filename || file.name,
        size: uploadData.size || file.size,
        mimeType: uploadData.type || file.type,
      };

      // Build a fallback content label for media messages (in case the API requires it)
      const mediaLabel = messageType === 'image' ? '📷 Photo'
        : messageType === 'video' ? '🎬 Video'
          : messageType === 'audio' ? '🎵 Audio'
            : '📎 File';

      // Send message with attachment
      const response = await fetch('/api/client/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: selectedConversation._id,
          content: caption?.trim() || mediaLabel,
          type: messageType,
          attachments: [attachment]
        })
      });

      if (response.ok) {
        setShowMediaUpload(false);
        // SSE will handle refresh
      } else {
        toast.error('Failed to send media');
      }
    } catch (error) {
      console.error('Error uploading media:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload media');
      throw error;
    } finally {
      setSending(false);
    }
  };

  // Handle voice recording
  const handleVoiceRecording = async (audioBlob: Blob) => {
    if (!selectedConversation) return;

    try {
      setSending(true);

      // Determine file extension based on blob type
      const mimeType = audioBlob.type || 'audio/webm';
      let extension = 'webm';
      if (mimeType.includes('mp4') || mimeType.includes('m4a')) extension = 'm4a';
      else if (mimeType.includes('ogg')) extension = 'ogg';
      else if (mimeType.includes('wav')) extension = 'wav';

      // Convert blob to file with proper extension
      const audioFile = new File([audioBlob], `voice_${Date.now()}.${extension}`, {
        type: mimeType
      });

      // Upload audio file
      const formData = new FormData();
      formData.append('file', audioFile);
      formData.append('type', 'message');

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to upload voice message');
      }

      const uploadData = await uploadResponse.json();

      // Create attachment data
      const attachment = {
        url: uploadData.url,
        filename: uploadData.filename || audioFile.name,
        size: uploadData.size || audioFile.size,
        mimeType: uploadData.type || audioFile.type,
        duration: Math.max(1, Math.floor(audioBlob.size / 8000)) // Rough estimate
      };

      // Send voice message
      const response = await fetch('/api/client/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: selectedConversation._id,
          content: 'Voice message',
          type: 'voice',
          attachments: [attachment]
        })
      });

      if (response.ok) {
        setShowVoiceRecorder(false);
        // SSE will handle refresh
      } else {
        throw new Error('Failed to send voice message');
      }
    } catch (error) {
      console.error('Error uploading voice message:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to send voice message');
      throw error; // Re-throw so VoiceRecorder can handle the error state
    } finally {
      setSending(false);
    }
  };

  // Format file size for display
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatMessageDate = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) return format(date, 'h:mm a');
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMM d');
  };

  const formatMessageTime = (dateString: string) => {
    return format(new Date(dateString), 'h:mm a');
  };

  // Format date for date separator (WhatsApp style)
  const formatDateSeparator = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMMM d, yyyy');
  };

  // Check if we should show date separator between two messages
  const shouldShowDateSeparator = (currentMsg: Message, prevMsg: Message | null) => {
    if (!prevMsg) return true; // Always show for first message
    const currentDate = new Date(currentMsg.createdAt);
    const prevDate = new Date(prevMsg.createdAt);
    return !isSameDay(currentDate, prevDate);
  };

  // Handle message deletion
  const handleDeleteMessage = async () => {
    if (!messageToDelete || isDeleting) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/client/messages/${messageToDelete._id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Remove message from local state immediately
        setMessages(prev => prev.filter(m => m._id !== messageToDelete._id));
        toast.success('Message deleted');
        // Refresh conversations to update last message if needed
        fetchConversationsQuiet();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to delete message');
      }
    } catch (error) {
      console.error('Error deleting message:', error);
      toast.error('Failed to delete message');
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

  const getStatusIcon = (isRead: boolean, isOwn: boolean) => {
    if (!isOwn) return null;
    if (isRead) {
      return <CheckCheck className="h-3 w-3 text-green-500" />;
    }
    return <Check className="h-3 w-3 text-gray-400" />;
  };

  if (loading) {
    return (
      <div className={`fixed inset-0 flex items-center justify-center z-100 ${isDarkMode ? 'bg-gray-950' : 'bg-white'}`}>
        <SpoonGifLoader size="lg" />
      </div>
    );
  }

  return (
    <PageTransition>
      <div className={`min-h-screen ${isDarkMode ? 'bg-gray-950' : 'bg-[#ECE5DD]'}`}>
        <div className="h-screen md:h-[calc(100vh-120px)] flex flex-col md:flex-row md:gap-4 md:p-6">
          {/* Conversations List - Hidden on mobile when conversation selected */}
          <div
            className={`md:w-80 shrink-0 md:rounded-xl md:shadow-sm md:border ${isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
              } ${selectedConversation ? 'hidden md:block' : 'block'}`}
          >
            {/* Header */}
            <div
              className={`p-4 border-b flex items-center gap-3 bg-[#075E54] md:rounded-t-xl ${isDarkMode ? 'md:bg-gray-900 border-gray-800' : 'md:bg-white border-gray-100'
                }`}
            >
              <Link href="/user" className="p-2 -ml-2 md:hidden">
                <ArrowLeft className="w-5 h-5 text-white md:text-gray-700" />
              </Link>
              <h2 className={`font-bold text-lg text-white ${isDarkMode ? 'md:text-white' : 'md:text-[#075E54]'}`}>Messages</h2>
            </div>
            <div className="overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <div className="w-16 h-16 bg-[#075E54]/10 rounded-full flex items-center justify-center mb-4">
                    <User className="w-8 h-8 text-[#075E54]" />
                  </div>
                  <h3 className={`font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>No dietitian assigned</h3>
                  <p className={`${isDarkMode ? 'text-gray-300' : 'text-gray-500'} text-sm text-center`}>
                    You don't have a primary dietitian assigned yet. Please contact support.
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
                    className={`w-full flex items-center gap-3 p-4 transition-colors border-b ${isDarkMode ? 'border-gray-800 hover:bg-gray-800' : 'border-gray-100 hover:bg-gray-50'
                      } ${selectedConversation?._id === conv._id ? 'bg-[#075E54]/5' : ''
                      }`}
                  >
                    <div className="relative">
                      <div className="h-12 w-12 rounded-full bg-[#075E54]/10 flex items-center justify-center overflow-hidden">
                        {conv.user.avatar ? (
                          <img src={conv.user.avatar} alt={conv.user.firstName} loading="lazy" className="w-full h-full object-cover" />
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
                        <p className={`font-medium truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {conv.user.firstName} {conv.user.lastName}
                        </p>
                        {conv.lastMessage && (
                          <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            {formatMessageDate(conv.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-sm truncate ${conv.unreadCount > 0
                          ? isDarkMode
                            ? 'text-white font-medium'
                            : 'text-gray-900 font-medium'
                          : isDarkMode
                            ? 'text-gray-300'
                            : 'text-gray-500'
                          }`}
                      >
                        {conv.lastMessage?.content || 'Start a conversation'}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Chat Area */}
          <div
            className={`flex-1 flex flex-col md:rounded-xl md:shadow-sm md:border ${isDarkMode ? 'border-gray-800' : 'border-gray-100'
              } ${!selectedConversation ? 'hidden md:flex' : 'flex fixed inset-0 z-50 md:relative md:z-auto'}`}
          >
            {selectedConversation ? (
              <div className="flex flex-col h-dvh md:h-full">
                {/* Chat Header - WhatsApp Style - Fixed at top */}
                <div
                  className={`flex items-center justify-between p-3 bg-[#075E54] text-white md:border-b md:rounded-t-xl shrink-0 ${isDarkMode ? 'md:bg-gray-900 md:text-white md:border-gray-800' : 'md:bg-white md:text-gray-900 md:border-gray-100'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      className="p-2 -ml-2 md:hidden hover:bg-white/10 rounded-full"
                      onClick={() => {
                        userPressedBackRef.current = true;
                        setSelectedConversation(null);
                      }}
                    >
                      <ArrowLeft className="w-5 h-5 text-white" />
                    </button>
                    <div className="h-10 w-10 rounded-full bg-white/20 md:bg-[#075E54]/10 flex items-center justify-center overflow-hidden">
                      {selectedConversation.user.avatar ? (
                        <img src={selectedConversation.user.avatar} alt={selectedConversation.user.firstName} loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-5 h-5 text-white md:text-[#075E54]" />
                      )}
                    </div>
                    <div>
                      <p className={`font-medium text-white ${isDarkMode ? 'md:text-white' : 'md:text-gray-900'}`}>
                        {selectedConversation.user.firstName} {selectedConversation.user.lastName}
                      </p>
                      <p className="text-xs text-white/80 md:text-[#25D366] capitalize">
                        {selectedConversation.user.role === 'dietitian' ? 'Your Dietitian' : selectedConversation.user.role}
                      </p>
                    </div>
                  </div>

                </div>

                {/* Messages - WhatsApp Style - Scrollable area */}
                <div
                  ref={messagesContainerRef}
                  className="flex-1 overflow-y-auto p-4 space-y-2"
                  style={{
                    backgroundColor: isDarkMode ? '#0B141A' : '#ECE5DD',
                    backgroundImage: isDarkMode
                      ? 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h100v100H0z\' fill=\'%230B141A\'/%3E%3Cpath d=\'M20 20h60v60H20z\' fill=\'%23FFFFFF\' opacity=\'.03\'/%3E%3C/svg%3E")'
                      : 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h100v100H0z\' fill=\'%23ECE5DD\'/%3E%3Cpath d=\'M20 20h60v60H20z\' fill=\'%23D9D9D9\' opacity=\'.05\'/%3E%3C/svg%3E")',
                    backgroundSize: '300px 300px'
                  }}
                >
                  {loadingMessages ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full py-12">
                      <div className={`rounded-2xl p-6 shadow-sm ${isDarkMode ? 'bg-gray-900/80' : 'bg-white/80'}`}>
                        <div className="w-16 h-16 bg-[#075E54]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Send className="w-8 h-8 text-[#075E54]" />
                        </div>
                        <h3 className={`font-semibold mb-1 text-center ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Start a conversation</h3>
                        <p className={`${isDarkMode ? 'text-gray-300' : 'text-gray-500'} text-sm text-center`}>
                          Send a message to {selectedConversation.user.firstName}
                        </p>
                      </div>
                    </div>
                  ) : (
                    messages.map((message, index) => {
                      const isOwn = message.sender._id === session?.user?.id;
                      const attachment = message.attachments?.[0];
                      const prevMessage = index > 0 ? messages[index - 1] : null;
                      const showDateSeparator = shouldShowDateSeparator(message, prevMessage);

                      // Render message content based on type
                      const renderMessageContent = () => {
                        // Helper to check if content is a meaningful caption (not just a media label)
                        const mediaLabels = ['📷 Photo', '🎬 Video', '🎵 Audio', '📎 File', 'Voice message', 'File attachment', 'Image', 'Video', 'Audio'];
                        const hasCaption = message.content && !mediaLabels.includes(message.content.trim());

                        if (attachment) {
                          switch (message.type) {
                            case 'image':
                              return (
                                <div className="relative max-w-[280px]">
                                  <img
                                    src={attachment.thumbnail || attachment.url}
                                    alt="Image attachment"
                                    className="rounded-lg max-w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
                                    onClick={() => openLightbox(attachment.url)}
                                    style={{ maxHeight: '300px' }}
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                  {hasCaption && (
                                    <p className="text-[14px] sm:text-[15px] mt-2">{message.content}</p>
                                  )}
                                </div>
                              );
                            case 'video':
                              return (
                                <div className="relative max-w-[280px]">
                                  <video
                                    src={attachment.url}
                                    controls
                                    playsInline
                                    preload="metadata"
                                    className="rounded-lg max-w-full h-auto"
                                    style={{ maxHeight: '300px' }}
                                    poster={attachment.thumbnail}
                                  >
                                    Your browser does not support the video tag.
                                  </video>
                                  <div className="mt-1 text-xs opacity-75">
                                    Video • {formatFileSize(attachment.size)}
                                  </div>
                                  {hasCaption && (
                                    <p className="text-[14px] sm:text-[15px] mt-1">{message.content}</p>
                                  )}
                                </div>
                              );
                            case 'audio':
                            case 'voice':
                              return (
                                <div className={`rounded-lg p-2 border max-w-[280px] ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                                  <audio controls className="w-full h-10" preload="metadata">
                                    <source src={attachment.url} type={attachment.mimeType || 'audio/mpeg'} />
                                    Your browser does not support the audio element.
                                  </audio>
                                  <div className={`mt-1 text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                                    {message.type === 'voice' ? 'Voice message' : 'Audio'} • {formatFileSize(attachment.size)}
                                  </div>
                                </div>
                              );
                            case 'file':
                              return (
                                <div className={`rounded-lg p-3 border max-w-[280px] ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                                  <a
                                    href={attachment.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center space-x-3 hover:opacity-80 transition-opacity"
                                  >
                                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                                      <FileText className="w-5 h-5 text-blue-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-sm font-medium truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                                        {attachment.filename || 'Document'}
                                      </p>
                                      <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                                        {formatFileSize(attachment.size)}
                                      </p>
                                    </div>
                                    <Download className={`w-4 h-4 shrink-0 ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`} />
                                  </a>
                                  {hasCaption && message.content !== 'File attachment' && (
                                    <p className="text-[14px] sm:text-[15px] mt-2">{message.content}</p>
                                  )}
                                </div>
                              );
                            default:
                              return <p className="text-[14px] sm:text-[15px] leading-relaxed whitespace-pre-wrap wrap-break-word">{message.content}</p>;
                          }
                        }
                        return <p className="text-[14px] sm:text-[15px] leading-relaxed whitespace-pre-wrap wrap-break-word">{message.content}</p>;
                      };

                      return (
                        <div key={message._id}>
                          {/* Date Separator - WhatsApp Style */}
                          {showDateSeparator && (
                            <div className="flex justify-center my-4">
                              <div className={`px-3 py-1 rounded-lg text-xs font-medium shadow-sm ${isDarkMode
                                ? 'bg-gray-800 text-gray-300'
                                : 'bg-white/90 text-gray-600'
                                }`}>
                                {formatDateSeparator(message.createdAt)}
                              </div>
                            </div>
                          )}

                          {/* Message Bubble */}
                          <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1 group`}>
                            <div className={`max-w-[85%] sm:max-w-[75%] relative ${isOwn ? 'order-2' : ''}`}>
                              {/* Delete menu for own messages */}
                              {isOwn && (
                                <div className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className={`h-6 w-6 p-0 rounded-full ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
                                      >
                                        <MoreVertical className="h-3.5 w-3.5" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="min-w-30">
                                      <DropdownMenuItem
                                        className="text-red-600 focus:text-red-600 cursor-pointer"
                                        onClick={() => confirmDeleteMessage(message)}
                                      >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              )}

                              <div
                                className={`px-3 py-2 rounded-lg shadow-sm inline-block ${isOwn
                                  ? isDarkMode
                                    ? 'bg-emerald-700 text-white rounded-tr-none'
                                    : 'bg-[#DCF8C6] text-gray-900 rounded-tr-none'
                                  : isDarkMode
                                    ? 'bg-gray-800 text-white rounded-tl-none'
                                    : 'bg-white text-gray-900 rounded-tl-none'
                                  }`}
                              >
                                {renderMessageContent()}
                                <div className={`flex items-center justify-end gap-1 mt-1`}>
                                  <span className={`text-[10px] sm:text-[11px] ${isDarkMode ? 'text-gray-200' : 'text-gray-500'}`}>
                                    {formatMessageTime(message.createdAt)}
                                  </span>
                                  {getStatusIcon(message.isRead, isOwn)}
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

                {/* Voice Recorder */}
                {showVoiceRecorder && (
                  <div className={`p-3 border-t ${isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`}>
                    <VoiceRecorder
                      onSend={handleVoiceRecording}
                      onCancel={() => setShowVoiceRecorder(false)}
                    />
                  </div>
                )}

                {/* Input Area - WhatsApp Style - Fixed at bottom */}
                {!showVoiceRecorder && (
                  <div
                    className={`p-2 sm:p-3 md:border-t md:rounded-b-xl shrink-0 ${isDarkMode ? 'bg-gray-900 md:bg-gray-900 md:border-gray-800' : 'bg-[#F0F0F0] md:bg-white md:border-gray-100'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-10 w-10 shrink-0 rounded-full ${isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-200'}`}
                        onClick={() => setShowMediaUpload(true)}
                        disabled={sending}
                      >
                        <Paperclip className={`h-5 w-5 ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`} />
                      </Button>
                      <div className={`flex-1 rounded-3xl flex items-center px-4 py-2 shadow-sm ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
                        <Input
                          ref={inputRef}
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          placeholder="Type a message..."
                          className={`flex-1 border-0 bg-transparent focus-visible:ring-0 text-[14px] sm:text-[15px] p-0 ${isDarkMode ? 'text-white placeholder:text-gray-400' : 'text-gray-900'}`}
                          onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                          disabled={sending}
                        />
                      </div>
                      {newMessage.trim() ? (
                        <Button
                          size="icon"
                          className="h-10 w-10 bg-[#075E54] hover:bg-[#064e47] shrink-0 rounded-full shadow-lg"
                          onClick={handleSendMessage}
                          disabled={!newMessage.trim() || sending}
                        >
                          <Send className="h-5 w-5" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-10 w-10 shrink-0 rounded-full ${isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-200'}`}
                          onClick={() => setShowVoiceRecorder(true)}
                          disabled={sending}
                        >
                          <Mic className={`h-5 w-5 ${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`} />
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Media Upload Modal */}
                <MediaUploadModal
                  isOpen={showMediaUpload}
                  onClose={() => setShowMediaUpload(false)}
                  onSend={handleMediaUpload}
                />
              </div>
            ) : (
              <div className={`flex-1 flex items-center justify-center ${isDarkMode ? 'bg-gray-950' : 'bg-[#ECE5DD]'}`}>
                <div className={`text-center rounded-2xl p-8 shadow-sm ${isDarkMode ? 'bg-gray-900/80' : 'bg-white/80'}`}>
                  <div className="w-16 h-16 bg-[#075E54]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Send className="w-8 h-8 text-[#075E54]" />
                  </div>
                  <h3 className={`font-semibold mb-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Select a conversation</h3>
                  <p className={`${isDarkMode ? 'text-gray-300' : 'text-gray-500'} text-sm`}>Choose a conversation from the list to start chatting</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Image Lightbox */}
      <ImageLightbox
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        src={lightboxImage}
        alt="Message attachment"
      />

      {/* Delete Message Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Message?</AlertDialogTitle>
            <AlertDialogDescription>
              This message will be permanently deleted. This action cannot be undone.
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
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageTransition>
  );
}