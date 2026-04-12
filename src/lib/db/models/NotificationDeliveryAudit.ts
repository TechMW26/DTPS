import mongoose, { Schema, Model } from 'mongoose';

export interface INotificationDeliveryAudit {
    _id: string;
    recipientUserId: mongoose.Types.ObjectId;
    recipientRole: 'admin' | 'dietitian' | 'health_counselor' | 'client';
    actionType: 'assigned' | 'message' | 'meal' | 'update' | 'custom';
    status: 'sent' | 'deduped' | 'failed';
    channel: 'web_push';
    dedupeKey?: string;
    notificationId?: mongoose.Types.ObjectId;
    clientId?: string;
    clientName?: string;
    clickAction?: string;
    title: string;
    body: string;
    error?: string;
    latencyMs?: number;
    metadata?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

const NotificationDeliveryAuditSchema = new Schema<INotificationDeliveryAudit>(
    {
        recipientUserId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        recipientRole: {
            type: String,
            enum: ['admin', 'dietitian', 'health_counselor', 'client'],
            required: true,
            index: true,
        },
        actionType: {
            type: String,
            enum: ['assigned', 'message', 'meal', 'update', 'custom'],
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ['sent', 'deduped', 'failed'],
            required: true,
            index: true,
        },
        channel: {
            type: String,
            enum: ['web_push'],
            default: 'web_push',
            index: true,
        },
        dedupeKey: {
            type: String,
            index: true,
            sparse: true,
        },
        notificationId: {
            type: Schema.Types.ObjectId,
            ref: 'Notification',
            index: true,
        },
        clientId: {
            type: String,
            index: true,
        },
        clientName: {
            type: String,
        },
        clickAction: {
            type: String,
        },
        title: {
            type: String,
            required: true,
        },
        body: {
            type: String,
            required: true,
        },
        error: {
            type: String,
        },
        latencyMs: {
            type: Number,
            min: 0,
        },
        metadata: {
            type: Schema.Types.Mixed,
            default: {},
        },
    },
    {
        timestamps: true,
    }
);

NotificationDeliveryAuditSchema.index({ createdAt: -1 });
NotificationDeliveryAuditSchema.index({ status: 1, createdAt: -1 });
NotificationDeliveryAuditSchema.index({ actionType: 1, createdAt: -1 });
NotificationDeliveryAuditSchema.index({ recipientRole: 1, createdAt: -1 });
NotificationDeliveryAuditSchema.index({ dedupeKey: 1, recipientUserId: 1, createdAt: -1 });

const NotificationDeliveryAudit: Model<INotificationDeliveryAudit> =
    mongoose.models.NotificationDeliveryAudit ||
    mongoose.model<INotificationDeliveryAudit>('NotificationDeliveryAudit', NotificationDeliveryAuditSchema);

export default NotificationDeliveryAudit;
