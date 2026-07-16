import mongoose, { Schema } from 'mongoose';

const EcommercePlanSchema = new Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  price: { type: Number, default: 0 },
  currency: { type: String, default: 'INR', uppercase: true },
  durationDays: { type: Number, default: 0 },
  imageUrl: { type: String, trim: true },
  imageKitFileId: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  origin: { type: String, default: 'admin', trim: true },
  raw: { type: Schema.Types.Mixed }
}, {
  timestamps: true,
  collection: 'ecommerceplan'
});

const EcommercePlan = mongoose.models.EcommercePlan || mongoose.model('EcommercePlan', EcommercePlanSchema);

export default EcommercePlan;
