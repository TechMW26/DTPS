import mongoose, { Schema, Document } from 'mongoose';
import { MEAL_TYPES, MEAL_TYPE_KEYS } from '@/lib/mealConfig';

// Get label variations for backward compatibility
const JOURNAL_MEAL_TYPES = [...MEAL_TYPE_KEYS.map(k => MEAL_TYPES[k].label), 'Snack'];

// Activity Entry Interface
export interface IActivityEntry {
  _id?: mongoose.Types.ObjectId;
  name: string;
  sets: number;
  reps: number;
  duration: number; // in minutes
  videoLink?: string; // Optional video link
  completed?: boolean; // Client marks as completed
  completedAt?: Date;
  time: string;
  createdAt: Date;
}

// Steps Entry Interface
export interface IStepsEntry {
  _id?: mongoose.Types.ObjectId;
  steps: number;
  distance: number; // in km
  calories: number;
  time: string;
  createdAt: Date;
}

// Water Entry Interface
export interface IWaterEntry {
  _id?: mongoose.Types.ObjectId;
  amount: number;
  unit: string; // 'Glass (250ml)', 'Bottle (500ml)', 'Bottle (1L)', 'Cup (200ml)', 'ml'
  type?: string; // water, coffee, tea, juice, etc.
  time: string;
  createdAt: Date;
}

// Sleep Entry Interface
export interface ISleepEntry {
  _id?: mongoose.Types.ObjectId;
  hours: number;
  minutes: number;
  quality: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  time: string;
  createdAt: Date;
}

// Calories/Meal Entry Interface
export interface IMealEntry {
  _id?: mongoose.Types.ObjectId;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  type: 'Early Morning' | 'Breakfast' | 'Mid Morning' | 'Lunch' | 'Mid Evening' | 'Evening' | 'Dinner' | 'Past Dinner' | 'Snack';
  time: string;
  consumed: boolean;
  photo?: string; // URL of uploaded meal photo
  notes?: string; // User notes about the meal
  fromMealPlan?: boolean; // If meal is from assigned diet plan
  mealPlanId?: string; // Reference to the original meal plan
  unit?: string; // Portion unit
  createdAt: Date;
}

// Progress Entry Interface
export interface IProgressEntry {
  _id?: mongoose.Types.ObjectId;
  weight: number;
  bmi: number;
  bmr: number;
  bodyFat: number;
  dietPlan: string;
  notes: string;
  date: Date;
  createdAt: Date;
}

// BCA Entry Interface
export interface IBCAEntry {
  _id?: mongoose.Types.ObjectId;
  bcaType: 'karada' | 'inbody' | 'tanita';
  measurementDate: Date;
  // Basic Info
  height: number;
  weight: number;
  bmi: number;
  // Body Info
  fatPercentage: number;
  visceralFat: number;
  restingMetabolism: number;
  bodyAge: number;
  fatMass: number;
  totalSubcutFat: number;
  subcutFatTrunk: number;
  subcutFatArms: number;
  subcutFatLegs: number;
  totalSkeletalMuscle: number;
  skeletalMuscleTrunk: number;
  skeletalMuscleArms: number;
  skeletalMuscleLegs: number;
  waist: number;
  hip: number;
  neck: number;
  waterContent: number;
  boneWeight: number;
  createdAt: Date;
}

// Measurement Entry Interface
export interface IMeasurementEntry {
  _id?: mongoose.Types.ObjectId;
  arm: number;
  waist: number;
  abd: number;
  chest: number;
  hips: number;
  thigh: number;
  date: Date;
  addedBy?: string;
  createdAt: Date;
}

