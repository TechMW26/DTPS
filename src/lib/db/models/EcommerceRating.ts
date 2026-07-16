import mongoose, { Schema } from 'mongoose';

const EcommerceRatingSchema = new Schema({
  name: { type: String, trim: true },
  rating: { type: Number, min: 1, max: 5, default: 5 },
  message: { type: String, trim: true },
  imageUrl: { type: String, trim: true },
  imageKitFileId: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  origin: { type: String, default: 'admin', trim: true },
  raw: { type: Schema.Types.Mixed }
}, {
  timestamps: true,
  collection: 'ecommercerating'
});

const EcommerceRating = mongoose.models.EcommerceRating || mongoose.model('EcommerceRating', EcommerceRatingSchema);

export default EcommerceRating;
