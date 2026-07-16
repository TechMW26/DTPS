import mongoose, { Schema } from 'mongoose';

const EcommerceTransformationSchema = new Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  beforeImageUrl: { type: String, trim: true },
  afterImageUrl: { type: String, trim: true },
  imageKitFileIdBefore: { type: String, trim: true },
  imageKitFileIdAfter: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  origin: { type: String, default: 'admin', trim: true },
  raw: { type: Schema.Types.Mixed }
}, {
  timestamps: true,
  collection: 'ecommercetransformation'
});

const EcommerceTransformation = mongoose.models.EcommerceTransformation || mongoose.model('EcommerceTransformation', EcommerceTransformationSchema);

export default EcommerceTransformation;
