import mongoose, { Schema, Document } from 'mongoose';

/**
 * Unified Payment Model
 * 
 * This model replaces both ClientPurchase and Payment schemas.
 * All payment-related data is stored in a single document.
 * 
 * Key Features:
 * - Single source of truth for all payment/purchase data
 * - Razorpay sync updates existing records (no duplicates)
 * - CSV/JSON friendly flat structure
 * - Optimized for bulk operations
 */

export interface IUnifiedPayment extends Document {
  _id: mongoose.Types.ObjectId;

  // ========== REFERENCES ==========
  client: mongoose.Types.ObjectId;
  dietitian?: mongoose.Types.ObjectId;
  servicePlan?: mongoose.Types.ObjectId;
  paymentLink?: mongoose.Types.ObjectId;
  otherPlatformPayment?: mongoose.Types.ObjectId;
  mealPlan?: mongoose.Types.ObjectId;

  // ========== PLAN DETAILS ==========
  planName: string;
  planCategory: string;
  durationDays: number;
  durationLabel: string;

  // ========== PRICING ==========
  baseAmount: number;
  discountPercent: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  finalAmount: number;
  amount: number; // Legacy field for backward compatibility
  currency: string;

  // ========== RAZORPAY DETAILS ==========
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayPaymentLinkId?: string;
  razorpayPaymentLinkUrl?: string;
  razorpaySignature?: string;

  // ========== TRANSACTION DETAILS ==========
  transactionId?: string;
  paymentMethod?: string;
  paymentType: 'subscription' | 'consultation' | 'service_plan' | 'product' | 'other';

  // ========== PAYER DETAILS ==========
  payerEmail?: string;
  payerPhone?: string;
  payerName?: string;

  // ========== CARD/BANK DETAILS ==========
  cardLast4?: string;
  cardNetwork?: string;
  bank?: string;
  wallet?: string;
  vpa?: string;

  // ========== STATUS ==========
  status: 'pending' | 'processing' | 'paid' | 'completed' | 'failed' | 'refunded' | 'cancelled' | 'expired';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';

  // ========== DATES ==========
  purchaseDate?: Date;
  startDate?: Date;
  endDate?: Date;
  expectedStartDate?: Date;
  expectedEndDate?: Date;
  paidAt?: Date;

  // ========== MEAL PLAN TRACKING ==========
  mealPlanCreated: boolean;
  daysUsed: number;
  remainingDays: number;

  // ========== PARENT REFERENCE (for multi-phase plans) ==========
  parentPaymentId?: mongoose.Types.ObjectId;

  // ========== NOTES & DESCRIPTION ==========
  description?: string;
  notes?: string;
  internalNotes?: string;

  // ========== TIMESTAMPS ==========
  createdAt: Date;
  updatedAt: Date;

  // ========== METHODS ==========
  getRemainingDays(): number;
  canCreateMealPlan(requestedDays: number): { canCreate: boolean; remainingDays: number; maxDays: number; message: string };
  markAsPaid(razorpayData: RazorpayPaymentData): Promise<IUnifiedPayment>;
  syncWithRazorpay(razorpayData: RazorpayPaymentData): Promise<IUnifiedPayment>;
}

// Interface for Razorpay payment data
export interface RazorpayPaymentData {
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  razorpayPaymentLinkId?: string;
  paymentMethod?: string;
  payerEmail?: string;
  payerPhone?: string;
  cardLast4?: string;
  cardNetwork?: string;
  bank?: string;
  wallet?: string;
  vpa?: string;
  transactionId?: string;
  paidAt?: Date;
}

// Input type for sync methods that allows both string and ObjectId
type ObjectIdLike = mongoose.Types.ObjectId | string;

// Input interface for creating/updating payments (more flexible than IUnifiedPayment)
export interface UnifiedPaymentInput {
  client?: ObjectIdLike;
  dietitian?: ObjectIdLike;
  servicePlan?: ObjectIdLike;
  paymentLink?: ObjectIdLike;
  otherPlatformPayment?: ObjectIdLike;
  mealPlan?: ObjectIdLike;
  planName?: string;
  planCategory?: string;
  durationDays?: number;
  durationLabel?: string;
  baseAmount?: number;
  discountPercent?: number;
  discountAmount?: number;
  taxPercent?: number;
  taxAmount?: number;
  finalAmount?: number;
  currency?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayPaymentLinkId?: string;
  razorpayPaymentLinkUrl?: string;
  razorpaySignature?: string;
  transactionId?: string;
  paymentMethod?: string;
  paymentType?: 'subscription' | 'consultation' | 'service_plan' | 'product' | 'other';
  payerEmail?: string;
  payerPhone?: string;
  payerName?: string;
  cardLast4?: string;
  cardNetwork?: string;
  bank?: string;
  wallet?: string;
  vpa?: string;
  status?: 'pending' | 'processing' | 'paid' | 'completed' | 'failed' | 'refunded' | 'cancelled' | 'expired';
  paymentStatus?: 'pending' | 'paid' | 'failed' | 'refunded';
  purchaseDate?: Date;
  startDate?: Date;
  endDate?: Date;
  expectedStartDate?: Date;
  expectedEndDate?: Date;
  paidAt?: Date;
  mealPlanCreated?: boolean;
  daysUsed?: number;
  stripePaymentIntentId?: string;
  parentPaymentId?: ObjectIdLike;
  description?: string;
  notes?: string;
  metadata?: Record<string, any>;
}

