import mongoose, { Schema } from 'mongoose';

export interface IHistory extends mongoose.Document {
  userId: mongoose.Schema.Types.ObjectId;
  action: string;
  category: 'profile' | 'medical' | 'lifestyle' | 'diet' | 'payment' | 'appointment' | 'document' | 'assignment' | 'other';
  description: string;
  changeDetails?: {
    fieldName: string;
    oldValue: any;
    newValue: any;
  }[];
  performedBy?: {
    userId: mongoose.Schema.Types.ObjectId;
    name: string;
    email: string;
    role: string;
  };
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const historySchema = new Schema<IHistory>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    action: {
      type: String,
      required: true,
      enum: ['create', 'update', 'delete', 'upload', 'download', 'assign', 'view'],
      default: 'update',
    },
    category: {
      type: String,
      required: true,
      enum: ['profile', 'medical', 'lifestyle', 'diet', 'payment', 'appointment', 'document', 'assignment', 'other'],
      default: 'other'
    },
    description: {
      type: String,
      required: true,
    },
    changeDetails: [
      {
        fieldName: {
          type: String,
          required: true,
        },
        oldValue: Schema.Types.Mixed,
        newValue: Schema.Types.Mixed,
      },
    ],
    performedBy: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
      name: {
        type: String,
      },
      email: {
        type: String,
      },
      role: {
        type: String,
      },
    },
    metadata: Schema.Types.Mixed,
    ipAddress: String,
    userAgent: String,
  },
  {
    timestamps: true,
    autoIndex: false,
  }
);

// Compound index for common queries
historySchema.index({ userId: 1, createdAt: -1 });
historySchema.index({ userId: 1, category: 1, createdAt: -1 });
historySchema.index({ 'performedBy.userId': 1 });

// Virtual for formatted date
historySchema.virtual('formattedDate').get(function () {
  return this.createdAt?.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
});

historySchema.set('toJSON', { virtuals: true });

export const History = mongoose.models.History || mongoose.model<IHistory>('History', historySchema);

export default History;
