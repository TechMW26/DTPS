import mongoose, { Schema, Document } from 'mongoose';

// WooCommerce Order interface
export interface IWooCommerceOrder {
  orderId: number;
  orderNumber: string;
  status: string;
  total: number;
  currency: string;
  dateCreated: string;
  dateModified: string;
  datePaid?: string;
  paymentMethod: string;
  paymentMethodTitle: string;
  transactionId: string;
  customerId: number;
}

// WooCommerce Client interface
export interface IWooCommerceClient extends Document {
  _id: import('mongoose').Types.ObjectId;
  name: string;
  email: string;
  password: string;
  phone?: string;
  city?: string;
  country?: string;
  
  // Order statistics
  totalOrders: number;
  processingOrders: number;
  completedOrders: number;
  
  // Financial data
  totalSpent: number;
  processingAmount: number;
  completedAmount: number;
  currency: string;
  
  // Timeline
  firstOrderDate: Date;
  lastOrderDate: Date;
  
  // Order details
  orders: IWooCommerceOrder[];
  
  // Sync information
  lastSyncDate: Date;
  wooCommerceCustomerId?: number;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// Order schema
const orderSchema = new Schema({
  orderId: {
    type: Number,
    required: true
  },
  orderNumber: {
    type: String,
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed']
  },
  total: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    default: 'INR'
  },
  dateCreated: {
    type: String,
    required: true
  },
  dateModified: {
    type: String,
    required: true
  },
  datePaid: {
    type: String
  },
  paymentMethod: {
    type: String,
    required: true
  },
  paymentMethodTitle: {
    type: String,
    required: true
  },
  transactionId: {
    type: String
  },
  customerId: {
    type: Number
  }
}, { _id: false });

// Main WooCommerce Client schema
const wooCommerceClientSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    default: 'Password123'
  },
  phone: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    trim: true
  },
  country: {
    type: String,
    trim: true
  },
  
  // Order statistics
  totalOrders: {
    type: Number,
    default: 0,
    min: 0
  },
  processingOrders: {
    type: Number,
    default: 0,
    min: 0
  },
  completedOrders: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Financial data
  totalSpent: {
    type: Number,
    default: 0,
    min: 0
  },
  processingAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  completedAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  
  // Timeline
  firstOrderDate: {
    type: Date,
    required: true
  },
  lastOrderDate: {
    type: Date,
    required: true
  },
  
  // Order details
  orders: {
    type: [orderSchema],
    default: []
  },
  
  // Sync information
  lastSyncDate: {
    type: Date,
    default: Date.now
  },
  wooCommerceCustomerId: {
    type: Number
  }
}, {
  timestamps: true
});

// Indexes for better query performance (email index is already created by unique: true in schema)
wooCommerceClientSchema.index({ totalSpent: -1 });
wooCommerceClientSchema.index({ lastOrderDate: -1 });
wooCommerceClientSchema.index({ country: 1, city: 1 });
wooCommerceClientSchema.index({ lastSyncDate: -1 });

// Virtual for full name display
wooCommerceClientSchema.virtual('displayName').get(function() {
  return this.name || this.email;
});

// Method to add or update an order
wooCommerceClientSchema.methods.addOrder = function(orderData: IWooCommerceOrder) {
  // Remove existing order with same ID if it exists
  this.orders = this.orders.filter((order: IWooCommerceOrder) => order.orderId !== orderData.orderId);
  
  // Add the new/updated order
  this.orders.push(orderData);
  
  // Recalculate statistics
  this.recalculateStats();
};

// Static method to generate sequential password
wooCommerceClientSchema.statics.generatePassword = async function(clientNumber: number) {
  return `Password${clientNumber.toString().padStart(3, '0')}`;
};

// Method to recalculate order statistics
wooCommerceClientSchema.methods.recalculateStats = function() {
  this.totalOrders = this.orders.length;
  this.processingOrders = this.orders.filter((order: IWooCommerceOrder) => order.status === 'processing').length;
  this.completedOrders = this.orders.filter((order: IWooCommerceOrder) => order.status === 'completed').length;
  
  this.totalSpent = this.orders.reduce((sum: number, order: IWooCommerceOrder) => sum + order.total, 0);
  this.processingAmount = this.orders
    .filter((order: IWooCommerceOrder) => order.status === 'processing')
    .reduce((sum: number, order: IWooCommerceOrder) => sum + order.total, 0);
  this.completedAmount = this.orders
    .filter((order: IWooCommerceOrder) => order.status === 'completed')
    .reduce((sum: number, order: IWooCommerceOrder) => sum + order.total, 0);
  
  // Update timeline
  if (this.orders.length > 0) {
    const dates = this.orders.map((order: IWooCommerceOrder) => new Date(order.dateCreated));
    this.firstOrderDate = new Date(Math.min(...dates.map((d: Date) => d.getTime())));
    this.lastOrderDate = new Date(Math.max(...dates.map((d: Date) => d.getTime())));
  }
  
  this.lastSyncDate = new Date();
};

// Ensure virtual fields are serialized
wooCommerceClientSchema.set('toJSON', {
  virtuals: true,
  transform: function(_doc: any, ret: any) {
    delete ret.__v;
    return ret;
  }
});

const WooCommerceClient = mongoose.models.WooCommerceClient || 
  mongoose.model<IWooCommerceClient>('WooCommerceClient', wooCommerceClientSchema);

export default WooCommerceClient;
