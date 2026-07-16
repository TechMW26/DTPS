import mongoose, { Schema, Document } from 'mongoose';

export interface IWatchConnection extends Document {
  userId: mongoose.Types.ObjectId;
  
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

const WatchConnectionSchema = new Schema<IWatchConnection>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    
    watchProvider: {
      type: String,
      enum: ['apple_watch', 'google_fit', 'fitbit', 'samsung', 'garmin', 'noisefit', 'other'],
      required: true,
    },
    
    watchAccessToken: {
      type: String,
      select: false, // Don't return in queries by default
    },
    watchRefreshToken: {
      type: String,
      select: false,
    },
    watchTokenExpiry: {
      type: Date,
    },
    
    watchIsConnected: {
      type: Boolean,
      default: false,
    },
    watchLastSync: {
      type: Date,
    },
    watchSyncEnabled: {
      type: Boolean,
      default: true,
    },
    
    watchDeviceName: {
      type: String,
    },
    watchDeviceModel: {
      type: String,
    },
    watchDeviceId: {
      type: String,
    },
    
    watchSyncPreferences: {
      syncSteps: { type: Boolean, default: true },
      syncHeartRate: { type: Boolean, default: true },
      syncSleep: { type: Boolean, default: true },
      syncOxygen: { type: Boolean, default: true },
      syncStress: { type: Boolean, default: true },
      syncBreathing: { type: Boolean, default: true },
      syncActivity: { type: Boolean, default: true },
      syncCalories: { type: Boolean, default: true },
    },
    
    watchAutoSyncInterval: {
      type: Number,
      default: 30, // 30 minutes
    },
  },
  {
    timestamps: true,
  }
);

const WatchConnection = mongoose.models.WatchConnection || 
  mongoose.model<IWatchConnection>('WatchConnection', WatchConnectionSchema);

export default WatchConnection;
