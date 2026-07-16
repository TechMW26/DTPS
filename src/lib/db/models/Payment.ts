import mongoose, { Schema, Document } from 'mongoose';

export interface IPayment extends Document {
  // References
  client: mongoose.Types.ObjectId;
  dietitian?: mongoose.Types.ObjectId;
  
  // Payment details
  amount: number;
  currency: string;
  type: 'subscription' | 'consultation' | 'service' | 'product' | 'other';
  
  // Plan details (if applicable)
  planName?: string;
  planCategory?: string;
  durationDays?: number;
  durationLabel?: string;
  
  // Razorpay details
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayPaymentLinkUrl?: string;
  razorpaySignature?: string;
  
  // Transaction details
  transactionId?: string;
  paymentMethod?: string;
  
  // Payer details
  payerEmail?: string;
  payerPhone?: string;
  payerName?: string;
  
  // Status
  status: 'pending' | 'completed' | 'paid' | 'failed' | 'refunded' | 'cancelled';
  paymentStatus?: 'pending' | 'paid' | 'failed' | 'refunded';
  
  // Dates
  paidAt?: Date;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema({
  client: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  dietitian: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  
  // Payment details
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR',
    uppercase: true
  },
  type: {
    type: String,
    enum: ['subscription', 'consultation', 'service', 'product', 'other'],
    default: 'subscription'
  },
  
  // Plan details
  planName: {
    type: String,
    trim: true
  },
  planCategory: {
    type: String,
    trim: true
  },
  durationDays: {
    type: Number,
    min: 0
  },
  durationLabel: {
    type: String,
    trim: true
  },
  
  // Razorpay details
  razorpayOrderId: {
    type: String,
    trim: true
  },
  razorpayPaymentId: {
    type: String,
    trim: true
  },
  razorpayPaymentLinkUrl: {
    type: String,
    trim: true
  },
  razorpaySignature: {
    type: String,
    trim: true
  },
  
  // Transaction details
  transactionId: {
    type: String,
    trim: true
  },
  paymentMethod: {
    type: String,
    trim: true
  },
  
  // Payer details
  payerEmail: {
    type: String,
    trim: true,
    lowercase: true
  },
  payerPhone: {
    type: String,
    trim: true
  },
  payerName: {
    type: String,
    trim: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'completed', 'paid', 'failed', 'refunded', 'cancelled'],
    default: 'pending',
    index: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  
  // Dates
  paidAt: {
    type: Date
  }
}, {
  timestamps: true,
  autoIndex: true
});

// Compound indexes for common queries
paymentSchema.index({ client: 1, status: 1 });
paymentSchema.index({ dietitian: 1, status: 1 });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });

// Unique indexes with partial filter expressions
// Only enforce uniqueness when the field has a value (not null/undefined)
paymentSchema.index(
  { razorpayOrderId: 1 },
  { unique: true, sparse: true, partialFilterExpression: { razorpayOrderId: { $exists: true, $ne: null } } }
);
paymentSchema.index(
  { razorpayPaymentId: 1 },
  { unique: true, sparse: true, partialFilterExpression: { razorpayPaymentId: { $exists: true, $ne: null } } }
);
paymentSchema.index(
  { transactionId: 1 },
  { unique: true, sparse: true, partialFilterExpression: { transactionId: { $exists: true, $ne: null } } }
);

// Check if the model exists before creating to prevent OverwriteModelError
const Payment = mongoose.models.Payment || mongoose.model<IPayment>('Payment', paymentSchema);

export default Payment;
