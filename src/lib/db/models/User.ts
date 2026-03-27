import mongoose, { Schema } from 'mongoose';
import { IUser, UserRole, UserStatus, ClientStatus } from '@/types';

const availabilitySchema = new Schema({
  day: {
    type: String,
    required: true,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  }
});

const fitnessDataSchema = new Schema({
  dailyRecords: [{
    date: String, // YYYY-MM-DD format
    steps: { type: Number, default: 0 },
    calories: { type: Number, default: 0 },
    distance: { type: Number, default: 0 }, // in meters
    heartRate: Number,
    activeMinutes: { type: Number, default: 0 },
    deviceType: String,
    lastSync: Date
  }],
  goals: {
    dailySteps: { type: Number, default: 10000 },
    dailyCalories: { type: Number, default: 500 },
    dailyDistance: { type: Number, default: 5000 }, // in meters
    dailyActiveMinutes: { type: Number, default: 60 }
  },
  preferences: {
    units: { type: String, enum: ['metric', 'imperial'], default: 'metric' },
    notifications: { type: Boolean, default: true },
    autoSync: { type: Boolean, default: true }
  },
  connectedDevice: String,
  lastSync: Date
});

// FCM Token schema for push notifications
const fcmTokenSchema = new Schema({
  token: {
    type: String,
    required: true
  },
  deviceType: {
    type: String,
    enum: ['web', 'android', 'ios'],
    default: 'web'
  },
  deviceInfo: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUsed: {
    type: Date,
    default: Date.now
  }
});

