import mongoose, { Schema, Document } from 'mongoose';

export interface IOTPRecord extends Document {
    phone: string;
    otp: string;
    userId?: string;
    userName?: string;
    purpose: 'login' | 'signup';
    signupPayload?: {
        firstName: string;
        lastName: string;
        email?: string;
    };
    attempts: number;
    expiresAt: Date;
    createdAt: Date;
}

const otpRecordSchema = new Schema<IOTPRecord>(
    {
        phone: {
            type: String,
            required: true,
            index: true,
        },
        otp: {
            type: String,
            required: true,
        },
        userId: {
            type: String,
        },
        userName: {
            type: String,
        },
        purpose: {
            type: String,
            enum: ['login', 'signup'],
            default: 'login',
        },
        signupPayload: {
            firstName: String,
            lastName: String,
            email: String,
        },
        attempts: {
            type: Number,
            default: 0,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
        createdAt: {
            type: Date,
            default: Date.now,
            index: true,
        },
    },
    {
        timestamps: false,
    }
);

// TTL index to auto-delete expired OTPs after 10 minutes
otpRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 600 });

// Compound index for efficient lookup
otpRecordSchema.index({ phone: 1, otp: 1 });

const OTPRecord = mongoose.models.OTPRecord || mongoose.model<IOTPRecord>('OTPRecord', otpRecordSchema);

export default OTPRecord;
