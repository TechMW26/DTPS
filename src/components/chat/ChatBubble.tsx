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
  Eye,
} from "lucide-react";
import { VoiceNotePlayer } from "./VoiceNotePlayer";
import { ImageModal } from "./ImageModal";
import { MessageReactions } from "./MessageReactions";
import { DocumentViewerModal } from "./DocumentViewerModal";
import {
  getMediaKind,
  getMediaProxyUrl,
  getMediaUrl,
  isViewableDocument,
  normalizeMediaUrl,
} from "@/lib/media";

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
    fileId?: string;
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
  const [imageErrors, setImageErrors] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [imageRetryCount, setImageRetryCount] = useState<Map<string, number>>(
    new Map(),
  );
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState("");
  const [showDocModal, setShowDocModal] = useState(false);
  const [docModalUrl, setDocModalUrl] = useState("");
  const [docModalFilename, setDocModalFilename] = useState("");
  const [docModalMimeType, setDocModalMimeType] = useState("");

  // Open document in lightbox modal
  const openDocumentViewer = (
    attachmentUrl: string,
    filename: string,
    mimeType: string,
  ) => {
    setDocModalUrl(normalizeMediaUrl(attachmentUrl));
    setDocModalFilename(filename);
    setDocModalMimeType(mimeType);
    setShowDocModal(true);
  };

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
      const attachmentUrl = getMediaUrl(attachment);
      const mediaKind = getMediaKind(
        attachment.filename,
        attachment.mimeType,
        attachmentUrl,
      );
      const resolvedMessageType =
        message.type === "text" || message.type === "file"
          ? ["image", "video", "audio"].includes(mediaKind)
            ? mediaKind
            : "file"
          : message.type;

      switch (resolvedMessageType) {
        case "image": {
          const imageKey = attachmentUrl;
          const hasError = imageErrors.get(imageKey) || false;
          const retries = imageRetryCount.get(imageKey) || 0;

          const cacheBust = () =>
            `ts=${Math.floor(Date.now() / 600000)}&retry=${retries}`;

          const handleImageError = () => {
            const currentRetries = imageRetryCount.get(imageKey) || 0;
            console.error(
              `[ChatBubble] Image load failed (attempt ${currentRetries + 1}):`,
              attachmentUrl,
            );

            if (currentRetries === 0) {
              // First failure: try via image proxy with cache-bust
              setImageRetryCount((prev) => {
                const next = new Map(prev);
                next.set(imageKey, 1);
                return next;
              });
            } else if (currentRetries === 1) {
              // Second failure: try the direct CDN URL with cache-bust.
              setImageRetryCount((prev) => {
                const next = new Map(prev);
                next.set(imageKey, 2);
                return next;
              });
            } else if (currentRetries === 2) {
              // Third failure: try a second proxy pass (some WebViews need it)
              setImageRetryCount((prev) => {
                const next = new Map(prev);
                next.set(imageKey, 3);
                return next;
              });
            } else {
              // Fourth+ failure: give up
              setImageErrors((prev) => {
                const next = new Map(prev);
                next.set(imageKey, true);
                return next;
              });
            }
          };

          const handleImageLoad = () => {
            // Clear any error state on successful load
            setImageErrors((prev) => {
              if (!prev.has(imageKey)) return prev;
              const next = new Map(prev);
              next.delete(imageKey);
              return next;
            });
          };

          const handleRetry = () => {
            setImageErrors((prev) => {
              const next = new Map(prev);
              next.delete(imageKey);
              return next;
            });
            setImageRetryCount((prev) => {
              const next = new Map(prev);
              next.set(imageKey, 0);
              return next;
            });
          };

          // Determine image source based on retry count
          const getImageSrc = () => {
            const ts = cacheBust();
            if (retries === 0 && attachment.thumbnail) {
              const thumbUrl = getMediaProxyUrl(attachment.thumbnail);
              return `${thumbUrl}${thumbUrl.includes("?") ? "&" : "?"}${ts}`;
            }
            if (retries >= 2) {
              // Direct CDN URL with cache-bust.
              const direct = normalizeMediaUrl(attachmentUrl);
              if (direct && /^https?:\/\//i.test(direct)) {
                return `${direct}${direct.includes("?") ? "&" : "?"}${ts}`;
              }
            }
            const proxyUrl = getMediaProxyUrl(attachmentUrl);
            return `${proxyUrl}${proxyUrl.includes("?") ? "&" : "?"}${ts}`;
          };

          return (
            <div className="relative max-w-xs">
              {!hasError ? (
                <div
                  className="cursor-pointer group relative"
                  onClick={() =>
                    handleImageClick(getMediaProxyUrl(attachmentUrl))
                  }
                >
                  <img
                    src={getImageSrc()}
                    alt={attachment.filename}
                    className="rounded-lg max-w-full transition-opacity group-hover:opacity-90"
                    onError={handleImageError}
                    onLoad={handleImageLoad}
                    style={{
                      width: "250px",
                      aspectRatio: "4 / 3",
                      objectFit: "cover",
                      maxHeight: "300px",
                    }}
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
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
                  <p className="text-sm mb-2">Failed to load image</p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRetry();
                    }}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium underline"
                  >
                    Tap to retry
                  </button>
                </div>
              )}
            </div>
          );
        }

        case "video": {
          const videoKey = attachmentUrl;
          const videoHasError = imageErrors.get(videoKey) || false;
          const videoRetries = imageRetryCount.get(videoKey) || 0;

          const handleVideoError = () => {
            const current = imageRetryCount.get(videoKey) || 0;
            console.error(
              `[ChatBubble] Video load failed (attempt ${current + 1}):`,
              attachmentUrl,
            );
            if (current < 2) {
              setImageRetryCount((prev) => {
                const next = new Map(prev);
                next.set(videoKey, current + 1);
                return next;
              });
            } else {
              setImageErrors((prev) => {
                const next = new Map(prev);
                next.set(videoKey, true);
                return next;
              });
            }
          };

          const handleVideoRetry = () => {
            setImageErrors((prev) => {
              const next = new Map(prev);
              next.delete(videoKey);
              return next;
            });
            setImageRetryCount((prev) => {
              const next = new Map(prev);
              next.set(videoKey, 0);
              return next;
            });
          };

          const getVideoSrc = () => {
            const ts = `ts=${Math.floor(Date.now() / 600000)}&retry=${videoRetries}`;
            const proxy = getMediaProxyUrl(attachmentUrl);
            return `${proxy}${proxy.includes("?") ? "&" : "?"}${ts}`;
          };

          return (
            <div className="relative max-w-xs">
              {!videoHasError ? (
                <video
                  key={`${videoKey}-${videoRetries}`}
                  src={getVideoSrc()}
                  controls
                  playsInline
                  crossOrigin="anonymous"
                  className="rounded-lg max-w-full h-auto"
                  style={{ maxHeight: "300px", maxWidth: "250px" }}
                  poster={
                    attachment.thumbnail
                      ? getMediaProxyUrl(attachment.thumbnail)
                      : undefined
                  }
                  onError={handleVideoError}
                >
                  Your browser does not support the video tag.
                </video>
              ) : (
                <div
                  className="bg-gray-100 rounded-lg p-4 text-center text-gray-500"
                  style={{ maxHeight: "300px", maxWidth: "250px" }}
                >
                  <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm mb-2">Failed to load video</p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleVideoRetry();
                    }}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium underline"
                  >
                    Tap to retry
                  </button>
                </div>
              )}
              <div className="mt-1 text-xs opacity-75">
                {attachment.filename} • {formatFileSize(attachment.size)}
                {attachment.duration &&
                  ` • ${Math.floor(attachment.duration / 60)}:${(attachment.duration % 60).toString().padStart(2, "0")}`}
              </div>
            </div>
          );
        }

        case "audio":
        case "voice": {
          const voiceLabel =
            message.type === "voice"
              ? message.content && message.content !== "Voice message"
                ? message.content
                : "Voice message"
              : attachment.filename;

          // Normalize MIME type: strip codec suffix (e.g. "audio/webm;codecs=opus" → "audio/webm")
          // so the browser's <source> type check doesn't reject the CDN-served Content-Type.
          const normalizedMimeType = (attachment.mimeType || "audio/mpeg")
            .replace(/;.*$/, "")
            .trim();

          return (
            <div className="max-w-70 min-w-50">
              <VoiceNotePlayer
                audioUrl={getMediaProxyUrl(attachmentUrl)}
                mimeType={normalizedMimeType}
                duration={attachment.duration}
              />
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

        case "file": {
          const isViewable = isViewableDocument(
            attachment.filename,
            attachment.mimeType,
            attachmentUrl,
          );
          const isPdf =
            attachment.mimeType === "application/pdf" ||
            (attachment.filename || "").endsWith(".pdf");
          const previewUrl = isPdf
            ? `${getMediaProxyUrl(attachmentUrl)}#page=1&toolbar=0&navpanes=0&scrollbar=0`
            : "";

          const handleFileClick = () => {
            if (isViewable) {
              openDocumentViewer(
                attachmentUrl,
                attachment.filename,
                attachment.mimeType,
              );
            } else {
              window.open(
                getMediaProxyUrl(attachmentUrl),
                "_blank",
                "noopener,noreferrer",
              );
            }
          };
          return (
            <div
              className="bg-gray-50 rounded-lg border overflow-hidden w-full max-w-xs sm:max-w-md lg:max-w-lg cursor-pointer"
              onClick={handleFileClick}
            >
              {/* PDF first-page preview */}
              {isPdf && previewUrl && (
                <div className="w-full h-36 bg-gray-200 relative overflow-hidden">
                  <iframe
                    src={previewUrl}
                    className="w-[200%] h-[200%] absolute top-0 left-0 scale-50 origin-top-left pointer-events-none"
                    title={attachment.filename}
                  />
                </div>
              )}

              {/* File info row */}
              <div className="p-3 flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {attachment.filename.length > 28
                      ? attachment.filename.slice(0, 22) +
                        "..." +
                        attachment.filename.slice(-8)
                      : attachment.filename}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(attachment.size)}
                  </p>
                </div>
              </div>

              {/* Action button — full width */}
              <button
                type="button"
                className={`w-full px-3 py-2 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors border-t ${
                  isViewable
                    ? "text-blue-600 hover:bg-blue-50"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {isViewable ? (
                  <>
                    <Eye className="w-4 h-4" /> View Document
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" /> Download File
                  </>
                )}
              </button>
            </div>
          );
        }
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

      {/* Document Viewer Modal */}
      <DocumentViewerModal
        isOpen={showDocModal}
        onClose={() => setShowDocModal(false)}
        url={docModalUrl}
        filename={docModalFilename}
        mimeType={docModalMimeType}
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
