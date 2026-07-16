import mongoose, { Schema, Document } from 'mongoose';

export interface ISubscriptionPlan extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  duration: number; // in days
  durationType: 'days' | 'weeks' | 'months';
  price: number;
  currency: string;
  features: string[];
  category: 'weight-loss' | 'weight-gain' | 'muscle-gain' | 'diabetes' | 'pcos' | 'thyroid' | 'general-wellness' | 'custom';
  isActive: boolean;
  consultationsIncluded: number;
  dietPlanIncluded: boolean;
  followUpsIncluded: number;
  chatSupport: boolean;
  videoCallsIncluded: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionPlanSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 1000
  },
  duration: {
    type: Number,
    required: true,
    min: 1
  },
  durationType: {
    type: String,
    required: true,
    enum: ['days', 'weeks', 'months'],
    default: 'months'
  },
  price: {
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
  features: [{
    type: String,
    trim: true
  }],
  category: {
    type: String,
    required: true,
    enum: ['weight-loss', 'weight-gain', 'muscle-gain', 'diabetes', 'pcos', 'thyroid', 'general-wellness', 'custom']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  consultationsIncluded: {
    type: Number,
    default: 0,
    min: 0
  },
  dietPlanIncluded: {
    type: Boolean,
    default: true
  },
  followUpsIncluded: {
    type: Number,
    default: 0,
    min: 0
  },
  chatSupport: {
    type: Boolean,
    default: true
  },
  videoCallsIncluded: {
    type: Number,
    default: 0,
    min: 0
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
subscriptionPlanSchema.index({ isActive: 1, category: 1 });
subscriptionPlanSchema.index({ price: 1 });

const SubscriptionPlan = mongoose.models.SubscriptionPlan || mongoose.model<ISubscriptionPlan>('SubscriptionPlan', subscriptionPlanSchema);

export default SubscriptionPlan;

