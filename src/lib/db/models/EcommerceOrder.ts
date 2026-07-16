import mongoose, { Schema } from 'mongoose';

const EcommerceOrderItemSchema = new Schema({
  itemId: { type: String, trim: true },
  sku: { type: String, trim: true },
  name: { type: String, trim: true, required: true },
  quantity: { type: Number, default: 1 },
  price: { type: Number, default: 0 },
  total: { type: Number, default: 0 }
}, { _id: false });

const EcommerceAddressSchema = new Schema({
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  email: { type: String, trim: true },
  phone: { type: String, trim: true },
  address1: { type: String, trim: true },
  address2: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  postalCode: { type: String, trim: true },
  country: { type: String, trim: true }
}, { _id: false });

const EcommerceOrderSchema = new Schema({
  orderId: { type: String, required: true, unique: true, index: true },
  externalOrderId: { type: String, trim: true },
  status: { type: String, trim: true, default: 'pending' },
  paymentStatus: { type: String, trim: true, default: 'pending' },
  orderDate: { type: Date },
  updatedDate: { type: Date },
  currency: { type: String, default: 'INR', uppercase: true },
  totalAmount: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  shippingAmount: { type: Number, default: 0 },
  customer: {
    customerId: { type: String, trim: true },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true }
  },
  billingAddress: { type: EcommerceAddressSchema, default: {} },
  shippingAddress: { type: EcommerceAddressSchema, default: {} },
  items: { type: [EcommerceOrderItemSchema], default: [] },
  origin: { type: String, trim: true, default: 'external' },
  source: { type: String, trim: true },
  notes: { type: String, trim: true },
  raw: { type: Schema.Types.Mixed }
}, {
  timestamps: true,
  collection: 'ecommerceorder'
});

EcommerceOrderSchema.index({ orderDate: -1 });
EcommerceOrderSchema.index({ status: 1 });
EcommerceOrderSchema.index({ paymentStatus: 1 });

const EcommerceOrder = mongoose.models.EcommerceOrder || mongoose.model('EcommerceOrder', EcommerceOrderSchema);

export default EcommerceOrder;
