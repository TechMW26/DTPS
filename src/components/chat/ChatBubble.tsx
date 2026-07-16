"use client";

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Download,
  FileText,
  MapPin,
  User,
  MoreHorizontal,
  Reply,
  RotateCcw,
  CornerDownRight,
} from "lucide-react";
import { ImageModal } from "./ImageModal";
import { MessageReactions } from "./MessageReactions";

export interface ChatMessage {
  _id: string;
  content: string;
  type:
    | "text"
    | "image"
    | "video"
    | "audio"
    | "voice"
    | "file"
    | "emoji"
    | "sticker"
    | "location"
    | "contact"
    | "call_missed";
  attachments?: {
    url: string;
    filename: string;
    size: number;
    mimeType: string;
    thumbnail?: string;
    duration?: number;
    width?: number;
    height?: number;
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
  isRead: boolean;
  readAt?: string;
  createdAt: string;
  status?: "sending" | "sent" | "delivered" | "read" | "failed";
  replyTo?: ChatMessage;
  reactions?: {
    emoji: string;
    userId: string;
    createdAt: string;
  }[];
}

interface ChatBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  showAvatar?: boolean;
  showTimestamp?: boolean;
  isLastInGroup?: boolean;
  onReaction?: (messageId: string, emoji: string) => void;
  onRemoveReaction?: (messageId: string, emoji: string) => void;
  onReply?: (message: ChatMessage) => void;
  onResend?: (message: ChatMessage) => void;
  currentUserId?: string;
}