const userSchema = new Schema({
  email: {
    type: String,
    required: false,
    lowercase: true,
    trim: true,
    sparse: true
  },
  dtps_id: {
    type: String,
    trim: true,
    unique: true,
    sparse: true
  },
  clientId: {
    type: String,
    trim: true,
    unique: true,
    sparse: true,
    description: 'Sequential client ID (C-1, C-2, etc.) for clients only'
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    required: true,
    enum: Object.values(UserRole),
    default: UserRole.CLIENT
  },
  status: {
    type: String,
    required: true,
    enum: Object.values(UserStatus),
    default: UserStatus.ACTIVE
  },
  // Client engagement status (different from account status)
  clientStatus: {
    type: String,
    enum: [...Object.values(ClientStatus), 'leading', 'onboarding', 'paused'],
    default: ClientStatus.LEAD
  },
  phone: {
    type: String,
    trim: true,
    sparse: true,
    unique: true,
    // Phone is required for clients, validated in pre-save hook
  },
  avatar: {
    type: String
  },
  emailVerified: {
    type: Boolean,
    default: false
  },

  // Dietitian specific fields
  credentials: [{
    type: String
  }],
  specializations: [{
    type: String
  }],
  experience: {
    type: Number,
    min: 0
  },
  bio: {
    type: String,
    maxlength: 1000
  },
  consultationFee: {
    type: Number,
    min: 0
  },
  availability: [availabilitySchema],
  timezone: {
    type: String,
    default: 'UTC'
  },

  // Client specific fields
  dateOfBirth: {
    type: Date
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other']
  },
  // Additional basic info fields
  parentAccount: { type: String },
  alternativePhone: { type: String, trim: true },
  alternativeEmail: { type: String, trim: true, lowercase: true },
  anniversary: { type: Date },
  source: {
    type: String,
    // enum: ['google_ads', 'facebook_ads', 'instagram', 'referral', 'other', '']
  },
  referralSource: { type: String },
  maritalStatus: { type: String },
  occupation: { type: String },
  targetWeightBucket: { type: String },
  sharePhotoConsent: { type: Boolean, default: false },
  // NOTE: Physical measurements (height, weight, BMI) are stored in LifestyleInfo model
  // NOTE: Medical data (conditions, allergies, restrictions) are stored in MedicalInfo model
  height: {
    type: Number,
    min: 0
  },
  weight: {
    type: Number,
    min: 0
  },
  // Height in feet/inches for import compatibility
  heightFeet: {
    type: String,
    description: 'Height in feet (for import compatibility)'
  },
  heightInch: {
    type: String,
    description: 'Height in inches (for import compatibility)'
  },
  heightCm: {
    type: String,
    description: 'Height in centimeters'
  },
  weightKg: {
    type: String,
    description: 'Weight in kg (string format)'
  },
  targetWeightKg: {
    type: String,
    description: 'Target weight in kg'
  },
  // Activity level
  activityLevel: {
    type: String,
    enum: ['', 'sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extremely_active'],
    default: '',
    description: 'Physical activity level'
  },
  activityRate: {
    type: String,
    description: 'Activity rate description'
  },
  // Health metrics
  bmr: {
    type: Number,
    min: 0,
    description: 'Basal Metabolic Rate (calories)'
  },
  bodyFat: {
    type: Number,
    min: 0,
    max: 100,
    description: 'Body fat percentage'
  },
  idealWeight: {
    type: Number,
    min: 0,
    description: 'Ideal weight target (kg)'
  },
  targetBmi: {
    type: Number,
    min: 0,
    max: 60,
    description: 'Target BMI'
  },
  // These fields are also stored in LifestyleInfo for detailed tracking
  // The User model fields are for quick access and import compatibility
  bmiCategory: {
    type: String,
    enum: ['', 'Underweight', 'Normal', 'Overweight', 'Obese'],
    default: ''
  },
  healthGoals: [{
    type: String
  }],

  // Allow any goal value since goal categories are dynamically defined in admin panel
  generalGoal: {
    type: String,
    default: ''
  },

  documents: [
    {
      type: {
        type: String,
        enum: ["meal-picture", "medical-report"],
        required: true,
      },
      fileName: { type: String, required: true },
      filePath: { type: String, required: true },
      uploadedAt: { type: Date, default: Date.now },
    }
  ],

  goals: {
    calories: { type: Number, default: 1800 },
    protein: { type: Number, default: 120 },
    carbs: { type: Number, default: 200 },
    fat: { type: Number, default: 60 },
    water: { type: Number, default: 8 },
    steps: { type: Number, default: 10000 },
    targetWeight: { type: Number },
    currentWeight: { type: Number }
  },
  // DEPRECATED: These fields moved to MedicalInfo - keeping for backward compatibility
  // Use MedicalInfo model for new data
  // medicalConditions, allergies, dietaryRestrictions - see MedicalInfo
  assignedDietitian: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  // Support for multiple dietitians per client
  assignedDietitians: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Assigned Health Counselor for client (single - legacy)
  assignedHealthCounselor: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  // Support for multiple health counselors per client
  assignedHealthCounselors: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],

  // Tags for categorizing/organizing clients
  tags: [{
    type: Schema.Types.ObjectId,
    ref: 'Tag'
  }],

  // Fitness tracking data
  fitnessData: fitnessDataSchema,

  // WooCommerce integration data
  wooCommerceData: {
    customerId: Number,
    totalOrders: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    processingOrders: { type: Number, default: 0 },
    completedOrders: { type: Number, default: 0 },
    processingAmount: { type: Number, default: 0 },
    completedAmount: { type: Number, default: 0 },
    firstOrderDate: Date,
    lastOrderDate: Date,
    lastSyncDate: Date,
    orders: [{
      orderId: Number,
      orderNumber: String,
      status: String,
      total: Number,
      currency: String,
      dateCreated: String,
      paymentMethod: String,
      paymentMethodTitle: String,
      transactionId: String
    }]
  },

  // Google Calendar integration data
  googleCalendarAccessToken: {
    type: String
  },
  googleCalendarRefreshToken: {
    type: String
  },
  googleCalendarTokenExpiry: {
    type: Date
  },

  // Track last login time
  lastLoginAt: {
    type: Date
  },

  // Onboarding status for new clients
  onboardingCompleted: {
    type: Boolean,
    default: false
  },
  onboardingStep: {
    type: Number,
    default: 0
  },

  // Daily goals set during onboarding
  dailyGoals: {
    calories: { type: Number, default: 2000 },
    steps: { type: Number, default: 8000 },
    water: { type: Number, default: 2500 },
    sleep: { type: Number, default: 7.5 }
  },

  // Dietary preferences
  dietType: {
    type: String,
    default: ''
  },
  specificExclusions: {
    alcoholFree: { type: Boolean, default: false },
    porkFree: { type: Boolean, default: false }
  },

  // User settings for notifications, reminders, appearance
  settings: {
    pushNotifications: { type: Boolean, default: true },
    emailNotifications: { type: Boolean, default: true },
    mealReminders: { type: Boolean, default: true },
    appointmentReminders: { type: Boolean, default: true },
    progressUpdates: { type: Boolean, default: false },
    darkMode: { type: Boolean, default: false },
    soundEnabled: { type: Boolean, default: true }
  },

  // Push notification subscription
  pushNotificationEnabled: { type: Boolean, default: false },

  // FCM Push Notification Tokens (supports multiple devices)
  fcmTokens: [fcmTokenSchema],

  // Reminder preferences
  reminderPreferences: {
    mealReminders: { type: Boolean, default: true },
    mealTimes: [{ type: String }],
    appointmentReminders: { type: Boolean, default: true },
    reminderBefore: { type: Number, default: 30 } // minutes before appointment
  },

  // Password Reset Token fields
  passwordResetToken: {
    type: String,
    default: null
  },
  passwordResetTokenExpiry: {
    type: Date,
    default: null
  },

  // Track who created this user (for clients created by dietitian or health counselor)
  createdBy: {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['self', 'dietitian', 'health_counselor', 'admin', ''],
      default: ''
    }
  }
}, {
  timestamps: true,
  autoIndex: false // Disable automatic index creation to prevent duplicate warnings
});

