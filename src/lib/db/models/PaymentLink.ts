import mongoose, { Schema, Document } from 'mongoose';

export interface IPaymentLink extends Document {
  _id: string;
  // References
  client: mongoose.Types.ObjectId;
  dietitian: mongoose.Types.ObjectId;
  
  // Payment details
  amount: number;
  tax: number;
  discount: number;
  finalAmount: number;
  currency: string;
  
  // Plan details
  planCategory?: string;
  planName?: string;
  duration?: string;
  durationDays?: number;
  catalogue?: string;
  servicePlanId?: mongoose.Types.ObjectId;
  pricingTierId?: string;
  
  // Razorpay details
  razorpayPaymentLinkId?: string;
  razorpayPaymentLinkUrl?: string;
  razorpayPaymentLinkShortUrl?: string;
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
  razorpaySignature?: string;
  // Additional payment transaction details
  transactionId?: string;
  paymentMethod?: string;
  payerEmail?: string;
  payerPhone?: string;
  payerName?: string;
  bank?: string;
  wallet?: string;
  vpa?: string; // UPI ID
  cardLast4?: string;
  cardNetwork?: string;
  errorCode?: string;
  errorDescription?: string;
  
  // Status
  status: 'created' | 'pending' | 'paid' | 'expired' | 'cancelled';
  
  // Dates
  expireDate?: Date;
  paidAt?: Date;
  
  // Additional info
  notes?: string;
  showToClient: boolean;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const paymentLinkSchema = new Schema({
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
  
  // Payment details
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  tax: {
    type: Number,
    default: 0,
    min: 0
  },
  discount: {
    type: Number,
    default: 0,
    min: 0
  },
  finalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR',
    uppercase: true
  },
  
  // Plan details
  planCategory: {
    type: String,
    trim: true
  },
  planName: {
    type: String,
    trim: true
  },
  duration: {
    type: String,
    trim: true
  },
  durationDays: {
    type: Number,
    min: 1
  },
  catalogue: {
    type: String,
    trim: true
  },
  servicePlanId: {
    type: Schema.Types.ObjectId,
    ref: 'ServicePlan'
  },
  pricingTierId: {
    type: String
  },
  
  // Razorpay details
  razorpayPaymentLinkId: {
    type: String,
    sparse: true
  },
  razorpayPaymentLinkUrl: {
    type: String
  },
  razorpayPaymentLinkShortUrl: {
    type: String
  },
  razorpayPaymentId: {
    type: String,
    sparse: true
  },
  razorpayOrderId: {
    type: String,
    sparse: true
  },
  razorpaySignature: {
    type: String
  },
  // Additional payment transaction details
  transactionId: {
    type: String,
    sparse: true
  },
  paymentMethod: {
    type: String // card, netbanking, wallet, upi, etc.
  },
  payerEmail: {
    type: String
  },
  payerPhone: {
    type: String
  },
  payerName: {
    type: String
  },
  bank: {
    type: String
  },
  wallet: {
    type: String
  },
  vpa: {
    type: String // UPI ID
  },
  cardLast4: {
    type: String
  },
  cardNetwork: {
    type: String
  },
  errorCode: {
    type: String
  },
  errorDescription: {
    type: String
  },
  
  // Status
  status: {
    type: String,
    required: true,
    enum: ['created', 'pending', 'paid', 'expired', 'cancelled'],
    default: 'created'
  },
  
  // Dates
  expireDate: {
    type: Date
  },
  paidAt: {
    type: Date
  },
  
  // Additional info
  notes: {
    type: String,
    maxlength: 1000
  },
  showToClient: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  autoIndex: false
});

// Guardrail: once paid, status must never downgrade.
paymentLinkSchema.pre('save', async function (next) {
  try {
    const doc = this as any;

    if (doc.isNew) {
      if (doc.status === 'paid' && !doc.paidAt) {
        doc.paidAt = new Date();
      }
      return next();
    }

    if (!doc.isModified('status')) {
      return next();
    }

    const previous = await (mongoose.models.PaymentLink || mongoose.model('PaymentLink')).findById(doc._id).select('status paidAt');
    const wasPaid = previous?.status === 'paid' || !!previous?.paidAt;

    if (wasPaid && doc.status !== 'paid') {
      return next(new Error('Payment status is immutable once paid'));
    }

    if (doc.status === 'paid' && !doc.paidAt) {
      doc.paidAt = new Date();
    }

    return next();
  } catch (error) {
    return next(error as any);
  }
});

// Indexes
paymentLinkSchema.index({ client: 1, status: 1 });
paymentLinkSchema.index({ dietitian: 1, status: 1 });
paymentLinkSchema.index({ createdAt: -1 });
// Note: razorpayPaymentLinkId index is created automatically by sparse: true, so we don't need schema.index() call

// Method to mark as paid
paymentLinkSchema.methods.markAsPaid = function(paymentDetails: {
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
  razorpaySignature?: string;
}) {
  this.status = 'paid';
  this.paidAt = new Date();
  if (paymentDetails.razorpayPaymentId) {
    this.razorpayPaymentId = paymentDetails.razorpayPaymentId;
  }
  if (paymentDetails.razorpayOrderId) {
    this.razorpayOrderId = paymentDetails.razorpayOrderId;
  }
  if (paymentDetails.razorpaySignature) {
    this.razorpaySignature = paymentDetails.razorpaySignature;
  }
  return this.save();
};

// Method to check if expired
paymentLinkSchema.methods.isExpired = function() {
  if (!this.expireDate) return false;
  return new Date() > this.expireDate;
};

// Static method to get payment links for a client
paymentLinkSchema.statics.getClientPaymentLinks = function(clientId: string, limit = 20, skip = 0) {
  return this.find({ client: clientId })
    .populate('dietitian', 'firstName lastName')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

// Static method to get payment links for a dietitian
paymentLinkSchema.statics.getDietitianPaymentLinks = function(dietitianId: string, clientId?: string, limit = 50, skip = 0) {
  const query: any = { dietitian: dietitianId };
  if (clientId) query.client = clientId;
  
  return this.find(query)
    .populate('client', 'firstName lastName email phone')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

const PaymentLink = mongoose.models.PaymentLink || mongoose.model<IPaymentLink>('PaymentLink', paymentLinkSchema);

export default PaymentLink;
