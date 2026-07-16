import mongoose, { Schema } from 'mongoose';

const EcommerceBlogSchema = new Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, trim: true, index: true },
  summary: { type: String, trim: true },
  content: { type: String },
  imageUrl: { type: String, trim: true },
  imageKitFileId: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  tags: { type: [String], default: [] },
  origin: { type: String, default: 'admin', trim: true },
  raw: { type: Schema.Types.Mixed }
}, {
  timestamps: true,
  collection: 'ecommerceblog'
});

const EcommerceBlog = mongoose.models.EcommerceBlog || mongoose.model('EcommerceBlog', EcommerceBlogSchema);

export default EcommerceBlog;