// Index for better query performance - define on schema before model creation

userSchema.index({ role: 1 });
userSchema.index({ assignedDietitian: 1 });
userSchema.index({ assignedDietitians: 1 });
userSchema.index({ clientStatus: 1 }); // For filtering by status
userSchema.index({ createdAt: -1 }); // For sorting by newest
userSchema.index({ email: 1 }, { unique: true, sparse: true }); // Unique email lookup (sparse allows null)
userSchema.index({ phone: 1 }, { unique: true, sparse: true }); // Unique phone (sparse allows null)
// Compound indexes for common queries in admin panel
userSchema.index({ role: 1, clientStatus: 1 });
userSchema.index({ role: 1, assignedDietitian: 1 });
userSchema.index({ role: 1, createdAt: -1 });
// Text index for search functionality
userSchema.index({ firstName: 'text', lastName: 'text', email: 'text' });

// Pre-save hook to auto-generate clientId for new clients
userSchema.pre('save', async function (next) {
  // Validate phone is required for clients
  if (this.role === UserRole.CLIENT && !this.phone) {
    return next(new Error('Phone number is required for clients'));
  }

  // Only generate clientId for new client users who don't have one
  if (this.isNew && this.role === UserRole.CLIENT && !this.clientId) {
    try {
      // Find the highest existing clientId number using aggregation for proper numeric sorting
      const User = mongoose.model('User');
      const result = await User.aggregate([
        { $match: { role: UserRole.CLIENT, clientId: { $exists: true, $ne: null, $regex: /^C-\d+$/ } } },
        { $project: { clientIdNum: { $toInt: { $substr: ['$clientId', 2, -1] } } } },
        { $sort: { clientIdNum: -1 } },
        { $limit: 1 }
      ]);

      let nextNumber = 1;
      if (result.length > 0 && result[0].clientIdNum) {
        nextNumber = result[0].clientIdNum + 1;
      }
      this.clientId = `C-${nextNumber}`;
    } catch (error) {
      console.error('Error generating clientId:', error);
      // Continue without clientId if there's an error
    }
  }
  next();
});

// Pre-save hook to hash password with bcrypt
userSchema.pre('save', async function (next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const bcrypt = require('bcrypt');

    // Skip if password is already hashed (starts with $2b$ or $2a$)
    if (this.password.startsWith('$2b$') || this.password.startsWith('$2a$')) {
      return next();
    }

    // Generate salt and hash password
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Password comparison method using bcrypt
userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  const bcrypt = require('bcrypt');

  // If password is already hashed (starts with $2b$), use bcrypt compare
  if (this.password.startsWith('$2b$')) {
    return await bcrypt.compare(candidatePassword, this.password);
  }

  // Fallback for plain text passwords (should not happen in production)
  return this.password === candidatePassword;
};

// Virtual for full name
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Ensure virtual fields are serialized
userSchema.set('toJSON', {
  virtuals: true,
  transform: function (_doc: any, ret: any) {
    delete ret.password;
    return ret;
  }
});

const User = mongoose.models.User || mongoose.model<IUser>('User', userSchema);

export default User;
