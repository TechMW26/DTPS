import mongoose, { Schema, Model } from 'mongoose';

export interface ISystemAlert {
  _id: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'critical';
  source: 'database' | 'api' | 'auth' | 'payment' | 'email' | 'file' | 'system' | 'user_action' | 'cron' | 'integration';
  message: string;
  title?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: 'database_error' | 'api_error' | 'auth_failure' | 'payment_failure' | 'email_failure' | 'validation_error' | 'performance' | 'security' | 'maintenance' | 'other';
  status: 'new' | 'acknowledged' | 'resolved' | 'ignored';
  details?: Record<string, any>;
  errorStack?: string;
  affectedResource?: string;
  affectedResourceId?: string;
  resolvedBy?: Schema.Types.ObjectId | string;
  resolvedAt?: Date;
  resolution?: string;
  createdBy?: Schema.Types.ObjectId | string;
  notificationSent: boolean;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const systemAlertSchema = new Schema<ISystemAlert>({
  type: { 
    type: String, 
    enum: ['info', 'warning', 'error', 'success', 'critical'], 
    default: 'info',
    index: true
  },
  source: {
    type: String,
    enum: ['database', 'api', 'auth', 'payment', 'email', 'file', 'system', 'user_action', 'cron', 'integration'],
    required: true,
    index: true
  },
  message: { 
    type: String, 
    required: true, 
    maxlength: 1000 
  },
  title: {
    type: String,
    maxlength: 200
  },
  priority: { 
    type: String, 
    enum: ['low', 'medium', 'high', 'critical'], 
    default: 'low',
    index: true
  },
  category: {
    type: String,
    enum: ['database_error', 'api_error', 'auth_failure', 'payment_failure', 'email_failure', 'validation_error', 'performance', 'security', 'maintenance', 'other'],
    default: 'other',
    index: true
  },
  status: {
    type: String,
    enum: ['new', 'acknowledged', 'resolved', 'ignored'],
    default: 'new',
    index: true
  },
  details: Schema.Types.Mixed,
  errorStack: String,
  affectedResource: String,
  affectedResourceId: String,
  resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: Date,
  resolution: String,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  notificationSent: {
    type: Boolean,
    default: false
  },
  isRead: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Indexes for efficient queries
systemAlertSchema.index({ createdAt: -1 });
systemAlertSchema.index({ status: 1, priority: -1, createdAt: -1 });
systemAlertSchema.index({ type: 1, createdAt: -1 });

const SystemAlert: Model<ISystemAlert> =
  mongoose.models.SystemAlert || mongoose.model<ISystemAlert>('SystemAlert', systemAlertSchema);

export default SystemAlert;

