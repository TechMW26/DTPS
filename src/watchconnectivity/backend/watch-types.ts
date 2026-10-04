export interface IWatchConnection {
  _id: string;
  userId: string;

  // Watch provider type
  watchProvider: 'apple_watch' | 'google_fit' | 'fitbit' | 'samsung' | 'garmin' | 'noisefit' | 'other';

  // OAuth tokens (encrypted)
  watchAccessToken?: string;
  watchRefreshToken?: string;
  watchTokenExpiry?: Date;

  // Connection status
  watchIsConnected: boolean;
  watchLastSync?: Date;
  watchSyncEnabled: boolean;

  // Device details
  watchDeviceName?: string;
  watchDeviceModel?: string;
  watchDeviceId?: string;

  // Sync preferences
  watchSyncPreferences: {
    syncSteps: boolean;
    syncHeartRate: boolean;
    syncSleep: boolean;
    syncOxygen: boolean;
    syncStress: boolean;
    syncBreathing: boolean;
    syncActivity: boolean;
    syncCalories: boolean;
  };

  // Auto sync interval (in minutes)
  watchAutoSyncInterval: number;

  createdAt: Date;
  updatedAt: Date;
}

export interface IWatchHealthData {
  _id: string;
  userId: string;
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
