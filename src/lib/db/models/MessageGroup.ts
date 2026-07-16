import mongoose, { Schema, Document } from 'mongoose';

export interface IMessageGroupMember {
  user: mongoose.Types.ObjectId;
  role: 'admin' | 'member';
  joinedAt: Date;
  lastReadAt?: Date;
}

export interface IMessageGroup extends Document {
  name: string;
  description?: string;
  avatar?: string;
  createdBy: mongoose.Types.ObjectId;
  members: IMessageGroupMember[];
  isActive: boolean;
  lastMessage?: mongoose.Types.ObjectId;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const messageGroupMemberSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'member'],
    default: 'member'
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  lastReadAt: {
    type: Date
  }
}, { _id: false });

const messageGroupSchema = new Schema({
  name: {
    type: String,
    required: true,
    maxlength: 100,
    trim: true
  },
  description: {
    type: String,
    maxlength: 500,
    trim: true
  },
  avatar: {
    type: String
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [messageGroupMemberSchema],
  isActive: {
    type: Boolean,
    default: true
  },
  lastMessage: {
    type: Schema.Types.ObjectId,
    ref: 'GroupMessage'
  },
  lastMessageAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes
messageGroupSchema.index({ 'members.user': 1 });
messageGroupSchema.index({ createdBy: 1 });
messageGroupSchema.index({ lastMessageAt: -1 });
messageGroupSchema.index({ isActive: 1 });

const MessageGroup = mongoose.models.MessageGroup || mongoose.model<IMessageGroup>('MessageGroup', messageGroupSchema);

export default MessageGroup;
