import mongoose from 'mongoose';

export interface INotification {
  _id: string;
  userId: mongoose.Types.ObjectId;
  title: string;
  message: string;
  type: 'meal' | 'appointment' | 'progress' | 'message' | 'reminder' | 'system' | 'task' | 'payment' | 'custom';
  read: boolean;
  data?: Record<string, unknown>;
  actionUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true
  },
  title: { 
    type: String, 
    required: true 
  },
  message: { 
    type: String, 
    required: true 
  },
  type: { 
    type: String, 
    enum: ['meal', 'appointment', 'progress', 'message', 'reminder', 'system', 'task', 'payment', 'custom'],
    default: 'system'
  },
  read: { 
    type: Boolean, 
    default: false,
    index: true
  },
  data: { 
    type: mongoose.Schema.Types.Mixed 
  },
  actionUrl: {
    type: String
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, createdAt: -1 });

const Notification = mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema);

export default Notification;
