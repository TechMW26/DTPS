"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import type { EmojiClickData } from "emoji-picker-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Send, Paperclip, Smile, Mic, X, Image } from "lucide-react";
import { MediaUploadModal } from "./MediaUploadModal";
import { VoiceRecorder } from "./VoiceRecorder";
import { toast } from "sonner";

// Dynamic import for emoji picker to avoid SSR issues
const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

interface ChatAttachment {
  url: string;
  fileId?: string;
  filename: string;
  size: number;
  mimeType: string;
  thumbnail?: string;
  duration?: number;
  width?: number;
  height?: number;
}

interface SendMessageOptions {
  replaceMessageId?: string;
  skipOptimistic?: boolean;
}

interface ChatInputProps {
  onSendMessage: (
    content: string,
    type?: "text" | "image" | "file" | "video" | "audio" | "voice",
    attachments?: ChatAttachment[],
    options?: SendMessageOptions & { replyTo?: string },
  ) => Promise<void> | void;
  onCreateVoicePlaceholder?: (payload: {
    content: string;
    attachment: ChatAttachment;
  }) => string;
  onVoiceUploadFailed?: (payload: {
    messageId: string;
    error: string;
    blob: Blob;
    attachment: ChatAttachment;
  }) => void;
  onMediaUploadFailed?: (payload: {
    messageId: string;
    error: string;
    file: File;
    attachment: ChatAttachment;
    messageType: "image" | "video" | "audio" | "file";
  }) => void;
  onCreateMediaPlaceholder?: (payload: {
    content: string;
    attachment: ChatAttachment;
    messageType: "image" | "video" | "audio" | "file";
  }) => string;
  onTyping?: (isTyping: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  recipientId?: string; // Add recipient ID for voice messages
  replyToMessage?: {
    _id: string;
    content: string;
    type: string;
    attachments?: ChatAttachment[];
    sender: { firstName: string; lastName: string };
  };
  onCancelReply?: () => void;
}

export function ChatInput({
  onSendMessage,
  onCreateVoicePlaceholder,
  onVoiceUploadFailed,
  onMediaUploadFailed,
  onCreateMediaPlaceholder,
  onTyping,
  disabled = false,
  placeholder = "Type a message...",
  className,
  replyToMessage,
  onCancelReply,
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMediaUpload, setShowMediaUpload] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Handle emoji selection
  const handleEmojiSelect = (emojiData: EmojiClickData) => {
    const emoji = emojiData.emoji;
    setMessage((prev) => prev + emoji);
    setShowEmojiPicker(false);

    // Focus back to textarea
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  };

  // Handle media upload
  const handleMediaUpload = async (file: File, caption?: string) => {
    let placeholderMessageId = "";
    let fileForUpload = file;
    let localAttachment: ChatAttachment | undefined;

    // Determine message type based on file type (hoisted for catch-block access)
    let messageType: "image" | "video" | "audio" | "file" = "file";
    if (file.type.startsWith("image/")) messageType = "image";
    else if (file.type.startsWith("video/")) messageType = "video";
    else if (file.type.startsWith("audio/")) messageType = "audio";

    try {
      // Client-side compression for images to speed up upload & reduce failures
      if (messageType === "image" && file.size > 200 * 1024) {
        try {
          const { compressImage } = await import("@/lib/imageCompression");
          const compressed = await compressImage(file, {
            maxWidth: 1600,
            maxHeight: 1600,
            quality: 0.85,
            format: "image/jpeg",
          });
          fileForUpload = new File(
            [compressed.blob],
            file.name.replace(/\.[^.]+$/, ".jpg"),
            { type: "image/jpeg" },
          );
        } catch (compressionErr) {
          // If compression fails, proceed with original file
          console.warn(
            "[ChatInput] Image compression failed, using original:",
            compressionErr,
          );
        }
      }

      // Create placeholder for retry support
      localAttachment = {
        url: URL.createObjectURL(fileForUpload),
        filename: fileForUpload.name,
        size: fileForUpload.size,
        mimeType: fileForUpload.type,
      };

      if (onCreateMediaPlaceholder) {
        placeholderMessageId = onCreateMediaPlaceholder({
          content: caption || file.name,
          attachment: localAttachment,
          messageType,
        });
      }

      // Upload file to server
      const formData = new FormData();
      formData.append("file", fileForUpload);
      formData.append("type", "message");

      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        // Try to parse error message from response
        let errorMessage = "Failed to upload file";
        try {
          const errorData = await uploadResponse.json();
          errorMessage = errorData.error || errorMessage;

          // Show downtime toast for media service outages
          if (errorData.code === "MEDIA_SERVICE_DOWN") {
            toast.error("Media uploads temporarily unavailable", {
              description:
                "Our media service is experiencing downtime. Your chats and messages still work — media uploads will resume shortly.",
              duration: 8000,
            });
          }
        } catch {
          // If response isn't JSON, use status text
          if (uploadResponse.status === 413) {
            errorMessage = "File is too large. Please select a smaller file.";
          } else if (uploadResponse.status === 400) {
            errorMessage = "Invalid file type. Please select a supported file.";
          } else if (uploadResponse.status === 401) {
            errorMessage = "Session expired. Please refresh and try again.";
          } else if (uploadResponse.status >= 500) {
            errorMessage = "Server error. Please try again later.";
          }
        }
        throw new Error(errorMessage);
      }

      const uploadData = await uploadResponse.json();

      // Create attachment data
      const attachment = {
        url: uploadData.url,
        fileId: uploadData.fileId,
        filename: uploadData.filename || fileForUpload.name,
        size: uploadData.size || fileForUpload.size,
        mimeType: uploadData.type || fileForUpload.type,
      };

      // Send message with attachment data
      await onSendMessage(caption || file.name, messageType, [attachment]);

      setShowMediaUpload(false);
    } catch (error) {
      console.error("Error uploading media:", error);

      // Notify parent for retry support
      if (placeholderMessageId && onMediaUploadFailed && localAttachment) {
        onMediaUploadFailed({
          messageId: placeholderMessageId,
          error: error instanceof Error ? error.message : "Upload failed",
          file: fileForUpload,
          attachment: localAttachment,
          messageType,
        });
      }

      throw error;
    }
  };