export function ChatBubble({
  message,
  isOwn,
  showAvatar = true,
  showTimestamp = true,
  isLastInGroup = false,
  onReaction,
  onRemoveReaction,
  onReply,
  onResend,
  currentUserId,
}: ChatBubbleProps) {
  const [imageError, setImageError] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState("");

  const getStatusIcon = () => {
    if (!isOwn) return null;

    switch (message.status) {
      case "sending":
        return <Clock className="w-3 h-3 text-gray-400 animate-pulse" />;
      case "sent":
        return <Check className="w-3 h-3 text-gray-400" />;
      case "delivered":
        return <CheckCheck className="w-3 h-3 text-gray-400" />;
      case "read":
        return <CheckCheck className="w-3 h-3 text-blue-500" />;
      case "failed":
        return <AlertCircle className="w-3 h-3 text-red-500" />;
      default:
        return <Check className="w-3 h-3 text-gray-400" />;
    }
  };

  const handleImageClick = (imageUrl: string) => {
    setSelectedImageUrl(imageUrl);
    setShowImageModal(true);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const renderMessageContent = () => {
    // Handle attachments first
    if (message.attachments && message.attachments.length > 0) {
      const attachment = message.attachments[0]; // For now, handle single attachment

      switch (message.type) {
        case "image":
          return (
            <div className="relative max-w-xs">
              {!imageError ? (
                <div
                  className="cursor-pointer group relative"
                  onClick={() => handleImageClick(attachment.url)}
                >
                  <img
                    src={attachment.thumbnail || attachment.url}
                    alt={attachment.filename}
                    className="rounded-lg max-w-full h-auto transition-opacity group-hover:opacity-90"
                    onError={() => setImageError(true)}
                    style={{ maxHeight: "300px", maxWidth: "250px" }}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-lg transition-colors flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="bg-black/50 rounded-full p-2">
                        <svg
                          className="w-6 h-6 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-100 rounded-lg p-4 text-center text-gray-500">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">Failed to load image</p>
                </div>
              )}
            </div>
          );

        case "video":
          return (
            <div className="relative max-w-xs">
              <video
                src={attachment.url}
                controls
                className="rounded-lg max-w-full h-auto"
                style={{ maxHeight: "300px", maxWidth: "250px" }}
                poster={attachment.thumbnail}
              >
                Your browser does not support the video tag.
              </video>
              <div className="mt-1 text-xs opacity-75">
                {attachment.filename} • {formatFileSize(attachment.size)}
                {attachment.duration &&
                  ` • ${Math.floor(attachment.duration / 60)}:${(attachment.duration % 60).toString().padStart(2, "0")}`}
              </div>
            </div>
          );

        case "audio":
        case "voice": {
          const voiceLabel =
            message.type === "voice"
              ? message.content && message.content !== "Voice message"
                ? message.content
                : "Voice message"
              : attachment.filename;

          return (
            <div className="max-w-70 min-w-50">
              {/* WhatsApp-style voice message */}
              <div className="flex items-center gap-2">
                <audio
                  controls
                  className="w-full h-8"
                  style={{
                    filter: isOwn ? "hue-rotate(80deg) saturate(1.2)" : "none",
                  }}
                >
                  <source
                    src={attachment.url}
                    type={attachment.mimeType || "audio/mpeg"}
                  />
                  Your browser does not support audio.
                </audio>
              </div>
              <div className="flex items-center justify-between mt-1 text-[10px] text-gray-500">
                <span
                  className={cn(message.status === "failed" && "text-red-500")}
                >
                  {voiceLabel}
                  {attachment.size > 0 &&
                    ` • ${formatFileSize(attachment.size)}`}
                </span>
                {attachment.duration && (
                  <span>
                    {Math.floor(attachment.duration / 60)}:
                    {(attachment.duration % 60).toString().padStart(2, "0")}
                  </span>
                )}
              </div>
            </div>
          );
        }

        case "file":
          return (
            <div className="bg-gray-50 rounded-lg p-3 border max-w-xs">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {attachment.filename}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(attachment.size)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(attachment.url, "_blank")}
                  className="h-8 w-8 p-0"
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </div>
          );
      }
    }

    // Handle text-based message types
    switch (message.type) {
      case "emoji":
        return <div className="text-4xl">{message.content}</div>;

      case "location":
        return (
          <div className="bg-gray-50 rounded-lg p-3 border max-w-xs">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <MapPin className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">Location</p>
                <p className="text-xs text-gray-500 truncate">
                  {message.content}
                </p>
              </div>
            </div>
          </div>
        );

      case "contact":
        return (
          <div className="bg-gray-50 rounded-lg p-3 border max-w-xs">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">Contact</p>
                <p className="text-xs text-gray-500 truncate">
                  {message.content}
                </p>
              </div>
            </div>
          </div>
        );

      case "call_missed":
        return (
          <div className="bg-gray-50 rounded-lg p-2 border max-w-xs text-gray-700 text-sm text-center">
            Missed call
          </div>
        );

      default:
        return (
          <p className="text-sm whitespace-pre-wrap wrap-break-word">
            {message.content}
          </p>
        );
    }
  };

  return (
    <>
      <div
        className={cn(
          "flex items-end space-x-2 mb-4 group",
          isOwn ? "justify-end" : "justify-start",
        )}
      >
        {/* Avatar for received messages */}
        {!isOwn && showAvatar && (
          <Avatar className="w-8 h-8 shrink-0">
            <AvatarImage src={message.sender.avatar} />
            <AvatarFallback className="text-xs">
              {message.sender.firstName[0]}
              {message.sender.lastName[0]}
            </AvatarFallback>
          </Avatar>
        )}

        {/* Message container with hover effects */}
        <div className="relative flex items-center group/msg">
          {/* ── Persistent reply arrow (own messages: left side) ── */}
          {isOwn && onReply && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReply(message);
              }}
              className="shrink-0 mr-1 p-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-600 active:scale-90 transition-all duration-150 border border-gray-200"
              title="Reply"
              aria-label="Reply to message"
            >
              <CornerDownRight className="w-4 h-4" />
            </button>
          )}

          <div className="relative">
            {/* Message actions (visible on hover) */}
            <div
              className={cn(
                "absolute top-0 flex items-center space-x-1 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-200 z-10",
                isOwn ? "-left-20" : "-right-20",
              )}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onReply?.(message)}
                className="h-6 w-6 p-0 bg-white shadow-sm border hover:bg-gray-50"
                title="Reply"
              >
                <Reply className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 bg-white shadow-sm border hover:bg-gray-50"
                title="More options"
              >
                <MoreHorizontal className="w-3 h-3" />
              </Button>
            </div>

            {/* Message bubble */}
            <div
              className={cn(
                "relative max-w-xs lg:max-w-md px-3 py-2 rounded-lg shadow-sm transition-all duration-200 hover:shadow-md",
                isOwn
                  ? "bg-[#dcf8c6] text-gray-900 rounded-br-none hover:bg-[#d4f4c1]"
                  : "bg-white text-gray-900 rounded-bl-none hover:bg-gray-50",
                // WhatsApp-like tail effect
                isLastInGroup &&
                  isOwn &&
                  "after:content-[''] after:absolute after:top-0 after:-right-2 after:w-0 after:h-0 after:border-l-8 after:border-l-[#dcf8c6] after:border-t-8 after:border-t-transparent",
                isLastInGroup &&
                  !isOwn &&
                  "after:content-[''] after:absolute after:top-0 after:-left-2 after:w-0 after:h-0 after:border-r-8 after:border-r-white after:border-t-8 after:border-t-transparent",
                // Animation classes
                "animate-in slide-in-from-bottom-2 duration-300",
              )}
            >
              {renderMessageContent()}

              {/* Message reactions */}
              {(message.reactions && message.reactions.length > 0) ||
              onReaction ? (
                <MessageReactions
                  messageId={message._id}
                  reactions={
                    message.reactions?.map((r) => ({
                      emoji: r.emoji,
                      userId: r.userId,
                      userName: "User", // This would come from user data
                      createdAt: r.createdAt,
                    })) || []
                  }
                  onAddReaction={onReaction || (() => {})}
                  onRemoveReaction={onRemoveReaction || (() => {})}
                  currentUserId={currentUserId || ""}
                  className="mt-1"
                />
              ) : null}

              {/* Timestamp and status */}
              <div
                className={cn(
                  "flex items-center justify-end space-x-1 mt-1",
                  "text-gray-500 text-xs",
                )}
              >
                {showTimestamp && (
                  <span className="transition-colors duration-200">
                    {format(new Date(message.createdAt), "HH:mm")}
                  </span>
                )}
                <div className="transition-transform duration-200 hover:scale-110">
                  {getStatusIcon()}
                </div>
              </div>

              {isOwn && message.status === "failed" && onResend ? (
                <div className="mt-2 flex items-center justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onResend(message)}
                    className="h-7 px-2 text-[11px]"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Resend
                  </Button>
                </div>
              ) : null}
            </div>
          </div>

          {/* ── Persistent reply arrow (received messages: right side) ── */}
          {!isOwn && onReply && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReply(message);
              }}
              className="shrink-0 ml-1 p-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-600 active:scale-90 transition-all duration-150 border border-gray-200"
              title="Reply"
              aria-label="Reply to message"
            >
              <CornerDownRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Spacer for sent messages to maintain alignment */}
        {isOwn && <div className="w-8" />}
      </div>

      {/* Image Modal */}
      <ImageModal
        isOpen={showImageModal}
        onClose={() => setShowImageModal(false)}
        imageUrl={selectedImageUrl}
        filename={message.attachments?.[0]?.filename}
      />
    </>
  );
}

// Typing indicator component
export function TypingIndicator({
  user,
  className,
}: {
  user: { firstName: string; lastName: string; avatar?: string };
  className?: string;
}) {
  return (
    <div className={cn("flex items-end space-x-2 mb-4", className)}>
      <Avatar className="w-8 h-8 shrink-0">
        <AvatarImage src={user.avatar} />
        <AvatarFallback className="text-xs">
          {user.firstName[0]}
          {user.lastName[0]}
        </AvatarFallback>
      </Avatar>

      <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm animate-in slide-in-from-bottom-2 duration-300">
        <div className="flex space-x-1">
          <div
            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <div
            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <div
            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      </div>
    </div>
  );
}
