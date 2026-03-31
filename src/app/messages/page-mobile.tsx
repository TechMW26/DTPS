'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import {
  Send,
  MessageCircle,
  Search,
  ChevronLeft,
  Check,
  CheckCheck,
  Plus,
  Paperclip,
  Smile,
  MoreVertical,
  User,
  Target,
  Heart,
  TrendingUp
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';

interface Message {
  _id: string;
  content: string;
  type: 'text' | 'image' | 'file';
  isRead: boolean;
  createdAt: string;
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
  };
  lastMessage: Message;
  unreadCount: number;
  isOnline?: boolean;
}

export default function MessagesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(searchParams?.get('userId'));
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isClient = session?.user?.role === 'client';

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/auth/signin');
      return;
    }
    if (session.user.role !== 'client') {
      router.push('/dashboard/dietitian');
      return;
    }
  }, [session, status, router]);

  useEffect(() => {
    if (session) {
      fetchConversations();
    }
  }, [session]);

  useEffect(() => {
    if (selectedChat) {
      fetchMessages(selectedChat);
    }
  }, [selectedChat]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchConversations = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/messages/conversations');
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (userId: string) => {
    try {
      const response = await fetch(`/api/messages?userId=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedChat || sending) return;

    setSending(true);
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiverId: selectedChat,
          content: newMessage,
          type: 'text'
        })
      });

      if (response.ok) {
        const data = await response.json();
        setMessages([...messages, data.message]);
        setNewMessage('');
        fetchConversations(); // Update conversation list
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatMessageTime = (date: string) => {
    const messageDate = new Date(date);
    if (isToday(messageDate)) {
      return format(messageDate, 'HH:mm');
    } else if (isYesterday(messageDate)) {
      return 'Yesterday';
    } else {
      return format(messageDate, 'MMM d');
    }
  };

  const filteredConversations = conversations.filter(conv =>
    `${conv.user.firstName} ${conv.user.lastName}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner className="h-12 w-12 text-emerald-500" />
      </div>
    );
  }

  if (!session || !isClient) {
    return null;
  }

  // Chat View
  if (selectedChat) {
    const currentChat = conversations.find(c => c.user._id === selectedChat);

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Chat Header */}
        <div className="bg-white sticky top-0 z-50 shadow-sm safe-area-top">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 flex-1">
                <button
                  onClick={() => setSelectedChat(null)}
                  className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors active:scale-95"
                >
                  <ChevronLeft className="h-5 w-5 text-gray-700" />
                </button>
                <div className="h-10 w-10 rounded-full bg-linear-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold">
                  {currentChat?.user.avatar ? (
                    <img src={currentChat.user.avatar} alt="" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <span>{currentChat?.user.firstName[0]}{currentChat?.user.lastName[0]}</span>
                  )}
                </div>
                <div className="flex-1">
                  <h1 className="text-base font-bold text-gray-900">
                    {currentChat?.user.firstName} {currentChat?.user.lastName}
                  </h1>
                  <p className="text-xs text-gray-500">
                    {currentChat?.isOnline ? 'Online' : 'Offline'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2" />
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-24">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <MessageCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">No messages yet</h3>
              <p className="text-gray-600">Start the conversation!</p>
            </div>
          ) : (
            messages.map((message) => {
              const isSent = message.sender._id === session.user.id;
              return (
                <div key={message._id} className={`flex ${isSent ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] ${isSent ? 'order-2' : 'order-1'}`}>
                    <div
                      className={`rounded-2xl px-4 py-2 ${isSent
                          ? 'bg-linear-to-br from-emerald-500 to-teal-600 text-white'
                          : 'bg-white text-gray-900 shadow-sm'
                        }`}
                    >
                      <p className="text-sm">{message.content}</p>
                    </div>
                    <div className={`flex items-center space-x-1 mt-1 ${isSent ? 'justify-end' : 'justify-start'}`}>
                      <span className="text-xs text-gray-500">{formatMessageTime(message.createdAt)}</span>
                      {isSent && (
                        message.isRead ? (
                          <CheckCheck className="h-3 w-3 text-blue-500" />
                        ) : (
                          <Check className="h-3 w-3 text-gray-400" />
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-bottom">
          <div className="px-4 py-3">
            <div className="flex items-center space-x-2">
              <button className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors active:scale-95">
                <Plus className="h-5 w-5 text-gray-700" />
              </button>
              <div className="flex-1 relative">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className="h-10 rounded-full pr-20 border-gray-200"
                />
                <button className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors active:scale-95">
                  <Smile className="h-4 w-4 text-gray-700" />
                </button>
              </div>
              <button
                onClick={sendMessage}
                disabled={!newMessage.trim() || sending}
                className="h-10 w-10 rounded-full bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg active:scale-95 transition-transform disabled:opacity-50"
              >
                <Send className="h-5 w-5 text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Conversations List
  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white sticky top-0 z-50 shadow-sm safe-area-top">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-gray-900">Messages</h1>
            <button className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center hover:bg-emerald-200 transition-colors active:scale-95">
              <Plus className="h-5 w-5 text-emerald-600" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="h-10 pl-10 rounded-full border-gray-200"
            />
          </div>
        </div>
      </div>

      {/* Conversations */}
      <div className="px-4 py-4 space-y-2">
        {filteredConversations.length === 0 ? (
          <div className="text-center py-12">
            <MessageCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">No conversations</h3>
            <p className="text-gray-600 mb-4">Start chatting with your dietitian</p>
          </div>
        ) : (
          filteredConversations.map((conv) => (
            <button
              key={conv.user._id}
              onClick={() => setSelectedChat(conv.user._id)}
              className="w-full bg-white rounded-2xl shadow-sm p-4 flex items-center space-x-3 active:scale-98 transition-transform"
            >
              <div className="relative">
                <div className="h-12 w-12 rounded-full bg-linear-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold">
                  {conv.user.avatar ? (
                    <img src={conv.user.avatar} alt="" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <span>{conv.user.firstName[0]}{conv.user.lastName[0]}</span>
                  )}
                </div>
                {conv.isOnline && (
                  <div className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 rounded-full border-2 border-white" />
                )}
              </div>
              <div className="flex-1 text-left">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-gray-900">
                    {conv.user.firstName} {conv.user.lastName}
                  </h3>
                  <span className="text-xs text-gray-500">
                    {formatMessageTime(conv.lastMessage.createdAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600 truncate flex-1">
                    {conv.lastMessage.content}
                  </p>
                  {conv.unreadCount > 0 && (
                    <div className="ml-2 h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center">
                      <span className="text-xs font-bold text-white">{conv.unreadCount}</span>
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-bottom z-50">
        <div className="grid grid-cols-5 h-16">
          <Link href="/client-dashboard" className="flex flex-col items-center justify-center text-gray-400 hover:text-gray-600">
            <Target className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">Home</span>
          </Link>
          <Link href="/my-plan" className="flex flex-col items-center justify-center text-gray-400 hover:text-gray-600">
            <Heart className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">Plan</span>
          </Link>
          <button className="flex flex-col items-center justify-center -mt-6">
            <div className="h-14 w-14 rounded-full bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
              <Plus className="h-7 w-7 text-white" />
            </div>
          </button>
          <Link href="/progress" className="flex flex-col items-center justify-center text-gray-400 hover:text-gray-600">
            <TrendingUp className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">Progress</span>
          </Link>
          <Link href="/messages" className="flex flex-col items-center justify-center text-emerald-600">
            <MessageCircle className="h-6 w-6 mb-1" />
            <span className="text-xs font-medium">Messages</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