  // Handle voice recording
  const handleVoiceRecording = async (audioBlob: Blob) => {
    let placeholderMessageId = "";
    let localAttachment: ChatAttachment | undefined;

    try {
      const getAudioDuration = async (
        blob: Blob,
      ): Promise<number | undefined> => {
        return new Promise((resolve) => {
          const previewUrl = URL.createObjectURL(blob);
          const audioElement = document.createElement("audio");

          audioElement.preload = "metadata";
          audioElement.onloadedmetadata = () => {
            const duration = Number.isFinite(audioElement.duration)
              ? Math.max(1, Math.round(audioElement.duration))
              : undefined;
            URL.revokeObjectURL(previewUrl);
            resolve(duration);
          };
          audioElement.onerror = () => {
            URL.revokeObjectURL(previewUrl);
            resolve(undefined);
          };

          audioElement.src = previewUrl;
        });
      };

      const detectVoiceExtension = (mimeType: string) => {
        const normalized = mimeType.toLowerCase();
        if (
          normalized.includes("mp4") ||
          normalized.includes("m4a") ||
          normalized.includes("aac")
        )
          return "m4a";
        if (normalized.includes("webm")) return "webm";
        if (normalized.includes("ogg") || normalized.includes("opus"))
          return "ogg";
        if (normalized.includes("wav")) return "wav";
        if (normalized.includes("mpeg") || normalized.includes("mp3"))
          return "mp3";
        if (normalized.includes("3gpp")) return "3gpp";
        if (normalized.includes("amr")) return "amr";
        return "webm";
      };

      const resolvedMimeType = audioBlob.type || "audio/webm";
      const voiceExtension = detectVoiceExtension(resolvedMimeType);

      // Keep file extension aligned with MIME type to avoid cross-browser playback issues.
      const audioFile = new File(
        [audioBlob],
        `voice_${Date.now()}.${voiceExtension}`,
        {
          type: resolvedMimeType,
        },
      );

      const duration = await getAudioDuration(audioBlob);

      localAttachment = {
        url: URL.createObjectURL(audioBlob),
        filename: audioFile.name,
        size: audioFile.size,
        mimeType: audioFile.type,
        duration,
      };

      if (onCreateVoicePlaceholder) {
        placeholderMessageId = onCreateVoicePlaceholder({
          content: "Sending voice...",
          attachment: localAttachment,
        });
      }

      // Upload audio file
      const formData = new FormData();
      formData.append("file", audioFile);
      formData.append("type", "message");

      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload voice message");
      }

      const uploadData = await uploadResponse.json();

      // Normalize MIME type: strip codec suffix so browsers don't reject
      // the source due to mismatched Content-Type from the CDN.
      const normalizedMimeType = (
        uploadData.type ||
        audioFile.type ||
        "audio/webm"
      )
        .replace(/;.*$/, "")
        .trim();

      // Create attachment data
      const attachment: ChatAttachment = {
        url: uploadData.url,
        fileId: uploadData.fileId,
        filename: uploadData.filename || audioFile.name,
        size: uploadData.size || audioFile.size,
        mimeType: normalizedMimeType,
        duration,
      };

      // Send voice message using the onSendMessage callback
      await onSendMessage(
        "Voice message",
        "voice",
        [attachment],
        placeholderMessageId
          ? { replaceMessageId: placeholderMessageId, skipOptimistic: true }
          : undefined,
      );

      setShowVoiceRecorder(false);
    } catch (error) {
      console.error("Error uploading voice message:", error);

      if (placeholderMessageId && onVoiceUploadFailed && localAttachment) {
        onVoiceUploadFailed({
          messageId: placeholderMessageId,
          error: error instanceof Error ? error.message : "Voice upload failed",
          blob: audioBlob,
          attachment: localAttachment,
        });
      }

      throw error instanceof Error
        ? error
        : new Error("Failed to send voice message");
    }
  };

  // Handle click outside emoji picker
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showEmojiPicker]);

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, []);

  // Handle typing indicator
  const handleTyping = useCallback(() => {
    if (onTyping) {
      onTyping(true);

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        onTyping(false);
      }, 1000);
    }
  }, [onTyping]);

  // Handle message change
  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    adjustTextareaHeight();
    handleTyping();
  };

  // Handle send message
  const handleSendMessage = () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage && !attachedFile) return;

    const sendOptions = replyToMessage
      ? { replyTo: replyToMessage._id }
      : undefined;

    if (attachedFile) {
      // Handle file upload
      const fileUrl = URL.createObjectURL(attachedFile);
      const fileType = attachedFile.type.startsWith("image/")
        ? "image"
        : "file";
      onSendMessage(fileUrl, fileType, undefined, sendOptions);
      setAttachedFile(null);
    } else {
      onSendMessage(trimmedMessage, "text", undefined, sendOptions);
    }

    setMessage("");
    if (onTyping) onTyping(false);

    // Reset textarea height
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }, 0);
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachedFile(file);
    }
  };

  // Handle voice recording (placeholder)
  const handleVoiceRecord = () => {
    setShowVoiceRecorder(true);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const canSend = message.trim() || attachedFile;

  return (
    <div className={cn("border-t bg-white p-4", className)}>
      {/* Reply preview */}
      {replyToMessage && (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-gray-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-blue-700">
                Replying to {replyToMessage.sender.firstName}
              </p>
              <p className="truncate text-sm text-gray-700">
                {replyToMessage.type === "image"
                  ? "Photo"
                  : replyToMessage.type === "video"
                    ? "Video"
                    : replyToMessage.type === "audio" ||
                        replyToMessage.type === "voice"
                      ? "Voice message"
                      : replyToMessage.type === "file"
                        ? replyToMessage.attachments?.[0]?.filename ||
                          "Document"
                        : replyToMessage.content}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCancelReply?.()}
              className="h-8 w-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* File attachment preview */}
      {attachedFile && (
        <div className="mb-3 p-3 bg-gray-50 rounded-lg border">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
                <span className="text-blue-600 text-xs">
                  {attachedFile.type.startsWith("image/") ? (
                    <>
                      <Image className="h-4 w-4" />{" "}
                    </>
                  ) : (
                    <>
                      <Paperclip className="h-4 w-4" />{" "}
                    </>
                  )}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 truncate max-w-xs">
                  {attachedFile.name}
                </p>
                <p className="text-xs text-gray-500">
                  {(attachedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAttachedFile(null)}
              className="h-8 w-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Voice Recorder */}
      {showVoiceRecorder && (
        <div className="mb-3">
          <VoiceRecorder
            onSend={handleVoiceRecording}
            onCancel={() => setShowVoiceRecorder(false)}
            autoStart
          />
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end space-x-2">
        {/* Attachment button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowMediaUpload(true)}
          disabled={disabled}
          className="h-10 w-10 p-0 shrink-0"
        >
          <Paperclip className="w-5 h-5" />
        </Button>

        {/* Message input */}
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={handleMessageChange}
            onKeyDown={handleKeyPress}
            placeholder={placeholder}
            disabled={disabled}
            className="min-h-10 max-h-30 resize-none pr-12 py-2"
            rows={1}
          />

          {/* Emoji button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className={cn(
              "absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0",
              showEmojiPicker && "bg-gray-100",
            )}
            disabled={disabled}
          >
            <Smile className="w-4 h-4" />
          </Button>
        </div>

        {/* Send/Voice button */}
        {canSend ? (
          <Button
            onClick={handleSendMessage}
            disabled={disabled}
            className="h-10 w-10 p-0 shrink-0 rounded-full"
          >
            <Send className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            onClick={handleVoiceRecord}
            disabled={disabled}
            className="h-10 w-10 p-0 shrink-0 rounded-full"
          >
            <Mic className="w-5 h-5" />
          </Button>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx,.txt"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <div
          ref={emojiPickerRef}
          className="absolute bottom-full right-0 mb-2 z-50"
        >
          <EmojiPicker
            onEmojiClick={handleEmojiSelect}
            width={350}
            height={400}
            searchDisabled={false}
            skinTonesDisabled={false}
            previewConfig={{
              showPreview: false,
            }}
          />
        </div>
      )}

      {/* Media Upload Modal */}
      <MediaUploadModal
        isOpen={showMediaUpload}
        onClose={() => setShowMediaUpload(false)}
        onSend={handleMediaUpload}
      />
    </div>
  );
}
