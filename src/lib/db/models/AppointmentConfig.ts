import mongoose, { Schema, Model, Document } from 'mongoose';

// ============ Appointment Type Model ============
export interface IAppointmentType extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  duration: number; // Default duration in minutes
  color?: string;
  icon?: string;
  isActive: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const appointmentTypeSchema = new Schema<IAppointmentType>({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  description: {
    type: String,
    maxlength: 500
  },
  duration: {
    type: Number,
    required: true,
    default: 60
  },
  color: {
    type: String,
    default: '#3B82F6' // Blue
  },
  icon: {
    type: String,
    default: 'calendar'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

appointmentTypeSchema.index({ isActive: 1, order: 1 });

// ============ Appointment Mode Model ============
export interface IAppointmentMode extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  requiresMeetingLink: boolean;
  requiresLocation: boolean;
  isActive: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const appointmentModeSchema = new Schema<IAppointmentMode>({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  description: {
    type: String,
    maxlength: 500
  },
  icon: {
    type: String,
    default: 'video'
  },
  requiresMeetingLink: {
    type: Boolean,
    default: false
  },
  requiresLocation: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

appointmentModeSchema.index({ isActive: 1, order: 1 });

// ============ Provider Availability Model ============
export interface IProviderAvailability extends Document {
  _id: mongoose.Types.ObjectId;
  providerId: mongoose.Types.ObjectId;
  providerRole: 'dietitian' | 'health_counselor';
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  startTime: string; // HH:mm format (24-hour)
  endTime: string; // HH:mm format (24-hour)
  slotDuration: number; // Duration per slot in minutes
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const providerAvailabilitySchema = new Schema<IProviderAvailability>({
  providerId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  providerRole: {
    type: String,
    enum: ['dietitian', 'health_counselor'],
    required: true
  },
  dayOfWeek: {
    type: Number,
    required: true,
    min: 0,
    max: 6
  },
  startTime: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  endTime: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  slotDuration: {
    type: Number,
    default: 60,
    min: 15,
    max: 180
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

providerAvailabilitySchema.index({ providerId: 1, dayOfWeek: 1 });
providerAvailabilitySchema.index({ providerId: 1, isActive: 1 });

// Ensure schema updates are applied during development/hot reload
if (mongoose.models.AppointmentType) {
  delete mongoose.models.AppointmentType;
}
if (mongoose.models.AppointmentMode) {
  delete mongoose.models.AppointmentMode;
}
if (mongoose.models.ProviderAvailability) {
  delete mongoose.models.ProviderAvailability;
}

// ============ Model Exports ============
export const AppointmentType = mongoose.model<IAppointmentType>('AppointmentType', appointmentTypeSchema);

export const AppointmentMode = mongoose.model<IAppointmentMode>('AppointmentMode', appointmentModeSchema);

export const ProviderAvailability = mongoose.model<IProviderAvailability>('ProviderAvailability', providerAvailabilitySchema);

export default { AppointmentType, AppointmentMode, ProviderAvailability };
