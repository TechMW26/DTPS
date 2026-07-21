'use client';

import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday } from 'date-fns';
import { Search, MessageCircle } from 'lucide-react';

export interface Conversation {
  _id: string;
  participant: {
    _id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    role: string;
    phone?: string;
    clientId?: string;
  };
  lastMessage: {
    content: string;
    type: 'text' | 'image' | 'file';
    createdAt: string;
    isRead: boolean;
    sender: string;
  } | null;
  unreadCount: number;
  isOnline?: boolean;
  isTyping?: boolean;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversationId?: string;
  onSelectConversation: (conversationId: string) => void;
  onlineUsers?: string[];
  typingUsers?: string[];
  className?: string;
}

export function ConversationList({
  conversations,
  selectedConversationId,
  onSelectConversation,
  onlineUsers = [],
  typingUsers = [],
  className
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter conversations based on search query
  const filteredConversations = conversations.filter(conversation => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const fullName = `${conversation.participant.firstName} ${conversation.participant.lastName}`.toLowerCase();
    const phone = (conversation.participant.phone || '').replace(/\D/g, '');
    const clientId = (conversation.participant.clientId || '').toLowerCase();
    return (
      fullName.includes(q) ||
      phone.includes(q.replace(/\D/g, '')) ||
      clientId.includes(q)
    );
  });

  const formatLastMessageTime = (timestamp: string) => {
    try {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return '';

      if (isToday(date)) {
        return format(date, 'HH:mm');
      } else if (isYesterday(date)) {
        return 'Yesterday';
      } else {
        return format(date, 'MMM d');
      }
    } catch (error) {
      return '';
    }
  };

  const getLastMessagePreview = (message: Conversation['lastMessage']) => {
    if (!message) return 'No messages yet';

    switch (message.type) {
      case 'image':
        return 'Photo';
      case 'file':
        return 'File';
      default:
        return message.content.length > 50
          ? `${message.content.substring(0, 50)}...`
          : message.content;
    }
  };

  const isUserOnline = (userId: string) => onlineUsers.includes(userId);
  const isUserTyping = (userId: string) => typingUsers.includes(userId);

  return (
    <div className={cn("flex flex-col h-full bg-white", className)}>
      {/* Header */}
      <div className="p-4 bg-[#075e54] text-white">
        <h2 className="text-xl font-semibold mb-4">WhatsApp</h2>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search or start new chat"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/70 focus:bg-white focus:text-gray-900 focus:placeholder:text-gray-500"
          />
        </div>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <MessageCircle className="w-12 h-12 mb-4" />
            <p className="text-lg font-medium">No conversations</p>
            <p className="text-sm">Start a new conversation to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredConversations.map((conversation) => {
              const isSelected = conversation._id === selectedConversationId;
              const isOnline = isUserOnline(conversation.participant._id);
              const isTyping = isUserTyping(conversation.participant._id);

              return (
                <div
                  key={conversation._id}
                  onClick={() => onSelectConversation(conversation._id)}
                  className={cn(
                    "flex items-center p-3 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-100",
                    isSelected && "bg-[#f0f2f5]"
                  )}
                >
                  {/* Avatar with online indicator */}
                  <div className="relative shrink-0">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={conversation.participant.avatar} />
                      <AvatarFallback>
                        {conversation.participant.firstName[0]}
                        {conversation.participant.lastName[0]}
                      </AvatarFallback>
                    </Avatar>

                    {/* Online indicator */}
                    {isOnline && (
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full" />
                    )}
                  </div>

                  {/* Conversation details */}
                  <div className="flex-1 min-w-0 ml-3">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-medium text-gray-900 truncate">
                        {conversation.participant.firstName} {conversation.participant.lastName}
                      </h3>

                      {conversation.lastMessage && (
                        <span className="text-xs text-gray-500 shrink-0">
                          {formatLastMessageTime(conversation.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        {isTyping ? (
                          <p className="text-sm text-blue-600 italic">typing...</p>
                        ) : (
                          <p className={cn(
                            "text-sm truncate",
                            conversation.unreadCount > 0
                              ? "text-gray-900 font-medium"
                              : "text-gray-500"
                          )}>
                            {getLastMessagePreview(conversation.lastMessage)}
                          </p>
                        )}
                      </div>

                      {/* Unread count badge */}
                      {conversation.unreadCount > 0 && (
                        <Badge className="ml-2 bg-blue-500 text-white text-xs px-2 py-1 rounded-full min-w-[20px] h-5 flex items-center justify-center">
                          {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                        </Badge>
                      )}
                    </div>

                    {/* Role badge */}
                    <div className="mt-1">
                      <Badge
                        variant="outline"
                        className="text-xs capitalize"
                      >
                        {conversation.participant.role}
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
