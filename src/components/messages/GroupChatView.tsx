'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, ArrowLeft, Users, Info, Loader2, Check, CheckCheck, Paperclip, Smile, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format, isToday, isYesterday } from 'date-fns';
import ImageLightbox from '@/components/ui/image-lightbox';
import { getDocumentViewerUrl, getMediaKind, getMediaProxyUrl, getMediaUrl } from '@/lib/media';

interface GroupMessage {
  _id: string;
  group: string;
  sender: {
    _id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
  };
  content: string;
  type: string;
  attachments?: {
    url: string;
    filename: string;
    size: number;
    mimeType: string;
    thumbnail?: string;
  }[];
  readBy?: { user: string; readAt: string }[];
  createdAt: string;
}

interface GroupInfo {
  _id: string;
  name: string;
  description?: string;
  avatar?: string;
  memberCount?: number;
  memberDetails?: {
    _id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    role: string;
  }[];
  members?: {
    user: any;
    role: string;
    joinedAt: string;
    lastReadAt?: string;
  }[];
  createdBy?: any;
}

interface GroupChatViewProps {
  group: GroupInfo;
  currentUserId: string;
  onBack: () => void;
  onShowInfo: () => void;
  onNewGroupMessage?: (message: GroupMessage) => void;
}

export default function GroupChatView({
  group,
  currentUserId,
  onBack,
  onShowInfo,
  onNewGroupMessage
}: GroupChatViewProps) {
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openLightbox = (url: string) => {
    setLightboxImage(url);
    setLightboxOpen(true);
  };

  useEffect(() => {
    if (group._id) {
      fetchMessages();
    }
  }, [group._id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Listen for SSE group messages
  useEffect(() => {
    if (onNewGroupMessage) return; // Parent handles SSE

    // Otherwise, we can set up polling as fallback
    const interval = setInterval(() => {
      fetchMessagesQuiet();
    }, 5000);

    return () => clearInterval(interval);
  }, [group._id]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/messages/groups/${group._id}/messages?limit=50`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error('Error fetching group messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessagesQuiet = async () => {
    try {
      const response = await fetch(`/api/messages/groups/${group._id}/messages?limit=50`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      // Silent fail
    }
  };

  // Expose a method to add messages from SSE
  const addMessage = useCallback((message: GroupMessage) => {
    setMessages(prev => {
      if (prev.some(m => m._id === message._id)) return prev;
      return [...prev, message];
    });
    setTimeout(scrollToBottom, 100);
  }, []);

  // Make addMessage available to parent via effect
  useEffect(() => {
    (window as any).__groupChatAddMessage = addMessage;
    return () => {
      delete (window as any).__groupChatAddMessage;
    };
  }, [addMessage]);

  const sendMessage = async () => {
    if (!newMessage.trim() || sending) return;

    const messageText = newMessage.trim();
    setNewMessage('');
    setSending(true);

    try {
      const response = await fetch(`/api/messages/groups/${group._id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: messageText,
          type: 'text'
        })
      });

      if (response.ok) {
        const data = await response.json();
        // Add message optimistically (de-duplication handles if SSE arrives too)
        addMessage(data.message);
      } else {
        setNewMessage(messageText);
        const errData = await response.json();
        console.error('Failed to send group message:', errData.error);
      }
    } catch (error) {
      console.error('Error sending group message:', error);
      setNewMessage(messageText);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'message');

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) throw new Error('Upload failed');
      const uploadData = await uploadResponse.json();

      const attachment = {
        url: uploadData.url,
        filename: uploadData.filename || file.name,
        size: uploadData.size || file.size,
        mimeType: uploadData.type || file.type
      };

      const type = file.type.startsWith('image/') ? 'image' :
        file.type.startsWith('video/') ? 'video' :
          file.type.startsWith('audio/') ? 'audio' : 'file';

      const response = await fetch(`/api/messages/groups/${group._id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: type === 'image' ? 'Image' : file.name,
          type,
          attachments: [attachment]
        })
      });

      if (response.ok) {
        const data = await response.json();
        addMessage(data.message);
      }
    } catch (error) {
      alert('Failed to upload file');
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatMessageDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return format(date, 'HH:mm');
    if (isYesterday(date)) return `Yesterday ${format(date, 'HH:mm')}`;
    return format(date, 'dd/MM/yy HH:mm');
  };

  const getDateSeparator = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'EEEE, MMMM d, yyyy');
  };

  const shouldShowDateSeparator = (index: number) => {
    if (index === 0) return true;
    const currentDate = new Date(messages[index].createdAt).toDateString();
    const previousDate = new Date(messages[index - 1].createdAt).toDateString();
    return currentDate !== previousDate;
  };

  const shouldShowSenderName = (index: number) => {
    if (index === 0) return true;
    return messages[index].sender._id !== messages[index - 1].sender._id;
  };

  // Resolve member count from either field
  const memberCount = group.memberCount || group.members?.length || group.memberDetails?.length || 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="lg:hidden">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
            {group.avatar ? (
              <img src={group.avatar} className="h-10 w-10 rounded-full object-cover" alt="" />
            ) : (
              <Users className="h-5 w-5 text-blue-600" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{group.name}</h3>
            <p className="text-xs text-gray-500">
              {memberCount} member{memberCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onShowInfo}>
          <Info className="h-5 w-5 text-gray-500" />
        </Button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1 bg-[#e5ddd5]">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center mb-4">
              <Users className="h-8 w-8 text-blue-500" />
            </div>
            <p className="text-gray-600 font-medium">{group.name}</p>
            <p className="text-gray-400 text-sm mt-1">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.sender._id === currentUserId;
            const showDate = shouldShowDateSeparator(index);
            const showName = !isMe && shouldShowSenderName(index);

            return (
              <div key={msg._id}>
                {showDate && (
                  <div className="flex justify-center my-4 sticky top-2 z-10">
                    <span className="bg-white text-gray-600 text-[12px] font-medium px-4 py-1.5 rounded-lg shadow-md">
                      {getDateSeparator(msg.createdAt)}
                    </span>
                  </div>
                )}
                <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-1`}>
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 shadow-sm ${isMe
                    ? 'bg-[#dcf8c6] text-gray-900'
                    : 'bg-white text-gray-900'
                    }`}>
                    {showName && (
                      <p className="text-xs font-semibold text-blue-600 mb-1">
                        {msg.sender.firstName} {msg.sender.lastName}
                      </p>
                    )}

                    {/* Attachments */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mb-1">
                        {msg.attachments.map((att, attIdx) => (
                          <div key={attIdx}>
                            {getMediaKind(att.filename, att.mimeType, getMediaUrl(att)) === 'image' ? (
                              <img
                                src={getMediaProxyUrl(att)}
                                alt={att.filename}
                                className="rounded max-w-full max-h-60 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => openLightbox(getMediaUrl(att))}
                              />
                            ) : (
                              <a
                                href={getDocumentViewerUrl(att, att.filename, att.mimeType)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 underline text-sm"
                              >
                                {att.filename}
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {msg.type !== 'image' && (
                      <p className="text-sm whitespace-pre-wrap wrap-break-word">{msg.content}</p>
                    )}

                    <div className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <span className="text-[10px] text-gray-500">
                        {formatMessageDate(msg.createdAt)}
                      </span>
                      {isMe && (
                        <CheckCheck className="h-3 w-3 text-blue-400" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 border-t bg-white flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileUpload}
          accept="image/*,.pdf,.doc,.docx,.txt"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingFile}
          className="text-gray-500"
        >
          {uploadingFile ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
        </Button>
        <Input
          ref={inputRef}
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="flex-1"
          disabled={sending}
        />
        <Button
          onClick={sendMessage}
          disabled={!newMessage.trim() || sending}
          size="sm"
          className="bg-green-600 hover:bg-green-700"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>

      {/* Image Lightbox */}
      <ImageLightbox
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        src={lightboxImage}
        alt="Attachment"
      />
    </div>
  );
}
