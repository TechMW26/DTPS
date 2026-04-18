import mongoose, { Schema, Document } from 'mongoose';

// Interface for pricing tier based on duration
export interface IPricingTier {
  durationDays: number;
  durationLabel: string; // e.g., "7 Days", "1 Month", "3 Months"
  amount: number;
  maxDiscount: number; // Max discount percentage for this tier (0-100%)
  extendDays?: number; // Number of days to extend the plan
  freezeDays?: number; // Number of days the plan can be frozen
  isActive: boolean;
}

// Interface for the service plan
export interface IServicePlan extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  category: 'weight-loss' | 'weight-gain' | 'muscle-gain' | 'diabetes' | 'pcos' | 'thyroid' | 'general-wellness' | 'detox' | 'sports-nutrition' | 'custom';
  description?: string;
  pricingTiers: IPricingTier[];
  features: string[];
  isActive: boolean;
  showToClients: boolean; // Whether to show this plan to clients in the user dashboard
  maxDiscountPercent: number; // Max 100%
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Interface for client's purchased plan
export interface IClientPurchase extends Document {
  _id: mongoose.Types.ObjectId;
  client: mongoose.Types.ObjectId;
  dietitian?: mongoose.Types.ObjectId;
  servicePlan?: mongoose.Types.ObjectId;
  paymentLink?: mongoose.Types.ObjectId;
  otherPlatformPayment?: mongoose.Types.ObjectId;

  // Plan details at time of purchase
  planName: string;
  planCategory: string;
  durationDays: number;
  durationLabel: string;

  // Selected tier info
  selectedTier?: {
    durationDays: number;
    durationLabel: string;
    amount: number;
    extendDays?: number;
    freezeDays?: number;
  };

  baseAmount?: number;
  discountPercent?: number;
  taxPercent?: number;
  finalAmount?: number;

  // Dates
  purchaseDate?: Date;
  startDate?: Date;
  endDate?: Date;

  // Expected dates (dietitian's expected start/end for meal plan)
  expectedStartDate?: Date;
  expectedEndDate?: Date;

  // Parent purchase reference (for multi-phase plans sharing freeze days)
  parentPurchaseId?: mongoose.Types.ObjectId;

  // Status
  status: 'active' | 'expired' | 'cancelled' | 'pending';

  // Payment status
  paymentStatus?: 'pending' | 'paid' | 'failed' | 'refunded';

  // Payment details
  paymentMethod?: string;
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
  paidAt?: Date;

  // Meal plan tracking
  mealPlanCreated: boolean;
  mealPlanId?: mongoose.Types.ObjectId;
  daysUsed: number;
  extendedDaysUsed?: number;

  createdAt: Date;
  updatedAt: Date;
}

