import mongoose, { Schema } from 'mongoose';

const LeadSchema = new Schema({
  name: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  source: { type: String, trim: true, default: 'external' },
  status: { type: String, trim: true, default: 'new' },
  message: { type: String, trim: true },
  notes: { type: String, trim: true },
  metadata: { type: Schema.Types.Mixed },
  origin: { type: String, trim: true, default: 'dtps' }
}, {
  timestamps: true,
  collection: 'lead'
});

LeadSchema.index({ email: 1 });
LeadSchema.index({ phone: 1 });
LeadSchema.index({ status: 1 });
LeadSchema.index({ createdAt: -1 });

const Lead = mongoose.models.Lead || mongoose.model('Lead', LeadSchema);

export default Lead;
