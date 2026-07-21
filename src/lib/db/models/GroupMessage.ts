import mongoose, { Schema, Document } from 'mongoose';
import { MessageType, MessageStatus } from '@/types';

export interface IGroupMessage extends Document {
  group: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  type: string;
  content: string;
  attachments?: {
    url: string;
    fileId?: mongoose.Types.ObjectId;
    filename: string;
    size: number;
    mimeType: string;
    thumbnail?: string;
    duration?: number;
    width?: number;
    height?: number;
  }[];
  readBy: {
    user: mongoose.Types.ObjectId;
    readAt: Date;
  }[];
  replyTo?: mongoose.Types.ObjectId;
  reactions?: {
    emoji: string;
    userId: mongoose.Types.ObjectId;
    createdAt: Date;
  }[];
  isForwarded?: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const groupMessageAttachmentSchema = new Schema({
  url: { type: String, required: true },
  fileId: { type: Schema.Types.ObjectId, ref: 'File' },
  filename: { type: String, required: true },
  size: { type: Number, required: true },
  mimeType: { type: String, required: true },
  thumbnail: { type: String },
  duration: { type: Number },
  width: { type: Number },
  height: { type: Number }
}, { _id: false });

const groupMessageReadBySchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  readAt: { type: Date, default: Date.now }
}, { _id: false });

const groupMessageReactionSchema = new Schema({
  emoji: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const groupMessageSchema = new Schema({
  group: {
    type: Schema.Types.ObjectId,
    ref: 'MessageGroup',
    required: true
  },
  sender: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: Object.values(MessageType),
    default: MessageType.TEXT
  },
  content: {
    type: String,
    required: true,
    maxlength: 2000
  },
  attachments: [groupMessageAttachmentSchema],
  readBy: [groupMessageReadBySchema],
  replyTo: {
    type: Schema.Types.ObjectId,
    ref: 'GroupMessage'
  },
  reactions: [groupMessageReactionSchema],
  isForwarded: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes
groupMessageSchema.index({ group: 1, createdAt: -1 });
groupMessageSchema.index({ sender: 1, createdAt: -1 });
groupMessageSchema.index({ group: 1, 'readBy.user': 1 });

const GroupMessage = mongoose.models.GroupMessage || mongoose.model<IGroupMessage>('GroupMessage', groupMessageSchema);

export default GroupMessage;