// Pricing tier schema
const pricingTierSchema = new Schema({
  durationDays: {
    type: Number,
    required: true,
    min: 1
  },
  durationLabel: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  maxDiscount: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  extendDays: {
    type: Number,
    default: 0,
    min: 0,
    description: 'Number of days to extend the plan'
  },
  freezeDays: {
    type: Number,
    default: 0,
    min: 0,
    description: 'Number of days the plan can be frozen'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { _id: true });

// Service plan schema
const servicePlanSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  category: {
    type: String,
    required: true,
    enum: ['weight-loss', 'weight-gain', 'muscle-gain', 'diabetes', 'pcos', 'thyroid', 'general-wellness', 'detox', 'sports-nutrition', 'custom']
  },
  description: {
    type: String,
    maxlength: 10000 // Increased to support rich text HTML content
  },
  pricingTiers: [pricingTierSchema],
  features: [{
    type: String,
    trim: true
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  showToClients: {
    type: Boolean,
    default: true
  },
  maxDiscountPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true,
  autoIndex: false
});

// Client purchase schema
const clientPurchaseSchema = new Schema({
  client: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  dietitian: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false // Not always known at purchase time
  },
  servicePlan: {
    type: Schema.Types.ObjectId,
    ref: 'ServicePlan',
    required: false
  },
  paymentLink: {
    type: Schema.Types.ObjectId,
    ref: 'PaymentLink',
    required: false
  },

  // Reference to other platform payment (if payment was made via other platform)
  otherPlatformPayment: {
    type: Schema.Types.ObjectId,
    ref: 'OtherPlatformPayment',
  },

  // Plan details at time of purchase
  planName: {
    type: String,
    required: false,
    default: 'Diet Plan'
  },
  planCategory: {
    type: String,
    required: false,
    default: 'general'
  },
  durationDays: {
    type: Number,
    required: false,
    default: 30,
    min: 1
  },
  durationLabel: {
    type: String,
    required: false,
    default: '30 Days'
  },

  // Selected tier info
  selectedTier: {
    durationDays: { type: Number },
    durationLabel: { type: String },
    amount: { type: Number },
    extendDays: { type: Number, default: 0 },
    freezeDays: { type: Number, default: 0 }
  },

  baseAmount: {
    type: Number,
    required: false,
    default: 0,
    min: 0
  },
  discountPercent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  taxPercent: {
    type: Number,
    default: 0,
    min: 0
  },
  finalAmount: {
    type: Number,
    required: false,
    default: 0,
    min: 0
  },

  // Dates
  purchaseDate: {
    type: Date,
    required: false,
    default: Date.now
  },
  startDate: {
    type: Date,
    required: false,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: false
  },

  // Expected dates (dietitian's expected start/end for meal plan)
  expectedStartDate: {
    type: Date,
    required: false
  },
  expectedEndDate: {
    type: Date,
    required: false
  },

  // Parent purchase reference (for multi-phase plans sharing freeze days)
  parentPurchaseId: {
    type: Schema.Types.ObjectId,
    ref: 'ClientPurchase',
    required: false
  },

  // Status
  status: {
    type: String,
    required: false,
    enum: ['active', 'expired', 'cancelled', 'pending'],
    default: 'active'
  },

  // Payment status
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },

  // Payment details
  paymentMethod: {
    type: String,
    default: 'razorpay'
  },
  razorpayPaymentId: {
    type: String
  },
  razorpayOrderId: {
    type: String
  },
  paidAt: {
    type: Date
  },

  // Meal plan tracking
  mealPlanCreated: {
    type: Boolean,
    default: false
  },
  mealPlanId: {
    type: Schema.Types.ObjectId,
    ref: 'ClientMealPlan'
  },
  daysUsed: {
    type: Number,
    default: 0,
    min: 0
  },
  extendedDaysUsed: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true,
  autoIndex: false
});

// Indexes
servicePlanSchema.index({ name: 1, category: 1 });
servicePlanSchema.index({ isActive: 1, category: 1 });
clientPurchaseSchema.index({ client: 1, status: 1 });
clientPurchaseSchema.index({ client: 1, endDate: -1 });

// Static method to get active pricing for a plan
servicePlanSchema.statics.getActivePricingTiers = function (planId: string) {
  return this.findById(planId).select('name category pricingTiers maxDiscountPercent').lean();
};

// Static method to get client's active purchase
clientPurchaseSchema.statics.getClientActivePurchase = function (clientId: string) {
  return this.findOne({
    client: clientId,
    status: 'active',
    endDate: { $gte: new Date() }
  })
    .populate('servicePlan', 'name category')
    .sort({ endDate: -1 });
};

// Method to check remaining days (plan allocation: durationDays - daysUsed)
clientPurchaseSchema.methods.getRemainingDays = function () {
  // Plan allocation remaining = durationDays - daysUsed
  const durationDays = this.durationDays || 0;
  const daysUsed = this.daysUsed || 0;
  return Math.max(0, durationDays - daysUsed);
};

// Method to get calendar days until end date (for expiration tracking)
clientPurchaseSchema.methods.getCalendarDaysUntilEnd = function () {
  if (!this.endDate && !this.expectedEndDate) return 0;
  const now = new Date();
  const endDate = new Date(this.expectedEndDate || this.endDate);
  const diffTime = endDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
};

// Method to check if can create meal plan
clientPurchaseSchema.methods.canCreateMealPlan = function (requestedDays: number) {
  const remainingDays = this.getRemainingDays();
  return {
    canCreate: this.status === 'active' && remainingDays >= requestedDays,
    remainingDays,
    maxDays: remainingDays,
    message: this.status !== 'active'
      ? 'Purchase is not active'
      : remainingDays < requestedDays
        ? `Only ${remainingDays} days remaining in plan`
        : 'OK'
  };
};

// Clear cached models to prevent schema conflicts
delete mongoose.models.ServicePlan;
delete mongoose.models.ClientPurchase;

const ServicePlan = mongoose.model<IServicePlan>('ServicePlan', servicePlanSchema);
const ClientPurchase = mongoose.model<IClientPurchase>('ClientPurchase', clientPurchaseSchema);

export { ServicePlan, ClientPurchase };
export default ServicePlan;
