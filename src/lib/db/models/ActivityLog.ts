import mongoose, { Schema, Model } from 'mongoose';

export interface IActivityLog {
  _id: string;
  userId: mongoose.Types.ObjectId;
  userRole: 'admin' | 'dietitian' | 'health_counselor' | 'client';
  userName: string;
  userEmail?: string;
  userPhone?: string;
  action: string;
  actionType: 'create' | 'update' | 'delete' | 'view' | 'assign' | 'complete' | 'cancel' | 'payment' | 'login' | 'logout' | 'other';
  category: 'meal_plan' | 'diet_plan' | 'appointment' | 'payment' | 'task' | 'note' | 'document' | 'profile' | 'client_assignment' | 'recipe' | 'fitness' | 'message' | 'subscription' | 'auth' | 'system' | 'other';
  description: string;
  targetUserId?: mongoose.Types.ObjectId;
  targetUserName?: string;
  resourceId?: string;
  resourceType?: string;
  resourceName?: string;
  details?: Record<string, any>;
  changeDetails?: {
    fieldName: string;
    oldValue: any;
    newValue: any;
  }[];
  ipAddress?: string;
  userAgent?: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const activityLogSchema = new Schema<IActivityLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    userRole: {
      type: String,
      enum: ['admin', 'dietitian', 'health_counselor', 'client'],
      required: true,
      index: true
    },
    userName: {
      type: String,
      required: true
    },
    userEmail: {
      type: String,
      required: false // Made optional: some users don't have email (phone-only signups)
    },
    userPhone: {
      type: String
    },
    action: {
      type: String,
      required: true
    },
    actionType: {
      type: String,
      enum: ['create', 'update', 'delete', 'view', 'assign', 'complete', 'cancel', 'payment', 'login', 'logout', 'other'],
      required: true,
      index: true
    },
    category: {
      type: String,
      enum: ['meal_plan', 'diet_plan', 'appointment', 'payment', 'task', 'note', 'document', 'profile', 'client_assignment', 'recipe', 'fitness', 'message', 'subscription', 'auth', 'system', 'other'],
      required: true,
      index: true
    },
    description: {
      type: String,
      required: true
    },
    targetUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    targetUserName: String,
    resourceId: String,
    resourceType: String,
    resourceName: String,
    details: Schema.Types.Mixed,
    changeDetails: [
      {
        fieldName: String,
        oldValue: Schema.Types.Mixed,
        newValue: Schema.Types.Mixed
      }
    ],
    ipAddress: String,
    userAgent: String,
    isRead: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Indexes for efficient queries
activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ targetUserId: 1, createdAt: -1 });
activityLogSchema.index({ category: 1, createdAt: -1 });
activityLogSchema.index({ userRole: 1, createdAt: -1 });

const ActivityLog: Model<IActivityLog> =
  mongoose.models.ActivityLog || mongoose.model<IActivityLog>('ActivityLog', activityLogSchema);

export default ActivityLog;
