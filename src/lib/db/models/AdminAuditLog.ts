import mongoose, { Schema, Document } from 'mongoose';

export interface IAdminAuditLog extends Document {
  adminId: mongoose.Types.ObjectId;
  adminEmail: string;
  action: 'create_user' | 'update_user' | 'deactivate_user' | 'activate_user' | 'suspend_user' | 'delete_user' | 'change_role' | 'change_status';
  targetUserId: mongoose.Types.ObjectId;
  targetUserEmail?: string;
  targetUserRole?: string;
  changes?: Record<string, { old: any; new: any }>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const adminAuditLogSchema = new Schema({
  adminId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  adminEmail: {
    type: String,
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: ['create_user', 'update_user', 'deactivate_user', 'activate_user', 'suspend_user', 'delete_user', 'change_role', 'change_status'],
    index: true
  },
  targetUserId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  targetUserEmail: {
    type: String
  },
  targetUserRole: {
    type: String
  },
  changes: {
    type: Schema.Types.Mixed,
    default: {}
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  }
}, {
  timestamps: true
});

// Index for efficient queries
adminAuditLogSchema.index({ createdAt: -1 });
adminAuditLogSchema.index({ adminId: 1, createdAt: -1 });
adminAuditLogSchema.index({ targetUserId: 1, createdAt: -1 });

const AdminAuditLog = mongoose.models.AdminAuditLog || mongoose.model<IAdminAuditLog>('AdminAuditLog', adminAuditLogSchema);

export default AdminAuditLog;
