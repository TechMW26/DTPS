'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ChatBubble, TypingIndicator, type ChatMessage } from './ChatBubble';
import { ChatInput } from './ChatInput';
import { useRealtime } from '@/hooks/useRealtime';
import { cn } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';
import { useCallManager } from '@/hooks/useCallManager';
import { CallInterface } from '@/components/call/CallInterface';
import { useNotifications } from '@/hooks/useNotifications';
import Image from 'next/image';

interface ChatUser {
  _id: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  role: string;
}

interface ChatInterfaceProps {
  recipient: ChatUser;
  onBack?: () => void;
  className?: string;
  onUserStatusChange?: (userId: string, isOnline: boolean) => void;
}

export function ChatInterface({ recipient, onBack, className, onUserStatusChange }: ChatInterfaceProps) {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());

  // Call management (incoming calls only — outbound call buttons removed)
  const {
    callState,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo
  } = useCallManager();

  // Notifications
  const {
    showMessageNotification,
  } = useNotifications();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Real-time connection
  const { isConnected, onlineUsers, sendTyping } = useRealtime({
    onMessage: (event) => {
      if (event.type === 'new_message') {
        const newMessage = event.data.message;
        if (newMessage.sender._id === recipient._id || newMessage.receiver._id === recipient._id) {
          setMessages(prev => [...prev, newMessage]);
          scrollToBottom();

          // Auto-mark as read if message is from recipient
          if (newMessage.sender._id === recipient._id) {
            setTimeout(() => {
              markMessageAsRead(newMessage._id);
            }, 1000);

            // Show notification if window is not focused
            if (!document.hasFocus()) {
              showMessageNotification(
                `${newMessage.sender.firstName} ${newMessage.sender.lastName}`,
                newMessage.content,
                newMessage.sender.avatar,
                recipient._id
              );
            }
          }
        }
      } else if (event.type === 'message_status_update') {
        const { messageId, status } = event.data;
        setMessages(prev => prev.map(msg =>
          msg._id === messageId ? { ...msg, status } : msg
        ));
      }
    },
    onTyping: ({ userId, isTyping }) => {
      if (userId === recipient._id) {
        setTypingUsers(prev => {
          const newSet = new Set(prev);
          if (isTyping) {
            newSet.add(userId);
          } else {
            newSet.delete(userId);
          }
          return newSet;
        });
      }
    },
    onUserOnline: (userId) => {
      // Notify parent component about online status change
      if (onUserStatusChange) {
        onUserStatusChange(userId, true);
      }
    },
    onUserOffline: (userId) => {
      // Notify parent component about online status change
      if (onUserStatusChange) {
        onUserStatusChange(userId, false);
      }
    }
  });

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Load messages
  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/messages?conversationWith=${recipient._id}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
        setTimeout(scrollToBottom, 100);

        // Mark messages as read
        markMessagesAsRead();
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setLoading(false);
    }
  }, [recipient._id, scrollToBottom]);

  // Mark messages as read
  const markMessagesAsRead = useCallback(async () => {
    try {
      await fetch(`/api/messages/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationWith: recipient._id,
          status: 'read'
        })
      });
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
    }
  }, [recipient._id]);

  // Mark single message as read
  const markMessageAsRead = useCallback(async (messageId: string) => {
    try {
      await fetch(`/api/messages/${messageId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'read' })
      });
    } catch (error) {
      console.error('Failed to mark message as read:', error);
    }
  }, []);

  // Send message
  const handleSendMessage = async (
    content: string,
    type: 'text' | 'image' | 'file' | 'video' | 'audio' | 'voice' = 'text',
    attachments?: {
      url: string;
      filename: string;
      size: number;
      mimeType: string;
      thumbnail?: string;
      duration?: number;
      width?: number;
      height?: number;
    }[]
  ) => {
    // For text messages, require content. For media messages, allow sending with attachments
    const hasContent = content.trim().length > 0;
    const hasAttachments = attachments && attachments.length > 0;

    if ((!hasContent && !hasAttachments) || sending) return;

    try {
      setSending(true);

      // Optimistically add message
      const tempMessage: ChatMessage = {
        _id: `temp-${Date.now()}`,
        content,
        type,
        attachments,
        sender: {
          _id: session!.user.id,
          firstName: session!.user.firstName,
          lastName: session!.user.lastName,
          avatar: session!.user.avatar
        },
        receiver: recipient,
        isRead: false,
        createdAt: new Date().toISOString(),
        status: 'sending'
      };

      setMessages(prev => [...prev, tempMessage]);
      scrollToBottom();

      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: recipient._id,
          content,
          type,
          attachments
        })
      });

      if (response.ok) {
        const sentMessage = await response.json();
        setMessages(prev =>
          prev.map(msg =>
            msg._id === tempMessage._id
              ? { ...sentMessage, status: 'sent' }
              : msg
          )
        );
      } else {
        // Mark message as failed
        setMessages(prev =>
          prev.map(msg =>
            msg._id === tempMessage._id
              ? { ...msg, status: 'failed' }
              : msg
          )
        );
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      // Mark message as failed
      setMessages(prev =>
        prev.map(msg =>
          msg._id.startsWith('temp-')
            ? { ...msg, status: 'failed' }
            : msg
        )
      );
    } finally {
      setSending(false);
    }
  };

  // Handle typing
  const handleTyping = (isTyping: boolean) => {
    sendTyping(recipient._id, isTyping);
  };

  // Load messages on mount
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Group messages by sender and time
  const groupedMessages = messages.reduce((groups: ChatMessage[][], message, index) => {
    const prevMessage = messages[index - 1];
    const isSameSender = prevMessage?.sender._id === message.sender._id;
    const timeDiff = prevMessage
      ? new Date(message.createdAt).getTime() - new Date(prevMessage.createdAt).getTime()
      : Infinity;
    const isWithinTimeWindow = timeDiff < 5 * 60 * 1000; // 5 minutes

    if (isSameSender && isWithinTimeWindow) {
      groups[groups.length - 1].push(message);
    } else {
      groups.push([message]);
    }

    return groups;
  }, []);

  const isRecipientOnline = onlineUsers.includes(recipient._id);
  const isRecipientTyping = typingUsers.has(recipient._id);

  return (
    <div className={cn("flex flex-col h-full bg-[#e5ddd5]", className)}>
      {/* Chat header */}
      <div className="bg-[#075e54] text-white px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack} className="p-2 text-white hover:bg-white/10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}

          <div className="relative">
            <Avatar className="w-10 h-10">
              <AvatarImage src={recipient.avatar} />
              <AvatarFallback className="bg-white/20 text-white">
                {recipient.firstName[0]}{recipient.lastName[0]}
              </AvatarFallback>
            </Avatar>
            {isRecipientOnline && (
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-400 border-2 border-[#075e54] rounded-full" />
            )}
          </div>

          <div className="flex-1">
            <h3 className="font-medium text-white">
              {recipient.firstName} {recipient.lastName}
            </h3>
            <div className="flex items-center space-x-2">
              {isRecipientTyping ? (
                <span className="text-xs text-green-200">typing...</span>
              ) : isRecipientOnline ? (
                <span className="text-xs text-green-200">online</span>
              ) : (
                <span className="text-xs text-white/70">last seen recently</span>
              )}
            </div>
          </div>
        </div>


      </div>

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#e5ddd5] relative chat-scrollbar"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d1c7b8' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      >
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <Image
              src="/images/spoon-loader.gif"
              alt="Loading..."
              width={80}
              height={120}
              className="object-contain"
              unoptimized
            />
          </div>
        ) : (
          <>
            {groupedMessages.map((group, groupIndex) => (
              <div key={groupIndex} className="space-y-1">
                {group.map((message, messageIndex) => (
                  <ChatBubble
                    key={message._id}
                    message={message}
                    isOwn={message.sender._id === session?.user.id}
                    showAvatar={messageIndex === 0}
                    showTimestamp={messageIndex === group.length - 1}
                    isLastInGroup={messageIndex === group.length - 1}
                  />
                ))}
              </div>
            ))}

            {isRecipientTyping && (
              <TypingIndicator user={recipient} />
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Chat input */}
      <ChatInput
        onSendMessage={handleSendMessage}
        onTyping={handleTyping}
        disabled={sending || !isConnected}
        placeholder={`Message ${recipient.firstName}...`}
        recipientId={recipient._id}
      />

      {/* Call Interface */}
      {callState.isInCall && (
        <CallInterface
          callId={callState.callId!}
          localUser={{
            id: session?.user.id || '',
            name: `${session?.user.firstName} ${session?.user.lastName}`,
            avatar: session?.user.avatar
          }}
          remoteUser={
            callState.isIncoming
              ? callState.caller!
              : callState.receiver || {
                id: recipient._id,
                name: `${recipient.firstName} ${recipient.lastName}`,
                avatar: recipient.avatar
              }
          }
          callType={callState.callType!}
          isIncoming={callState.isIncoming}
          onAccept={acceptCall}
          onReject={rejectCall}
          onEnd={endCall}
          onToggleMute={toggleMute}
          onToggleVideo={toggleVideo}
          localStream={callState.localStream}
          remoteStream={callState.remoteStream}
          connectionState={callState.connectionState}
          isMuted={callState.isMuted}
          isVideoOff={callState.isVideoOff}
        />
      )}
    </div>
  );
}
