import mongoose, { Schema, Document } from 'mongoose';

export interface IClientSubscription extends Document {
  _id: string;
  client: mongoose.Types.ObjectId;
  dietitian: mongoose.Types.ObjectId;
  plan: mongoose.Types.ObjectId;
  startDate: Date;
  endDate: Date;
  status: 'active' | 'expired' | 'cancelled' | 'pending';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  paymentMethod: 'razorpay' | 'manual' | 'cash' | 'bank-transfer';
  amount: number;
  currency: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  paymentLink?: string;
  transactionId?: string;
  paidAt?: Date;
  notes?: string;
  consultationsUsed: number;
  followUpsUsed: number;
  videoCallsUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

const clientSubscriptionSchema = new Schema({
  client: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  dietitian: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  plan: {
    type: Schema.Types.ObjectId,
    ref: 'SubscriptionPlan',
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['active', 'expired', 'cancelled', 'pending'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    required: true,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['razorpay', 'manual', 'cash', 'bank-transfer'],
    default: 'razorpay'
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    default: 'INR',
    uppercase: true
  },
  razorpayOrderId: {
    type: String,
    sparse: true
  },
  razorpayPaymentId: {
    type: String,
    sparse: true
  },
  razorpaySignature: {
    type: String
  },
  paymentLink: {
    type: String
  },
  transactionId: {
    type: String,
    sparse: true
  },
  paidAt: {
    type: Date
  },
  notes: {
    type: String,
    maxlength: 1000
  },
  consultationsUsed: {
    type: Number,
    default: 0,
    min: 0
  },
  followUpsUsed: {
    type: Number,
    default: 0,
    min: 0
  },
  videoCallsUsed: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true
});

// Indexes
clientSubscriptionSchema.index({ client: 1, status: 1 });
clientSubscriptionSchema.index({ dietitian: 1, status: 1 });
clientSubscriptionSchema.index({ startDate: 1, endDate: 1 });
clientSubscriptionSchema.index({ paymentStatus: 1 });

// Method to check if subscription is active
clientSubscriptionSchema.methods.isActive = function() {
  const now = new Date();
  return this.status === 'active' && 
         this.paymentStatus === 'paid' && 
         this.startDate <= now && 
         this.endDate >= now;
};

// Method to mark as paid
clientSubscriptionSchema.methods.markAsPaid = function(paymentDetails: any) {
  this.paymentStatus = 'paid';
  this.status = 'active';
  this.paidAt = new Date();
  if (paymentDetails.razorpayPaymentId) {
    this.razorpayPaymentId = paymentDetails.razorpayPaymentId;
  }
  if (paymentDetails.razorpaySignature) {
    this.razorpaySignature = paymentDetails.razorpaySignature;
  }
  if (paymentDetails.transactionId) {
    this.transactionId = paymentDetails.transactionId;
  }
  return this.save();
};

const ClientSubscription = mongoose.models.ClientSubscription || mongoose.model<IClientSubscription>('ClientSubscription', clientSubscriptionSchema);

export default ClientSubscription;

