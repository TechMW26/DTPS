"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ChatBubble, TypingIndicator, type ChatMessage } from "./ChatBubble";
import { ChatInput } from "./ChatInput";
import { useRealtime } from "@/hooks/useRealtime";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { useCallManager } from "@/hooks/useCallManager";
import { CallInterface } from "@/components/call/CallInterface";
import { useNotifications } from "@/hooks/useNotifications";
import Image from "next/image";
import { uploadFileReliably } from "@/lib/client-upload";

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

type ChatAttachment = NonNullable<ChatMessage["attachments"]>[number];

interface SendMessageOptions {
  replaceMessageId?: string;
  skipOptimistic?: boolean;
}

type SendableMessageType =
  | "text"
  | "image"
  | "file"
  | "video"
  | "audio"
  | "voice";

interface FailedMediaDraft {
  blob?: Blob;
  file?: File;
  attachment: ChatAttachment;
  messageType: "image" | "video" | "audio" | "voice" | "file";
}

export function ChatInterface({
  recipient,
  onBack,
  className,
  onUserStatusChange,
}: ChatInterfaceProps) {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [replyingToMessage, setReplyingToMessage] =
    useState<ChatMessage | null>(null);

  // Call management (incoming calls only — outbound call buttons removed)
  const {
    callState,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
  } = useCallManager();

  // Notifications
  const { showMessageNotification } = useNotifications();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const failedMediaDraftsRef = useRef<Map<string, FailedMediaDraft>>(new Map());

  const clearFailedMediaDraft = useCallback((messageId: string) => {
    const draft = failedMediaDraftsRef.current.get(messageId);
    if (draft?.attachment.url?.startsWith("blob:")) {
      URL.revokeObjectURL(draft.attachment.url);
    }
    failedMediaDraftsRef.current.delete(messageId);
  }, []);

  const clearAllFailedMediaDrafts = useCallback(() => {
    failedMediaDraftsRef.current.forEach((draft) => {
      if (draft.attachment.url?.startsWith("blob:")) {
        URL.revokeObjectURL(draft.attachment.url);
      }
    });
    failedMediaDraftsRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      clearAllFailedMediaDrafts();
    };
  }, [clearAllFailedMediaDrafts]);

  // Real-time connection
  const { onlineUsers, sendTyping } = useRealtime({
    onMessage: (event) => {
      if (event.type === "new_message") {
        const newMessage = event.data.message;
        if (
          newMessage.sender._id === recipient._id ||
          newMessage.receiver._id === recipient._id
        ) {
          setMessages((prev) => {
            if (prev.some((msg) => msg._id === newMessage._id)) {
              return prev;
            }
            return [...prev, newMessage];
          });
          scrollToBottom(); // Only scroll if user is near bottom (new incoming message)

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
                recipient._id,
              );
            }
          }
        }
      } else if (event.type === "message_status_update") {
        const { messageId, status } = event.data;
        setMessages((prev) =>
          prev.map((msg) => (msg._id === messageId ? { ...msg, status } : msg)),
        );
      }
    },
    onTyping: ({ userId, isTyping }) => {
      if (userId === recipient._id) {
        setTypingUsers((prev) => {
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
    },
  });

  // Check if user is near the bottom of the chat (within 150px)
  const isNearBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    return container.scrollHeight - container.scrollTop - container.clientHeight < 150;
  }, []);

  // Scroll to bottom — only if user is already near the bottom (prevents yanking)
  const scrollToBottom = useCallback((force = false) => {
    if (force || isNearBottom()) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isNearBottom]);

  // Mark messages as read
  const markMessagesAsRead = useCallback(async () => {
    try {
      await fetch(`/api/messages/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationWith: recipient._id,
          status: "read",
        }),
      });
    } catch (error) {
      console.error("Failed to mark messages as read:", error);
    }
  }, [recipient._id]);

  // Load messages
  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/messages?conversationWith=${recipient._id}`,
      );
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
        setTimeout(() => scrollToBottom(true), 100);

        // Mark messages as read
        markMessagesAsRead();
      }
    } catch (error) {
      console.error("Failed to load messages:", error);
    } finally {
      setLoading(false);
    }
  }, [markMessagesAsRead, recipient._id, scrollToBottom]);

  // Mark single message as read
  const markMessageAsRead = useCallback(async (messageId: string) => {
    try {
      await fetch(`/api/messages/${messageId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "read" }),
      });
    } catch (error) {
      console.error("Failed to mark message as read:", error);
    }
  }, []);

  // Send message
  const sendMessageToApi = useCallback(
    async (
      content: string,
      type: "text" | "image" | "file" | "video" | "audio" | "voice",
      attachments?: ChatAttachment[],
      replyTo?: string,
    ): Promise<ChatMessage> => {
      const body = {
        recipientId: recipient._id,
        content,
        type,
        attachments,
        ...(replyTo ? { replyTo } : {}),
      };

      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to send message");
      }

      return response.json();
    },
    [recipient._id],
  );

  const uploadMediaDraft = useCallback(
    async (draft: FailedMediaDraft): Promise<ChatAttachment> => {
      const fileToUpload =
        draft.file ||
        (draft.blob
          ? new File(
              [draft.blob],
              draft.attachment.filename || `media_${Date.now()}`,
              { type: draft.attachment.mimeType || "application/octet-stream" },
            )
          : null);

      if (!fileToUpload) {
        throw new Error("No media file available for upload retry");
      }

      const draftMimeType = (
        draft.attachment.mimeType ||
        fileToUpload.type ||
        "application/octet-stream"
      ).toLowerCase();

      // For audio voice drafts, ensure proper file extension
      const isAudio =
        draft.messageType === "voice" || draft.messageType === "audio";
      let fileToUse = fileToUpload;
      if (isAudio && draft.blob) {
        const fileExtension =
          draftMimeType.includes("mp4") ||
          draftMimeType.includes("m4a") ||
          draftMimeType.includes("aac")
            ? "m4a"
            : draftMimeType.includes("webm")
              ? "webm"
              : draftMimeType.includes("ogg") || draftMimeType.includes("opus")
                ? "ogg"
                : draftMimeType.includes("wav")
                  ? "wav"
                  : "webm";

        fileToUse = new File(
          [draft.blob],
          `voice_${Date.now()}.${fileExtension}`,
          { type: draft.attachment.mimeType || "audio/webm" },
        );
      }

      const uploadData = await uploadFileReliably(fileToUse, "message");

      // Normalize MIME type: strip codec suffix so browsers don't reject
      const normalizedMimeType = (
        uploadData.type ||
        fileToUse.type ||
        draft.attachment.mimeType ||
        "application/octet-stream"
      )
        .replace(/;.*$/, "")
        .trim();

      return {
        url: uploadData.url,
        fileId: uploadData.fileId,
        filename: uploadData.filename || fileToUse.name,
        size: uploadData.size || fileToUse.size,
        mimeType: normalizedMimeType,
        duration: draft.attachment.duration,
        width: draft.attachment.width,
        height: draft.attachment.height,
      };
    },
    [],
  );

  // Keep backward compatibility alias
  const uploadVoiceDraft = uploadMediaDraft;

  const replaceMessageWithServerVersion = useCallback(
    (localId: string, sentMessage: ChatMessage) => {
      clearFailedMediaDraft(localId);

      setMessages((prev) => {
        const withoutLocalAndDuplicates = prev.filter(
          (msg) => msg._id !== localId && msg._id !== sentMessage._id,
        );
        return [
          ...withoutLocalAndDuplicates,
          { ...sentMessage, status: "sent" },
        ];
      });
    },
    [clearFailedMediaDraft],
  );

  const handleCreateVoicePlaceholder = useCallback(
    (payload: { content: string; attachment: ChatAttachment }) => {
      if (!session?.user?.id) {
        return "";
      }

      const tempMessageId = `temp-voice-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const tempMessage: ChatMessage = {
        _id: tempMessageId,
        content: payload.content,
        type: "voice",
        attachments: [payload.attachment],
        sender: {
          _id: session.user.id,
          firstName: session.user.firstName,
          lastName: session.user.lastName,
          avatar: session.user.avatar,
        },
        receiver: recipient,
        isRead: false,
        createdAt: new Date().toISOString(),
        status: "sending",
      };

      failedMediaDraftsRef.current.set(tempMessageId, {
        attachment: payload.attachment,
        messageType: "voice",
      });

      setMessages((prev) => [...prev, tempMessage]);
      scrollToBottom(true);
      return tempMessageId;
    },
    [recipient, scrollToBottom, session?.user],
  );

  const handleCreateMediaPlaceholder = useCallback(
    (payload: {
      content: string;
      attachment: ChatAttachment;
      messageType: "image" | "video" | "audio" | "file";
    }) => {
      if (!session?.user?.id) {
        return "";
      }

      const tempMessageId = `temp-media-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const tempMessage: ChatMessage = {
        _id: tempMessageId,
        content: payload.content,
        type: payload.messageType,
        attachments: [payload.attachment],
        sender: {
          _id: session.user.id,
          firstName: session.user.firstName,
          lastName: session.user.lastName,
          avatar: session.user.avatar,
        },
        receiver: recipient,
        isRead: false,
        createdAt: new Date().toISOString(),
        status: "sending",
      };

      // Don't store blob here yet — that's done on failure
      failedMediaDraftsRef.current.set(tempMessageId, {
        attachment: payload.attachment,
        messageType: payload.messageType,
      });

      setMessages((prev) => [...prev, tempMessage]);
      scrollToBottom(true);
      return tempMessageId;
    },
    [recipient, scrollToBottom, session?.user],
  );

  const handleMediaUploadFailed = useCallback(
    (payload: {
      messageId: string;
      error: string;
      file: File;
      attachment: ChatAttachment;
      messageType: "image" | "video" | "audio" | "file";
    }) => {
      if (!payload.messageId) {
        return;
      }

      failedMediaDraftsRef.current.set(payload.messageId, {
        file: payload.file,
        attachment: payload.attachment,
        messageType: payload.messageType,
      });

      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === payload.messageId
            ? {
                ...msg,
                status: "failed",
                content: `${payload.messageType.charAt(0).toUpperCase() + payload.messageType.slice(1)} upload failed. Tap resend.`,
                attachments: [payload.attachment],
              }
            : msg,
        ),
      );
    },
    [],
  );

  const handleVoiceUploadFailed = useCallback(
    (payload: {
      messageId: string;
      error: string;
      blob: Blob;
      attachment: ChatAttachment;
    }) => {
      if (!payload.messageId) {
        return;
      }

      failedMediaDraftsRef.current.set(payload.messageId, {
        blob: payload.blob,
        attachment: payload.attachment,
        messageType: "voice",
      });

      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === payload.messageId
            ? {
                ...msg,
                status: "failed",
                content: "Voice upload failed. Tap resend.",
                attachments: [payload.attachment],
              }
            : msg,
        ),
      );
    },
    [],
  );

  const handleSendMessage = async (
    content: string,
    type: "text" | "image" | "file" | "video" | "audio" | "voice" = "text",
    attachments?: ChatAttachment[],
    options?: SendMessageOptions & { replyTo?: string },
  ) => {
    if (!session?.user?.id) {
      return;
    }

    // For text messages, require content. For media messages, allow sending with attachments
    const hasContent = content.trim().length > 0;
    const hasAttachments = attachments && attachments.length > 0;

    if (!hasContent && !hasAttachments) return;

    const tempMessageId =
      options?.replaceMessageId ||
      `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const shouldCreateOptimistic =
      !options?.replaceMessageId && !options?.skipOptimistic;
    const replyToId = options?.replyTo || replyingToMessage?._id;

    try {
      if (shouldCreateOptimistic) {
        const tempMessage: ChatMessage = {
          _id: tempMessageId,
          content,
          type,
          attachments,
          sender: {
            _id: session.user.id,
            firstName: session.user.firstName,
            lastName: session.user.lastName,
            avatar: session.user.avatar,
          },
          receiver: recipient,
          isRead: false,
          createdAt: new Date().toISOString(),
          status: "sending",
          replyTo: replyToId
            ? ({
                _id: replyToId,
                content: "",
                type: "text",
                sender: { _id: "", firstName: "", lastName: "" },
                receiver: { _id: "", firstName: "", lastName: "" },
                isRead: false,
                createdAt: "",
                status: "sent",
              } as any)
            : undefined,
        };

        if (replyToId) {
          tempMessage.replyTo =
            messages.find((msg) => msg._id === replyToId) || undefined;
        }

        setMessages((prev) => [...prev, tempMessage]);
        scrollToBottom(true);
      } else if (options?.replaceMessageId) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg._id === options.replaceMessageId
              ? { ...msg, status: "sending", content, attachments }
              : msg,
          ),
        );
      }

      const sentMessage = await sendMessageToApi(
        content,
        type,
        attachments,
        replyToId,
      );
      replaceMessageWithServerVersion(tempMessageId, sentMessage);

      if (replyToId) {
        clearReply();
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      // Mark message as failed
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === tempMessageId ? { ...msg, status: "failed" } : msg,
        ),
      );
    }
  };

  const handleResendMessage = useCallback(
    async (message: ChatMessage) => {
      if (!session?.user?.id || message.status !== "failed") {
        return;
      }

      const normalizeSendableType = (
        type: ChatMessage["type"],
      ): SendableMessageType => {
        switch (type) {
          case "image":
          case "file":
          case "video":
          case "audio":
          case "voice":
            return type;
          default:
            return "text";
        }
      };

      const failedMediaDraft = failedMediaDraftsRef.current.get(message._id);
      const requiresUploadRetry = Boolean(
        failedMediaDraft?.blob || failedMediaDraft?.file,
      );
      const isVoiceRetry =
        requiresUploadRetry && failedMediaDraft?.messageType === "voice";

      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === message._id
            ? {
                ...msg,
                status: "sending",
                content: requiresUploadRetry
                  ? isVoiceRetry
                    ? "Sending voice..."
                    : `Uploading ${failedMediaDraft?.messageType || "media"}...`
                  : msg.content,
              }
            : msg,
        ),
      );

      try {
        let resendContent = message.content;
        let resendType: SendableMessageType = normalizeSendableType(
          message.type,
        );
        let resendAttachments = message.attachments;

        if (requiresUploadRetry && failedMediaDraft) {
          const uploadedAttachment = await uploadMediaDraft(failedMediaDraft);
          resendContent = isVoiceRetry
            ? "Voice message"
            : message.content || uploadedAttachment.filename;
          resendType = failedMediaDraft.messageType as SendableMessageType;
          resendAttachments = [uploadedAttachment];
        }

        const sentMessage = await sendMessageToApi(
          resendContent,
          resendType,
          resendAttachments,
        );
        replaceMessageWithServerVersion(message._id, sentMessage);
      } catch (error) {
        console.error("Failed to resend message:", error);
        setMessages((prev) =>
          prev.map((msg) =>
            msg._id === message._id
              ? {
                  ...msg,
                  status: "failed",
                  content: requiresUploadRetry
                    ? isVoiceRetry
                      ? "Voice upload failed. Tap resend."
                      : "Upload failed. Tap resend."
                    : msg.content,
                }
              : msg,
          ),
        );
      }
    },
    [
      replaceMessageWithServerVersion,
      sendMessageToApi,
      session?.user?.id,
      uploadMediaDraft,
    ],
  );

  // Handle typing
  const handleTyping = (isTyping: boolean) => {
    sendTyping(recipient._id, isTyping);
  };

  const clearReply = useCallback(() => {
    setReplyingToMessage(null);
  }, []);

  const handleReplyToMessage = useCallback((message: ChatMessage) => {
    setReplyingToMessage(message);
  }, []);

  const getReplyPreviewText = useCallback((message: ChatMessage) => {
    if (message.type === "image") return "Photo";
    if (message.type === "video") return "Video";
    if (message.type === "audio" || message.type === "voice")
      return "Voice message";
    if (message.type === "file")
      return message.attachments?.[0]?.filename || "Document";
    return (message.content || "").trim() || "Message";
  }, []);

  // Load messages on mount
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Group messages by sender and time
  const groupedMessages = messages.reduce(
    (groups: ChatMessage[][], message, index) => {
      const prevMessage = messages[index - 1];
      const isSameSender = prevMessage?.sender._id === message.sender._id;
      const timeDiff = prevMessage
        ? new Date(message.createdAt).getTime() -
          new Date(prevMessage.createdAt).getTime()
        : Infinity;
      const isWithinTimeWindow = timeDiff < 5 * 60 * 1000; // 5 minutes

      if (isSameSender && isWithinTimeWindow) {
        groups[groups.length - 1].push(message);
      } else {
        groups.push([message]);
      }

      return groups;
    },
    [],
  );

  const isRecipientOnline = onlineUsers.includes(recipient._id);
  const isRecipientTyping = typingUsers.has(recipient._id);

  return (
    <div className={cn("flex flex-col h-full bg-[#e5ddd5]", className)}>
      {/* Chat header */}
      <div className="bg-[#075e54] text-white px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          {onBack && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="p-2 text-white hover:bg-white/10"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}

          <div className="relative">
            <Avatar className="w-10 h-10">
              <AvatarImage src={recipient.avatar} />
              <AvatarFallback className="bg-white/20 text-white">
                {recipient.firstName[0]}
                {recipient.lastName[0]}
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
                <span className="text-xs text-white/70">
                  last seen recently
                </span>
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
              style={{ height: "auto" }}
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
                    onResend={handleResendMessage}
                    onReply={handleReplyToMessage}
                  />
                ))}
              </div>
            ))}

            {isRecipientTyping && <TypingIndicator user={recipient} />}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Chat input */}
      <ChatInput
        onSendMessage={handleSendMessage}
        onCreateVoicePlaceholder={handleCreateVoicePlaceholder}
        onVoiceUploadFailed={handleVoiceUploadFailed}
        onCreateMediaPlaceholder={handleCreateMediaPlaceholder}
        onMediaUploadFailed={handleMediaUploadFailed}
        onTyping={handleTyping}
        disabled={!session?.user?.id}
        placeholder={`Message ${recipient.firstName}...`}
        recipientId={recipient._id}
        replyToMessage={replyingToMessage || undefined}
        onCancelReply={clearReply}
      />

      {/* Call Interface */}
      {callState.isInCall && (
        <CallInterface
          callId={callState.callId!}
          localUser={{
            id: session?.user.id || "",
            name: `${session?.user.firstName} ${session?.user.lastName}`,
            avatar: session?.user.avatar,
          }}
          remoteUser={
            callState.isIncoming
              ? callState.caller!
              : callState.receiver || {
                  id: recipient._id,
                  name: `${recipient.firstName} ${recipient.lastName}`,
                  avatar: recipient.avatar,
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
