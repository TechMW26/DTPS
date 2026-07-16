import mongoose, { Schema, Document } from 'mongoose';

export interface IWatchHealthData extends Document {
  userId: mongoose.Types.ObjectId;
  date: Date;
  
  // Steps data
  watchSteps: {
    count: number;
    goal: number;
    distance?: number; // in meters
    timestamp: Date;
  };
  
  // Heart rate data
  watchHeartRate: {
    current: number;
    min: number;
    max: number;
    average: number;
    restingHr?: number;
    readings: { value: number; timestamp: Date }[];
  };
  
  // Sleep data
  watchSleep: {
    totalHours: number;
    deepSleepHours: number;
    lightSleepHours: number;
    remSleepHours: number;
    awakeDuration: number; // minutes
    sleepStart?: Date;
    sleepEnd?: Date;
    sleepQuality?: 'poor' | 'fair' | 'good' | 'excellent';
  };
  
  // Blood oxygen (SpO2)
  watchOxygen: {
    current: number; // percentage
    min: number;
    max: number;
    average: number;
    readings: { value: number; timestamp: Date }[];
  };
  
  // Stress level
  watchStress: {
    current: number; // 0-100
    average: number;
    level: 'low' | 'moderate' | 'high' | 'very_high';
    readings: { value: number; timestamp: Date }[];
  };
  
  // Breathing/Respiratory rate
  watchBreathing: {
    current: number; // breaths per minute
    average: number;
    min: number;
    max: number;
  };
  
  // Activity data
  watchActivity: {
    activeMinutes: number;
    sedentaryMinutes: number;
    standingHours: number;
    workouts: {
      type: string;
      duration: number; // minutes
      caloriesBurned: number;
      startTime: Date;
      endTime: Date;
    }[];
  };
  
  // Calories burned
  watchCalories: {
    total: number;
    active: number;
    resting: number;
    goal: number;
  };
  
  // Watch device info
  watchDevice: {
    name: string;
    type: 'apple_watch' | 'google_fit' | 'fitbit' | 'samsung' | 'garmin' | 'noisefit' | 'other';
    model?: string;
    lastSyncTime: Date;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

const WatchHealthDataSchema = new Schema<IWatchHealthData>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    
    // Steps
    watchSteps: {
      count: { type: Number, default: 0 },
      goal: { type: Number, default: 10000 },
      distance: { type: Number },
      timestamp: { type: Date, default: Date.now },
    },
    
    // Heart Rate
    watchHeartRate: {
      current: { type: Number, default: 0 },
      min: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
      average: { type: Number, default: 0 },
      restingHr: { type: Number },
      readings: [{
        value: Number,
        timestamp: Date,
      }],
    },
    
    // Sleep
    watchSleep: {
      totalHours: { type: Number, default: 0 },
      deepSleepHours: { type: Number, default: 0 },
      lightSleepHours: { type: Number, default: 0 },
      remSleepHours: { type: Number, default: 0 },
      awakeDuration: { type: Number, default: 0 },
      sleepStart: { type: Date },
      sleepEnd: { type: Date },
      sleepQuality: { type: String, enum: ['poor', 'fair', 'good', 'excellent'] },
    },
    
    // Oxygen
    watchOxygen: {
      current: { type: Number, default: 0 },
      min: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
      average: { type: Number, default: 0 },
      readings: [{
        value: Number,
        timestamp: Date,
      }],
    },
    
    // Stress
    watchStress: {
      current: { type: Number, default: 0 },
      average: { type: Number, default: 0 },
      level: { type: String, enum: ['low', 'moderate', 'high', 'very_high'], default: 'low' },
      readings: [{
        value: Number,
        timestamp: Date,
      }],
    },
    
    // Breathing
    watchBreathing: {
      current: { type: Number, default: 0 },
      average: { type: Number, default: 0 },
      min: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
    },
    
    // Activity
    watchActivity: {
      activeMinutes: { type: Number, default: 0 },
      sedentaryMinutes: { type: Number, default: 0 },
      standingHours: { type: Number, default: 0 },
      workouts: [{
        type: { type: String },
        duration: Number,
        caloriesBurned: Number,
        startTime: Date,
        endTime: Date,
      }],
    },
    
    // Calories
    watchCalories: {
      total: { type: Number, default: 0 },
      active: { type: Number, default: 0 },
      resting: { type: Number, default: 0 },
      goal: { type: Number, default: 2000 },
    },
    
    // Device Info
    watchDevice: {
      name: { type: String, default: 'Unknown' },
      type: { 
        type: String, 
        enum: ['apple_watch', 'google_fit', 'fitbit', 'samsung', 'garmin', 'noisefit', 'other'],
        default: 'other',
      },
      model: { type: String },
      lastSyncTime: { type: Date, default: Date.now },
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for user + date queries
WatchHealthDataSchema.index({ userId: 1, date: -1 });

const WatchHealthData = mongoose.models.WatchHealthData || 
  mongoose.model<IWatchHealthData>('WatchHealthData', WatchHealthDataSchema);

export default WatchHealthData;