// Static methods interface
export interface IUnifiedPaymentModel extends mongoose.Model<IUnifiedPayment> {
  findOrCreateForPaymentLink(paymentLinkId: mongoose.Types.ObjectId | string, data: UnifiedPaymentInput): Promise<IUnifiedPayment>;
  findByRazorpayOrderId(orderId: string): Promise<IUnifiedPayment | null>;
  findByRazorpayPaymentId(paymentId: string): Promise<IUnifiedPayment | null>;
  findByRazorpayPaymentLinkId(linkId: string): Promise<IUnifiedPayment | null>;
  getClientActivePurchase(clientId: string): Promise<IUnifiedPayment | null>;
  getClientPurchases(clientId: string, status?: string): Promise<IUnifiedPayment[]>;
  syncRazorpayPayment(
    identifier: {
      orderId?: string;
      paymentId?: string;
      paymentLinkId?: string;
      paymentLink?: ObjectIdLike;
      otherPlatformPayment?: ObjectIdLike;
      transactionId?: string;
      client?: ObjectIdLike;
    },
    razorpayData: RazorpayPaymentData & UnifiedPaymentInput
  ): Promise<IUnifiedPayment>;
}

const unifiedPaymentSchema = new Schema<IUnifiedPayment>({
  // ========== REFERENCES ==========
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
  servicePlan: {
    type: Schema.Types.ObjectId,
    ref: 'ServicePlan'
  },
  paymentLink: {
    type: Schema.Types.ObjectId,
    ref: 'PaymentLink'
  },
  otherPlatformPayment: {
    type: Schema.Types.ObjectId,
    ref: 'OtherPlatformPayment'
  },
  mealPlan: {
    type: Schema.Types.ObjectId,
    ref: 'ClientMealPlan'
  },

  // ========== PLAN DETAILS ==========
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
    min: 1
  },
  durationLabel: {
    type: String,
    trim: true
  },

  // ========== PRICING ==========
  baseAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  discountPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  taxPercent: {
    type: Number,
    default: 0,
    min: 0
  },
  taxAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  finalAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR',
    uppercase: true
  },

  // ========== RAZORPAY DETAILS ==========
  razorpayOrderId: {
    type: String,
    trim: true
  },
  razorpayPaymentId: {
    type: String,
    trim: true
  },
  razorpayPaymentLinkId: {
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

  // ========== TRANSACTION DETAILS ==========
  transactionId: {
    type: String,
    trim: true
  },
  paymentMethod: {
    type: String,
    trim: true,
    default: 'razorpay'
  },
  paymentType: {
    type: String,
    enum: ['subscription', 'consultation', 'service_plan', 'product', 'other'],
    default: 'service_plan'
  },

  // ========== PAYER DETAILS ==========
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

  // ========== CARD/BANK DETAILS ==========
  cardLast4: {
    type: String,
    trim: true
  },
  cardNetwork: {
    type: String,
    trim: true
  },
  bank: {
    type: String,
    trim: true
  },
  wallet: {
    type: String,
    trim: true
  },
  vpa: {
    type: String,
    trim: true
  },

  // ========== STATUS ==========
  status: {
    type: String,
    enum: ['pending', 'processing', 'paid', 'completed', 'failed', 'refunded', 'cancelled', 'expired'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },

  // ========== DATES ==========
  purchaseDate: {
    type: Date,
    default: Date.now
  },
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  },
  expectedStartDate: {
    type: Date
  },
  expectedEndDate: {
    type: Date
  },
  paidAt: {
    type: Date
  },

  // ========== MEAL PLAN TRACKING ==========
  mealPlanCreated: {
    type: Boolean,
    default: false
  },
  daysUsed: {
    type: Number,
    default: 0,
    min: 0
  },
  remainingDays: {
    type: Number,
    default: 0,
    min: 0
  },

  // ========== PARENT REFERENCE ==========
  parentPaymentId: {
    type: Schema.Types.ObjectId,
    ref: 'UnifiedPayment'
  },

  // ========== NOTES & DESCRIPTION ==========
  description: {
    type: String,
    trim: true
  },
  notes: {
    type: String,
    trim: true
  },
  internalNotes: {
    type: String,
    trim: true
  },

  // ========== LEGACY AMOUNT FIELD (for backward compatibility) ==========
  amount: {
    type: Number,
    min: 0
  }
}, {
  timestamps: true,
  autoIndex: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ========== VIRTUAL FIELDS ==========
// Virtual amount getter - returns finalAmount or baseAmount for backward compatibility
unifiedPaymentSchema.virtual('displayAmount').get(function () {
  return this.finalAmount || this.baseAmount || this.amount || 0;
});

// Virtual for payment type label
unifiedPaymentSchema.virtual('typeLabel').get(function () {
  const labels: Record<string, string> = {
    'subscription': 'Subscription',
    'consultation': 'Consultation',
    'service_plan': 'Service Plan',
    'product': 'Product',
    'other': 'Other'
  };
  return labels[this.paymentType] || 'Payment';
});

// Virtual for status label
unifiedPaymentSchema.virtual('statusLabel').get(function () {
  const labels: Record<string, string> = {
    'pending': 'Pending',
    'processing': 'Processing',
    'paid': 'Paid',
    'completed': 'Completed',
    'failed': 'Failed',
    'refunded': 'Refunded',
    'cancelled': 'Cancelled',
    'expired': 'Expired'
  };
  return labels[this.status] || this.status;
});

// ========== INDEXES ==========
// Primary indexes for lookups
unifiedPaymentSchema.index({ client: 1, status: 1 });
unifiedPaymentSchema.index({ client: 1, paymentStatus: 1 });
unifiedPaymentSchema.index({ client: 1, endDate: -1 });
unifiedPaymentSchema.index({ dietitian: 1, status: 1 });
unifiedPaymentSchema.index({ dietitian: 1, createdAt: -1 });

// Date-based queries
unifiedPaymentSchema.index({ createdAt: -1 });
unifiedPaymentSchema.index({ paidAt: -1 });
unifiedPaymentSchema.index({ startDate: 1, endDate: 1 });

// Unique indexes for Razorpay IDs (prevent duplicates)
// Only enforce uniqueness when the field has a value
unifiedPaymentSchema.index(
  { razorpayOrderId: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { razorpayOrderId: { $exists: true, $nin: [null, ''] } }
  }
);
unifiedPaymentSchema.index(
  { razorpayPaymentId: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { razorpayPaymentId: { $exists: true, $nin: [null, ''] } }
  }
);
unifiedPaymentSchema.index(
  { razorpayPaymentLinkId: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { razorpayPaymentLinkId: { $exists: true, $nin: [null, ''] } }
  }
);
unifiedPaymentSchema.index(
  { transactionId: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { transactionId: { $exists: true, $nin: [null, ''] } }
  }
);

// PaymentLink reference (one payment per payment link)
unifiedPaymentSchema.index(
  { paymentLink: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { paymentLink: { $exists: true, $ne: null } }
  }
);

// ========== INSTANCE METHODS ==========

// Get remaining days for the plan (based on allocation: durationDays - daysUsed)
unifiedPaymentSchema.methods.getRemainingDays = function (): number {
  // Plan allocation remaining = durationDays - daysUsed
  const durationDays = this.durationDays || 0;
  const daysUsed = this.daysUsed || 0;
  return Math.max(0, durationDays - daysUsed);
};

// Get calendar days until end date (for expiration tracking)
unifiedPaymentSchema.methods.getCalendarDaysUntilEnd = function (): number {
  if (!this.endDate && !this.expectedEndDate) return 0;

  const now = new Date();
  const endDate = new Date(this.expectedEndDate || this.endDate);
  const diffTime = endDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
};

// Check if can create meal plan
unifiedPaymentSchema.methods.canCreateMealPlan = function (requestedDays: number): { canCreate: boolean; remainingDays: number; maxDays: number; message: string } {
  const remainingDays = this.getRemainingDays();

  if (this.status !== 'paid' && this.status !== 'completed' && this.status !== 'active') {
    return {
      canCreate: false,
      remainingDays,
      maxDays: remainingDays,
      message: 'Payment is not completed'
    };
  }

  if (this.paymentStatus !== 'paid') {
    return {
      canCreate: false,
      remainingDays,
      maxDays: remainingDays,
      message: 'Payment status is not paid'
    };
  }

  if (remainingDays < requestedDays) {
    return {
      canCreate: false,
      remainingDays,
      maxDays: remainingDays,
      message: `Only ${remainingDays} days remaining in plan`
    };
  }

  return {
    canCreate: true,
    remainingDays,
    maxDays: remainingDays,
    message: 'OK'
  };
};

// Mark payment as paid and update Razorpay details
unifiedPaymentSchema.methods.markAsPaid = async function (razorpayData: RazorpayPaymentData): Promise<IUnifiedPayment> {
  return this.syncWithRazorpay(razorpayData);
};

// Sync with Razorpay data (update existing record)
unifiedPaymentSchema.methods.syncWithRazorpay = async function (razorpayData: RazorpayPaymentData): Promise<IUnifiedPayment> {
  // Update Razorpay IDs
  if (razorpayData.razorpayOrderId) this.razorpayOrderId = razorpayData.razorpayOrderId;
  if (razorpayData.razorpayPaymentId) this.razorpayPaymentId = razorpayData.razorpayPaymentId;
  if (razorpayData.razorpaySignature) this.razorpaySignature = razorpayData.razorpaySignature;
  if (razorpayData.razorpayPaymentLinkId) this.razorpayPaymentLinkId = razorpayData.razorpayPaymentLinkId;

  // Update payment details
  if (razorpayData.paymentMethod) this.paymentMethod = razorpayData.paymentMethod;
  if (razorpayData.transactionId) this.transactionId = razorpayData.transactionId;

  // Update payer details
  if (razorpayData.payerEmail) this.payerEmail = razorpayData.payerEmail;
  if (razorpayData.payerPhone) this.payerPhone = razorpayData.payerPhone;

  // Update card/bank details
  if (razorpayData.cardLast4) this.cardLast4 = razorpayData.cardLast4;
  if (razorpayData.cardNetwork) this.cardNetwork = razorpayData.cardNetwork;
  if (razorpayData.bank) this.bank = razorpayData.bank;
  if (razorpayData.wallet) this.wallet = razorpayData.wallet;
  if (razorpayData.vpa) this.vpa = razorpayData.vpa;

  // Update status
  this.status = 'paid';
  this.paymentStatus = 'paid';
  this.paidAt = razorpayData.paidAt || new Date();

  // Calculate dates if not set
  if (!this.startDate) {
    this.startDate = this.paidAt;
  }
  if (!this.endDate && this.durationDays) {
    const endDate = new Date(this.startDate!);
    endDate.setDate(endDate.getDate() + this.durationDays);
    this.endDate = endDate;
  }

  // Calculate remaining days
  this.remainingDays = this.getRemainingDays();

  return this.save();
};

// Sync client details from User model (real-time dynamic data)
unifiedPaymentSchema.methods.syncClientDetails = async function (this: any): Promise<IUnifiedPayment> {
  if (!this.client) return this;

  try {
    const User = mongoose.model('User');
    const clientData = await User.findById(this.client).select('email phone firstName lastName');

    if (clientData) {
      this.payerEmail = clientData.email || this.payerEmail;
      this.payerPhone = clientData.phone || this.payerPhone;
      this.payerName = `${clientData.firstName || ''} ${clientData.lastName || ''}`.trim() || this.payerName;
      return this.save();
    }
  } catch (error) {
    console.error('Error syncing client details:', error);
  }

  return this as IUnifiedPayment;
};

// ========== STATIC METHODS ==========

// Find or create payment for a payment link (prevents duplicates)
unifiedPaymentSchema.statics.findOrCreateForPaymentLink = async function (
  paymentLinkId: mongoose.Types.ObjectId,
  data: Partial<IUnifiedPayment>
): Promise<IUnifiedPayment> {
  // Try to find existing payment
  let payment = await this.findOne({ paymentLink: paymentLinkId });

  if (payment) {
    // Update existing payment with new data (don't overwrite existing values with undefined)
    Object.keys(data).forEach(key => {
      if (data[key as keyof IUnifiedPayment] !== undefined) {
        (payment as any)[key] = data[key as keyof IUnifiedPayment];
      }
    });
    return payment.save();
  }

  // Create new payment
  payment = new this({
    paymentLink: paymentLinkId,
    ...data
  });

  return payment.save();
};

// Find by Razorpay Order ID
unifiedPaymentSchema.statics.findByRazorpayOrderId = async function (orderId: string): Promise<IUnifiedPayment | null> {
  return this.findOne({ razorpayOrderId: orderId });
};

// Find by Razorpay Payment ID
unifiedPaymentSchema.statics.findByRazorpayPaymentId = async function (paymentId: string): Promise<IUnifiedPayment | null> {
  return this.findOne({ razorpayPaymentId: paymentId });
};

// Find by Razorpay Payment Link ID
unifiedPaymentSchema.statics.findByRazorpayPaymentLinkId = async function (linkId: string): Promise<IUnifiedPayment | null> {
  return this.findOne({ razorpayPaymentLinkId: linkId });
};

// Get client's active purchase
unifiedPaymentSchema.statics.getClientActivePurchase = async function (clientId: string): Promise<IUnifiedPayment | null> {
  return this.findOne({
    client: clientId,
    status: { $in: ['paid', 'completed', 'active'] },
    paymentStatus: 'paid',
    endDate: { $gte: new Date() }
  })
    .populate('servicePlan', 'name category')
    .sort({ endDate: -1 });
};

// Get client's purchases
unifiedPaymentSchema.statics.getClientPurchases = async function (
  clientId: string,
  status?: string
): Promise<IUnifiedPayment[]> {
  const query: any = { client: clientId };
  if (status) {
    query.status = status;
  }

  return this.find(query)
    .populate('servicePlan', 'name category')
    .populate('dietitian', 'firstName lastName email')
    .sort({ createdAt: -1 });
};

// Sync client details for payments missing payer info (real-time data)
unifiedPaymentSchema.statics.syncClientDetailsForAllPayments = async function (): Promise<number> {
  try {
    // Find all payments without complete payer details
    const payments = await this.find({
      $or: [
        { payerEmail: { $exists: false } },
        { payerPhone: { $exists: false } },
        { payerName: { $exists: false } }
      ]
    });

    const User = mongoose.model('User');
    let syncedCount = 0;

    for (const payment of payments) {
      if (payment.client) {
        const clientData = await User.findById(payment.client).select('email phone firstName lastName');

        if (clientData) {
          let updated = false;

          if (!payment.payerEmail && clientData.email) {
            payment.payerEmail = clientData.email;
            updated = true;
          }
          if (!payment.payerPhone && clientData.phone) {
            payment.payerPhone = clientData.phone;
            updated = true;
          }
          if (!payment.payerName && (clientData.firstName || clientData.lastName)) {
            payment.payerName = `${clientData.firstName || ''} ${clientData.lastName || ''}`.trim();
            updated = true;
          }

          if (updated) {
            await payment.save();
            syncedCount++;
          }
        }
      }
    }

    console.log(`Synced client details for ${syncedCount} payments`);
    return syncedCount;
  } catch (error) {
    console.error('Error syncing client details for all payments:', error);
    return 0;
  }
};

// Sync Razorpay payment - UPDATE existing record OR CREATE new one (NO DUPLICATES)
// IMPORTANT: Always updates existing pending payments instead of creating duplicates
unifiedPaymentSchema.statics.syncRazorpayPayment = async function (
  identifier: {
    orderId?: string;
    paymentId?: string;
    paymentLinkId?: string;
    paymentLink?: mongoose.Types.ObjectId;
    otherPlatformPayment?: mongoose.Types.ObjectId;
    transactionId?: string;
    client?: mongoose.Types.ObjectId | string;
  },
  razorpayData: RazorpayPaymentData & Partial<IUnifiedPayment>
): Promise<IUnifiedPayment> {
  // Find existing payment by any identifier (check ALL identifiers to prevent duplicates)
  let payment: IUnifiedPayment | null = null;

  // Priority 1: Find by Razorpay IDs (most specific)
  if (identifier.orderId && identifier.orderId.trim()) {
    payment = await this.findOne({ razorpayOrderId: identifier.orderId });
    if (payment) console.log('Found payment by orderId:', identifier.orderId);
  }

  if (!payment && identifier.paymentId && identifier.paymentId.trim()) {
    payment = await this.findOne({ razorpayPaymentId: identifier.paymentId });
    if (payment) console.log('Found payment by paymentId:', identifier.paymentId);
  }

  if (!payment && identifier.paymentLinkId && identifier.paymentLinkId.trim()) {
    payment = await this.findOne({ razorpayPaymentLinkId: identifier.paymentLinkId });
    if (payment) console.log('Found payment by paymentLinkId:', identifier.paymentLinkId);
  }

  // Priority 2: Find by reference IDs
  if (!payment && identifier.paymentLink) {
    payment = await this.findOne({ paymentLink: identifier.paymentLink });
    if (payment) console.log('Found payment by paymentLink ref:', identifier.paymentLink);
  }

  if (!payment && identifier.otherPlatformPayment) {
    payment = await this.findOne({ otherPlatformPayment: identifier.otherPlatformPayment });
    if (payment) console.log('Found payment by otherPlatformPayment ref:', identifier.otherPlatformPayment);
  }

  if (!payment && identifier.transactionId && identifier.transactionId.trim()) {
    payment = await this.findOne({ transactionId: identifier.transactionId });
    if (payment) console.log('Found payment by transactionId:', identifier.transactionId);
  }

  // Priority 3: Find pending payment for same client (prevent duplicate pending payments)
  if (!payment && identifier.client && razorpayData.baseAmount) {
    payment = await this.findOne({
      client: identifier.client,
      status: 'pending',
      baseAmount: razorpayData.baseAmount,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Within last 24 hours
    }).sort({ createdAt: -1 });
    if (payment) console.log('Found existing pending payment for client');
  }

  if (payment) {
    // UPDATE existing payment - only update fields that have real values
    console.log('Updating existing payment:', payment._id);

    // Update Razorpay IDs only if provided and not empty
    if (identifier.orderId && identifier.orderId.trim()) {
      payment.razorpayOrderId = identifier.orderId;
    }
    if (identifier.paymentId && identifier.paymentId.trim()) {
      payment.razorpayPaymentId = identifier.paymentId;
    }
    if (identifier.paymentLinkId && identifier.paymentLinkId.trim()) {
      payment.razorpayPaymentLinkId = identifier.paymentLinkId;
    }
    if (razorpayData.razorpayOrderId && razorpayData.razorpayOrderId.trim()) {
      payment.razorpayOrderId = razorpayData.razorpayOrderId;
    }
    if (razorpayData.razorpayPaymentId && razorpayData.razorpayPaymentId.trim()) {
      payment.razorpayPaymentId = razorpayData.razorpayPaymentId;
    }
    if (razorpayData.razorpaySignature && razorpayData.razorpaySignature.trim()) {
      payment.razorpaySignature = razorpayData.razorpaySignature;
    }
    if (razorpayData.razorpayPaymentLinkId && razorpayData.razorpayPaymentLinkId.trim()) {
      payment.razorpayPaymentLinkId = razorpayData.razorpayPaymentLinkId;
    }

    // Update payment details only if provided
    if (razorpayData.paymentMethod) payment.paymentMethod = razorpayData.paymentMethod;
    if (razorpayData.transactionId) payment.transactionId = razorpayData.transactionId;

    // Update payer details only if provided
    if (razorpayData.payerEmail) payment.payerEmail = razorpayData.payerEmail;
    if (razorpayData.payerPhone) payment.payerPhone = razorpayData.payerPhone;
    if (razorpayData.payerName) payment.payerName = razorpayData.payerName;

    // Update card/bank details only if provided
    if (razorpayData.cardLast4) payment.cardLast4 = razorpayData.cardLast4;
    if (razorpayData.cardNetwork) payment.cardNetwork = razorpayData.cardNetwork;
    if (razorpayData.bank) payment.bank = razorpayData.bank;
    if (razorpayData.wallet) payment.wallet = razorpayData.wallet;
    if (razorpayData.vpa) payment.vpa = razorpayData.vpa;

    // Update amounts only if provided and greater than 0
    if (razorpayData.baseAmount && razorpayData.baseAmount > 0) {
      payment.baseAmount = razorpayData.baseAmount;
    }
    if (razorpayData.finalAmount && razorpayData.finalAmount > 0) {
      payment.finalAmount = razorpayData.finalAmount;
    }

    // Update plan details only if provided
    if (razorpayData.planName && razorpayData.planName.trim()) {
      payment.planName = razorpayData.planName;
    }
    if (razorpayData.planCategory && razorpayData.planCategory.trim()) {
      payment.planCategory = razorpayData.planCategory;
    }
    if (razorpayData.durationDays && razorpayData.durationDays > 0) {
      payment.durationDays = razorpayData.durationDays;
    }
    if (razorpayData.durationLabel && razorpayData.durationLabel.trim()) {
      payment.durationLabel = razorpayData.durationLabel;
    }

    // Update status - IMPORTANT: Only change if payment is confirmed
    if (razorpayData.status) {
      // If current status is pending, allow update to any status
      if (payment.status === 'pending' || payment.status === 'processing') {
        payment.status = razorpayData.status as any;
      }
      // If syncing shows paid/completed, update regardless
      if (razorpayData.status === 'paid' || razorpayData.status === 'completed') {
        payment.status = razorpayData.status as any;
      }
    }

    if (razorpayData.paymentStatus) {
      if (payment.paymentStatus === 'pending' || razorpayData.paymentStatus === 'paid') {
        payment.paymentStatus = razorpayData.paymentStatus as any;
      }
    }

    // Update dates
    if (razorpayData.paidAt) {
      payment.paidAt = razorpayData.paidAt;
      // Auto-set start and end dates on payment
      if (!payment.startDate) {
        payment.startDate = razorpayData.paidAt;
      }
      if (!payment.endDate && payment.durationDays) {
        const endDate = new Date(payment.startDate!);
        endDate.setDate(endDate.getDate() + payment.durationDays);
        payment.endDate = endDate;
      }
    }

    // Always auto-hydrate expected dates for paid payments if they are missing.
    if (
      payment.paymentStatus === 'paid' ||
      payment.status === 'paid' ||
      payment.status === 'completed' ||
      payment.status === 'active'
    ) {
      const inferredStart = payment.startDate || payment.paidAt || payment.purchaseDate;

      if (!payment.expectedStartDate && inferredStart) {
        payment.expectedStartDate = inferredStart;
      }

      if (!payment.expectedEndDate) {
        if (payment.endDate) {
          payment.expectedEndDate = payment.endDate;
        } else if (inferredStart && payment.durationDays) {
          const expectedEndDate = new Date(inferredStart);
          expectedEndDate.setDate(expectedEndDate.getDate() + payment.durationDays);
          payment.expectedEndDate = expectedEndDate;
        }
      }
    }

    return payment.save();
  }

  // CREATE new payment only if no existing record found
  // CRITICAL: Validate required fields before creating
  if (!razorpayData.client) {
    throw new Error('Cannot create payment without client ID');
  }

  console.log('Creating new UnifiedPayment - no existing record found');
  console.log('Identifiers checked:', identifier);

  const newPayment = new this({
    // Required fields
    client: razorpayData.client,

    // Optional references
    dietitian: razorpayData.dietitian,
    servicePlan: razorpayData.servicePlan,
    paymentLink: identifier.paymentLink || razorpayData.paymentLink,
    otherPlatformPayment: identifier.otherPlatformPayment || razorpayData.otherPlatformPayment,

    // Razorpay IDs (only set if provided)
    ...(identifier.orderId && { razorpayOrderId: identifier.orderId }),
    ...(identifier.paymentId && { razorpayPaymentId: identifier.paymentId }),
    ...(identifier.paymentLinkId && { razorpayPaymentLinkId: identifier.paymentLinkId }),
    ...(razorpayData.razorpayOrderId && { razorpayOrderId: razorpayData.razorpayOrderId }),
    ...(razorpayData.razorpayPaymentId && { razorpayPaymentId: razorpayData.razorpayPaymentId }),
    ...(razorpayData.razorpaySignature && { razorpaySignature: razorpayData.razorpaySignature }),
    ...(razorpayData.razorpayPaymentLinkId && { razorpayPaymentLinkId: razorpayData.razorpayPaymentLinkId }),
    ...(razorpayData.razorpayPaymentLinkUrl && { razorpayPaymentLinkUrl: razorpayData.razorpayPaymentLinkUrl }),
    ...(identifier.transactionId && { transactionId: identifier.transactionId }),
    ...(razorpayData.transactionId && { transactionId: razorpayData.transactionId }),

    // Amounts (only set if provided)
    ...(razorpayData.baseAmount && { baseAmount: razorpayData.baseAmount }),
    ...(razorpayData.finalAmount && { finalAmount: razorpayData.finalAmount }),
    ...(razorpayData.discountPercent && { discountPercent: razorpayData.discountPercent }),
    ...(razorpayData.discountAmount && { discountAmount: razorpayData.discountAmount }),
    currency: razorpayData.currency || 'INR',

    // Plan details (only set if provided)
    ...(razorpayData.planName && { planName: razorpayData.planName }),
    ...(razorpayData.planCategory && { planCategory: razorpayData.planCategory }),
    ...(razorpayData.durationDays && { durationDays: razorpayData.durationDays }),
    ...(razorpayData.durationLabel && { durationLabel: razorpayData.durationLabel }),

    // Payment details
    paymentType: razorpayData.paymentType || 'service_plan',
    ...(razorpayData.paymentMethod && { paymentMethod: razorpayData.paymentMethod }),

    // Payer details (only set if provided)
    ...(razorpayData.payerEmail && { payerEmail: razorpayData.payerEmail }),
    ...(razorpayData.payerPhone && { payerPhone: razorpayData.payerPhone }),
    ...(razorpayData.payerName && { payerName: razorpayData.payerName }),

    // Card/bank details (only set if provided)
    ...(razorpayData.cardLast4 && { cardLast4: razorpayData.cardLast4 }),
    ...(razorpayData.cardNetwork && { cardNetwork: razorpayData.cardNetwork }),
    ...(razorpayData.bank && { bank: razorpayData.bank }),
    ...(razorpayData.wallet && { wallet: razorpayData.wallet }),
    ...(razorpayData.vpa && { vpa: razorpayData.vpa }),

    // Status - default to pending unless specified
    status: razorpayData.status || 'pending',
    paymentStatus: razorpayData.paymentStatus || 'pending',

    // Dates
    ...(razorpayData.paidAt && { paidAt: razorpayData.paidAt }),
    ...(razorpayData.startDate && { startDate: razorpayData.startDate }),
    ...(razorpayData.endDate && { endDate: razorpayData.endDate }),
    ...(razorpayData.expectedStartDate && { expectedStartDate: razorpayData.expectedStartDate }),
    ...(razorpayData.expectedEndDate && { expectedEndDate: razorpayData.expectedEndDate })
  });

  return newPayment.save();
};

// Pre-save hook to calculate amounts, capture client details, and calculate remaining days
unifiedPaymentSchema.pre('save', async function (next) {
  try {
    // Capture client details if not already set (real-time dynamic data)
    if (this.client && (!this.payerEmail || !this.payerPhone || !this.payerName)) {
      try {
        const User = mongoose.model('User');
        const clientData = await User.findById(this.client).select('email phone firstName lastName');

        if (clientData) {
          // Only set if not already provided
          if (!this.payerEmail && clientData.email) {
            this.payerEmail = clientData.email;
          }
          if (!this.payerPhone && clientData.phone) {
            this.payerPhone = clientData.phone;
          }
          if (!this.payerName && (clientData.firstName || clientData.lastName)) {
            this.payerName = `${clientData.firstName || ''} ${clientData.lastName || ''}`.trim();
          }
        }
      } catch (err) {
        // If User model not available yet, continue without client details
        console.log('User model not available for client detail sync');
      }
    }

    // Calculate discount amount
    if (this.baseAmount && this.discountPercent) {
      this.discountAmount = Math.round(this.baseAmount * this.discountPercent / 100);
    }

    // Calculate tax amount
    const afterDiscount = this.baseAmount - (this.discountAmount || 0);
    if (afterDiscount && this.taxPercent) {
      this.taxAmount = Math.round(afterDiscount * this.taxPercent / 100);
    }

    // Calculate final amount if not set
    if (!this.finalAmount && this.baseAmount) {
      this.finalAmount = afterDiscount + (this.taxAmount || 0);
    }

    // Sync amount field for backward compatibility (always use finalAmount or baseAmount)
    this.amount = this.finalAmount || this.baseAmount || this.amount || 0;

    // Calculate remaining days (plan allocation: durationDays - daysUsed)
    if (this.durationDays !== undefined) {
      this.remainingDays = Math.max(0, (this.durationDays || 0) - (this.daysUsed || 0));
    }

    // Set default duration label
    if (!this.durationLabel && this.durationDays) {
      this.durationLabel = `${this.durationDays} Days`;
    }

    // Safety net: for paid purchases, ensure expected dates always exist.
    if (
      this.paymentStatus === 'paid' ||
      this.status === 'paid' ||
      this.status === 'completed' ||
      this.status === 'active'
    ) {
      const inferredStartDate = this.startDate || this.paidAt || this.purchaseDate;

      if (!this.expectedStartDate && inferredStartDate) {
        this.expectedStartDate = inferredStartDate;
      }

      if (!this.expectedEndDate) {
        if (this.endDate) {
          this.expectedEndDate = this.endDate;
        } else if (inferredStartDate && this.durationDays) {
          const expectedEndDate = new Date(inferredStartDate);
          expectedEndDate.setDate(expectedEndDate.getDate() + this.durationDays);
          this.expectedEndDate = expectedEndDate;
        }
      }
    }

    next();
  } catch (error) {
    console.error('Error in pre-save hook:', error);
    next();
  }
});

// Clear cached model to prevent schema conflicts
delete mongoose.models.UnifiedPayment;

const UnifiedPayment = mongoose.model<IUnifiedPayment, IUnifiedPaymentModel>('UnifiedPayment', unifiedPaymentSchema);

export default UnifiedPayment;
