import mongoose, { Schema } from 'mongoose';

const EcommercePaymentSchema = new Schema({
  paymentId: { type: String, required: true, unique: true, index: true },
  transactionId: { type: String, trim: true },
  orderId: { type: String, trim: true, index: true },
  externalOrderId: { type: String, trim: true },
  status: { type: String, trim: true, default: 'pending' },
  paymentType: { type: String, trim: true },
  paymentMethod: { type: String, trim: true },
  currency: { type: String, default: 'INR', uppercase: true },
  amount: { type: Number, default: 0 },
  paymentDate: { type: Date },
  payer: {
    name: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true }
  },
  origin: { type: String, trim: true, default: 'external' },
  source: { type: String, trim: true },
  raw: { type: Schema.Types.Mixed }
}, {
  timestamps: true,
  collection: 'ecommercepayment'
});

EcommercePaymentSchema.index({ paymentDate: -1 });
EcommercePaymentSchema.index({ status: 1 });

const EcommercePayment = mongoose.models.EcommercePayment || mongoose.model('EcommercePayment', EcommercePaymentSchema);

export default EcommercePayment;