// Main Journal Tracking Interface
export interface IJournalTracking extends Document {
  client: mongoose.Types.ObjectId;
  date: Date;
  activities: IActivityEntry[];
  steps: IStepsEntry[];
  water: IWaterEntry[];
  sleep: ISleepEntry[];
  meals: IMealEntry[];
  progress: IProgressEntry[];
  bca: IBCAEntry[];
  measurements: IMeasurementEntry[];
  assignedWater?: {
    amount: number;
    assignedBy: mongoose.Types.ObjectId;
    assignedAt: Date;
    isCompleted: boolean;
    completedAt?: Date;
  };
  assignedSteps?: {
    target: number;
    assignedBy: mongoose.Types.ObjectId;
    assignedAt: Date;
    isCompleted: boolean;
    completedAt?: Date;
  };
  assignedSleep?: {
    targetHours: number;
    targetMinutes: number;
    assignedBy: mongoose.Types.ObjectId;
    assignedAt: Date;
    isCompleted: boolean;
    completedAt?: Date;
  };
  assignedActivities?: {
    activities: Array<{
      name: string;
      sets: number;
      reps: number;
      duration: number;
      videoLink?: string;
      completed: boolean;
      completedAt?: Date;
    }>;
    assignedBy: mongoose.Types.ObjectId;
    assignedAt: Date;
    isCompleted: boolean;
    completedAt?: Date;
  };
  targets: {
    steps: number;
    water: number; // in ml
    sleep: number; // in hours
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    activityMinutes: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Activity Entry Schema
const activityEntrySchema = new Schema({
  name: { type: String, required: true },
  sets: { type: Number, default: 0, min: 0 },
  reps: { type: Number, default: 0, min: 0 },
  duration: { type: Number, default: 0, min: 0 }, // minutes
  videoLink: { type: String, default: '' },
  completed: { type: Boolean, default: false },
  completedAt: { type: Date },
  time: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

// Steps Entry Schema
const stepsEntrySchema = new Schema({
  steps: { type: Number, required: true, min: 0 },
  distance: { type: Number, default: 0, min: 0 }, // km
  calories: { type: Number, default: 0, min: 0 },
  time: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

// Water Entry Schema
const waterEntrySchema = new Schema({
  amount: { type: Number, required: true, min: 0 },
  unit: {
    type: String,
    required: true,
    enum: ['Glass (250ml)', 'Bottle (500ml)', 'Bottle (1L)', 'Cup (200ml)', 'glasses', 'ml', 'ML', 'L', 'l', 'cups']
  },
  type: { type: String, default: 'water' }, // water, coffee, tea, juice, etc.
  time: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

// Sleep Entry Schema
const sleepEntrySchema = new Schema({
  hours: { type: Number, required: true, min: 0, max: 24 },
  minutes: { type: Number, default: 0, min: 0, max: 59 },
  quality: {
    type: String,
    enum: ['Excellent', 'Good', 'Fair', 'Poor'],
    default: 'Fair'
  },
  time: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

// Meal Entry Schema
const mealEntrySchema = new Schema({
  name: { type: String, required: true },
  calories: { type: Number, default: 0, min: 0 },
  protein: { type: Number, default: 0, min: 0 },
  carbs: { type: Number, default: 0, min: 0 },
  fat: { type: Number, default: 0, min: 0 },
  type: {
    type: String,
    enum: JOURNAL_MEAL_TYPES,
    required: true
  },
  time: { type: String, required: true },
  consumed: { type: Boolean, default: false },
  photo: { type: String, default: '' }, // URL of uploaded meal photo
  notes: { type: String, default: '' }, // User notes about the meal
  fromMealPlan: { type: Boolean, default: false }, // If meal is from assigned diet plan
  mealPlanId: { type: String, default: '' }, // Reference to the original meal plan
  unit: { type: String, default: '' }, // Portion unit
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

// Progress Entry Schema
const progressEntrySchema = new Schema({
  weight: { type: Number, default: 0, min: 0 },
  bmi: { type: Number, default: 0, min: 0 },
  bmr: { type: Number, default: 0, min: 0 },
  bodyFat: { type: Number, default: 0, min: 0 },
  dietPlan: { type: String, default: '' },
  notes: { type: String, default: '' },
  date: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

// BCA Entry Schema
const bcaEntrySchema = new Schema({
  bcaType: {
    type: String,
    enum: ['karada', 'inbody', 'tanita'],
    default: 'karada'
  },
  measurementDate: { type: Date, default: Date.now },
  // Basic Info
  height: { type: Number, default: 0, min: 0 },
  weight: { type: Number, default: 0, min: 0 },
  bmi: { type: Number, default: 0, min: 0 },
  // Body Info
  fatPercentage: { type: Number, default: 0, min: 0 },
  visceralFat: { type: Number, default: 0, min: 0 },
  restingMetabolism: { type: Number, default: 0, min: 0 },
  bodyAge: { type: Number, default: 0, min: 0 },
  fatMass: { type: Number, default: 0, min: 0 },
  totalSubcutFat: { type: Number, default: 0, min: 0 },
  subcutFatTrunk: { type: Number, default: 0, min: 0 },
  subcutFatArms: { type: Number, default: 0, min: 0 },
  subcutFatLegs: { type: Number, default: 0, min: 0 },
  totalSkeletalMuscle: { type: Number, default: 0, min: 0 },
  skeletalMuscleTrunk: { type: Number, default: 0, min: 0 },
  skeletalMuscleArms: { type: Number, default: 0, min: 0 },
  skeletalMuscleLegs: { type: Number, default: 0, min: 0 },
  waist: { type: Number, default: 0, min: 0 },
  hip: { type: Number, default: 0, min: 0 },
  neck: { type: Number, default: 0, min: 0 },
  waterContent: { type: Number, default: 0, min: 0 },
  boneWeight: { type: Number, default: 0, min: 0 },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

// Measurement Entry Schema
const measurementEntrySchema = new Schema({
  arm: { type: Number, default: 0, min: 0 },
  waist: { type: Number, default: 0, min: 0 },
  abd: { type: Number, default: 0, min: 0 },
  chest: { type: Number, default: 0, min: 0 },
  hips: { type: Number, default: 0, min: 0 },
  thigh: { type: Number, default: 0, min: 0 },
  date: { type: Date, default: Date.now },
  addedBy: { type: String, default: 'client' }, // 'client', 'dietitian', 'admin'
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

// Main Journal Tracking Schema
const journalTrackingSchema = new Schema({
  client: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  activities: [activityEntrySchema],
  steps: [stepsEntrySchema],
  water: [waterEntrySchema],
  sleep: [sleepEntrySchema],
  meals: [mealEntrySchema],
  progress: [progressEntrySchema],
  bca: [bcaEntrySchema],
  measurements: [measurementEntrySchema],
  assignedWater: {
    amount: { type: Number, default: 0 },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedAt: { type: Date },
    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date }
  },
  assignedSteps: {
    target: { type: Number, default: 0 },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedAt: { type: Date },
    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date }
  },
  assignedSleep: {
    targetHours: { type: Number, default: 0 },
    targetMinutes: { type: Number, default: 0 },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedAt: { type: Date },
    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date }
  },
  assignedActivities: {
    activities: [{
      name: { type: String },
      sets: { type: Number, default: 0 },
      reps: { type: Number, default: 0 },
      duration: { type: Number, default: 0 },
      videoLink: { type: String, default: '' },
      completed: { type: Boolean, default: false },
      completedAt: { type: Date }
    }],
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedAt: { type: Date },
    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date }
  },
  targets: {
    steps: { type: Number, default: 10000 },
    water: { type: Number, default: 2500 }, // ml
    sleep: { type: Number, default: 8 }, // hours
    calories: { type: Number, default: 2000 },
    protein: { type: Number, default: 150 },
    carbs: { type: Number, default: 250 },
    fat: { type: Number, default: 65 },
    activityMinutes: { type: Number, default: 60 }
  }
}, {
  timestamps: true
});

// Compound index for unique client-date combination
journalTrackingSchema.index({ client: 1, date: 1 }, { unique: true });

// Virtual for total steps
journalTrackingSchema.virtual('totalSteps').get(function () {
  return this.steps.reduce((sum, entry) => sum + entry.steps, 0);
});

// Virtual for total water in ml
journalTrackingSchema.virtual('totalWaterMl').get(function () {
  const unitToMl: Record<string, number> = {
    'Glass (250ml)': 250,
    'Bottle (500ml)': 500,
    'Bottle (1L)': 1000,
    'Cup (200ml)': 200,
    'glasses': 250
  };
  return this.water.reduce((sum, entry) => sum + (entry.amount * (unitToMl[entry.unit] || 250)), 0);
});

// Virtual for total sleep in minutes
journalTrackingSchema.virtual('totalSleepMinutes').get(function () {
  return this.sleep.reduce((sum, entry) => sum + (entry.hours * 60) + entry.minutes, 0);
});

// Virtual for total activity duration
journalTrackingSchema.virtual('totalActivityMinutes').get(function () {
  return this.activities.reduce((sum, entry) => sum + entry.duration, 0);
});

// Virtual for consumed calories
journalTrackingSchema.virtual('consumedCalories').get(function () {
  return this.meals.filter(m => m.consumed).reduce((sum, entry) => sum + entry.calories, 0);
});

// Ensure virtuals are included in JSON
journalTrackingSchema.set('toJSON', { virtuals: true });
journalTrackingSchema.set('toObject', { virtuals: true });

const JournalTracking = mongoose.models.JournalTracking || mongoose.model<IJournalTracking>('JournalTracking', journalTrackingSchema);

export default JournalTracking;
