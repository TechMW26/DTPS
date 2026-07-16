import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IOtherPlatformPayment extends Document {
  _id: Types.ObjectId;
  client: Types.ObjectId;
  dietitian: Types.ObjectId;
  platform: 'upi' | 'bank_transfer' | 'cash' | 'phonepe' | 'gpay' | 'paytm' | 'other';
  customPlatform?: string;
  transactionId: string;
  amount: number;
  paymentLink?: Types.ObjectId;
  // Plan details (locked from payment link)
  planName?: string;
  planCategory?: string;
  durationDays?: number;
  durationLabel?: string;
  receiptImage?: string;
  receiptImageUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  reviewNotes?: string;
  paymentDate?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OtherPlatformPaymentSchema = new Schema<IOtherPlatformPayment>(
  {
    client: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    dietitian: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    platform: {
      type: String,
      enum: ['upi', 'bank_transfer', 'cash', 'phonepe', 'gpay', 'paytm', 'other'],
      required: true,
    },
    customPlatform: {
      type: String,
      trim: true,
    },
    transactionId: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentLink: {
      type: Schema.Types.ObjectId,
      ref: 'PaymentLink',
    },
    // Locked plan details from payment link
    planName: {
      type: String,
      trim: true,
    },
    planCategory: {
      type: String,
      trim: true,
    },
    durationDays: {
      type: Number,
    },
    durationLabel: {
      type: String,
      trim: true,
    },
    receiptImage: {
      type: String,
    },
    receiptImageUrl: {
      type: String,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: {
      type: Date,
    },
    reviewNotes: {
      type: String,
      trim: true,
    },
    paymentDate: {
      type: Date,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
OtherPlatformPaymentSchema.index({ client: 1 });
OtherPlatformPaymentSchema.index({ dietitian: 1 });
OtherPlatformPaymentSchema.index({ status: 1 });
OtherPlatformPaymentSchema.index({ createdAt: -1 });

const OtherPlatformPayment =
  mongoose.models.OtherPlatformPayment ||
  mongoose.model<IOtherPlatformPayment>('OtherPlatformPayment', OtherPlatformPaymentSchema);

export default OtherPlatformPayment;
