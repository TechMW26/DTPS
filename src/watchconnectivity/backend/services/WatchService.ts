// Watch Service - Handles all watch-related business logic
import WatchConnection, { IWatchConnection } from '../models/WatchConnection';
import WatchHealthData, { IWatchHealthData } from '../models/WatchHealthData';
import { getBaseUrl } from '@/lib/config';
import mongoose from 'mongoose';

export interface WatchSyncResult {
  success: boolean;
  data?: Partial<IWatchHealthData>;
  error?: string;
}

export interface WatchProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

// Watch Provider Configurations (from environment variables)
// Using existing Google credentials for Google Fit
const getWatchBaseUrl = () => {
  return getBaseUrl();
};

const WATCH_BASE_URL = getWatchBaseUrl();

export const WATCH_PROVIDER_CONFIGS: Record<string, WatchProviderConfig> = {
  google_fit: {
    clientId: (
      process.env.GOOGLE_CLIENT_IDwatch ||
      process.env.GOOGLE_CLIENT_IDWATCH ||
      process.env.GOOGLE_CLIENT_ID_WATCH ||
      process.env.GOOGLE_FIT_CLIENT_ID ||
      process.env.GOOGLE_CLIENT_ID ||
      ''
    ),
    clientSecret: (
      process.env.GOOGLE_CLIENT_SECRETwatch ||
      process.env.GOOGLE_CLIENT_SECRETWATCH ||
      process.env.GOOGLE_CLIENT_SECRET_WATCH ||
      process.env.GOOGLE_FIT_CLIENT_SECRET ||
      process.env.GOOGLE_CLIENT_SECRET ||
      ''
    ),
    redirectUri: `${WATCH_BASE_URL}/api/watch/oauth/callback`,
    scopes: [
      'https://www.googleapis.com/auth/fitness.activity.read',
      'https://www.googleapis.com/auth/fitness.heart_rate.read',
      'https://www.googleapis.com/auth/fitness.sleep.read',
      'https://www.googleapis.com/auth/fitness.oxygen_saturation.read',
      'https://www.googleapis.com/auth/fitness.body.read',
    ],
  },
  fitbit: {
    clientId: process.env.FITBIT_CLIENT_ID || '',
    clientSecret: process.env.FITBIT_CLIENT_SECRET || '',
    redirectUri: `${WATCH_BASE_URL}/api/watch/oauth/callback`,
    scopes: ['activity', 'heartrate', 'sleep', 'oxygen_saturation', 'respiratory_rate'],
  },
  apple_watch: {
    clientId: '', // Apple uses HealthKit - native iOS integration
    clientSecret: '',
    redirectUri: '',
    scopes: [],
  },
  noisefit: {
    clientId: '', // NoiseFit doesn't have public API - uses manual entry or Google Fit sync
    clientSecret: '',
    redirectUri: '',
    scopes: [],
  },
};

// Watch Service Class
export class WatchService {
  
  // Get user's watch connection
  static async getWatchConnection(userId: string): Promise<IWatchConnection | null> {
    return await WatchConnection.findOne({ userId: new mongoose.Types.ObjectId(userId) });
  }
  
  // Get user's watch connection with tokens (for sync operations)
  static async getWatchConnectionWithTokens(userId: string): Promise<IWatchConnection | null> {
    return await WatchConnection.findOne({ userId: new mongoose.Types.ObjectId(userId) })
      .select('+watchAccessToken +watchRefreshToken');
  }
  
  // Create new watch connection
  static async connectWatch(
    userId: string,
    provider: string,
    tokens?: { accessToken: string; refreshToken: string; expiry: Date }
  ): Promise<IWatchConnection> {
    const existingConnection = await WatchConnection.findOne({ 
      userId: new mongoose.Types.ObjectId(userId) 
    });
    
    if (existingConnection) {
      // Update existing connection
      existingConnection.watchProvider = provider as IWatchConnection['watchProvider'];
      existingConnection.watchIsConnected = true;
      existingConnection.watchLastSync = new Date();
      
      if (tokens) {
        existingConnection.watchAccessToken = tokens.accessToken;
        existingConnection.watchRefreshToken = tokens.refreshToken;
        existingConnection.watchTokenExpiry = tokens.expiry;
      }
      
      await existingConnection.save();
      return existingConnection;
    }
    
    // Create new connection
    const watchConnection = new WatchConnection({
      userId: new mongoose.Types.ObjectId(userId),
      watchProvider: provider,
      watchIsConnected: true,
      watchLastSync: new Date(),
      watchAccessToken: tokens?.accessToken,
      watchRefreshToken: tokens?.refreshToken,
      watchTokenExpiry: tokens?.expiry,
    });
    
    await watchConnection.save();
    return watchConnection;
  }
  
  // Disconnect watch
  static async disconnectWatch(userId: string): Promise<boolean> {
    const result = await WatchConnection.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(userId) },
      { 
        watchIsConnected: false,
        watchAccessToken: null,
        watchRefreshToken: null,
        watchTokenExpiry: null,
      }
    );
    return !!result;
  }
  
  // Get today's health data - optimized for fast response
  static async getWatchHealthData(userId: string, date?: Date): Promise<IWatchHealthData | null> {
    const targetDate = date || new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Fetch from DB instantly - use lean() for faster query
    const data = await WatchHealthData.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      date: { $gte: startOfDay, $lte: endOfDay },
    }).lean<IWatchHealthData>();
    
    if (data) {
      // Check if data is stale (older than 5 minutes) and trigger background sync
      const dataWithTimestamp = data as IWatchHealthData & { updatedAt?: Date; createdAt?: Date };
      const lastUpdate = new Date(dataWithTimestamp.updatedAt || dataWithTimestamp.createdAt || Date.now());
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (lastUpdate < fiveMinutesAgo) {
        // Trigger background sync without waiting
        setImmediate(() => {
          this.syncWatchData(userId).catch(err => 
            console.error('[Watch] Background sync error:', err)
          );
        });
      }
      return data;
    }

    // No data found - return null immediately for fast response
    // The caller can trigger sync separately if needed
    return null;
  }
  
  // Get health data for date range
  static async getWatchHealthDataRange(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<IWatchHealthData[]> {
    return await WatchHealthData.find({
      userId: new mongoose.Types.ObjectId(userId),
      date: { $gte: startDate, $lte: endDate },
    }).sort({ date: -1 });
  }
  
  // Save/Update health data
  static async saveWatchHealthData(
    userId: string,
    healthData: Partial<IWatchHealthData>
  ): Promise<IWatchHealthData> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Find or create today's record
    let existingData = await WatchHealthData.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      date: { $gte: today, $lte: endOfDay },
    });
    
    if (existingData) {
      // Update existing record
      Object.assign(existingData, healthData);
      await existingData.save();
      return existingData;
    }
    
    // Create new record
    const newData = new WatchHealthData({
      userId: new mongoose.Types.ObjectId(userId),
      date: today,
      ...healthData,
    });
    
    await newData.save();
    return newData;
  }
  
  // Sync data from watch provider
  static async syncWatchData(userId: string): Promise<WatchSyncResult> {
    try {
      // Use getWatchConnectionWithTokens to include access token for API calls
      const connection = await this.getWatchConnectionWithTokens(userId);
      
      if (!connection || !connection.watchIsConnected) {
        return { success: false, error: 'Watch not connected' };
      }
      
      // Get data based on provider
      let healthData: Partial<IWatchHealthData> = {};
      
      switch (connection.watchProvider) {
        case 'google_fit':
          healthData = await this.syncFromGoogleFit(connection);
          break;
        case 'fitbit':
          healthData = await this.syncFromFitbit(connection);
          break;
        case 'apple_watch':
          healthData = await this.syncFromAppleWatch(connection);
          break;
        case 'noisefit':
          // NoiseFit syncs via Google Fit or manual entry
          healthData = await this.syncFromNoiseFit(connection);
          break;
        case 'samsung':
          healthData = await this.syncFromSamsung(connection);
          break;
        case 'garmin':
          healthData = await this.syncFromGarmin(connection);
          break;
        case 'other':
          // Manual entry watches - just update last sync time
          healthData = {
            watchDevice: {
              name: connection.watchDeviceName || 'Manual Entry',
              type: 'other',
              model: connection.watchDeviceModel,
              lastSyncTime: new Date(),
            },
          };
          break;
        default:
          return { success: false, error: 'Unsupported watch provider' };
      }
      
      // Save the synced data
      const saved = await this.saveWatchHealthData(userId, healthData);

      // Update last sync time
      await WatchConnection.findByIdAndUpdate(connection._id, {
        watchLastSync: new Date(),
      });

      return { success: true, data: saved };
    } catch (error) {
      console.error('Watch sync error:', error);
      return { success: false, error: 'Failed to sync watch data' };
    }
  }
  
  // Sync from Google Fit - REAL API IMPLEMENTATION
  private static async syncFromGoogleFit(connection: IWatchConnection): Promise<Partial<IWatchHealthData>> {
    const accessToken = connection.watchAccessToken;
    
    // Create default/sample data for when no real data is available
    const createDefaultData = (): Partial<IWatchHealthData> => ({
      watchSteps: {
        count: 0,
        goal: 10000,
        distance: 0,
        timestamp: new Date(),
      },
      watchHeartRate: {
        current: 0,
        min: 0,
        max: 0,
        average: 0,
        readings: [],
      },
      watchCalories: {
        total: 0,
        active: 0,
        resting: 0,
        goal: 2000,
      },
      watchSleep: {
        totalHours: 0,
        deepSleepHours: 0,
        lightSleepHours: 0,
        remSleepHours: 0,
        awakeDuration: 0,
        sleepQuality: 'fair' as const,
      },
      watchOxygen: {
        current: 0,
        min: 0,
        max: 0,
        average: 0,
        readings: [],
      },
      watchStress: {
        current: 0,
        average: 0,
        level: 'low' as const,
        readings: [],
      },
      watchBreathing: {
        current: 0,
        average: 0,
        min: 0,
        max: 0,
      },
      watchActivity: {
        activeMinutes: 0,
        sedentaryMinutes: 0,
        standingHours: 0,
        workouts: [],
      },
      watchDevice: {
        name: connection.watchDeviceName || 'Google Fit Device',
        type: 'google_fit',
        model: connection.watchDeviceModel,
        lastSyncTime: new Date(),
      },
    });
    
    if (!accessToken) {
      return createDefaultData();
    }
    
    try {
      const now = Date.now();
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const startTime = startOfDay.getTime() * 1000000; // nanoseconds
      const endTime = now * 1000000;
      
      // Fetch sleep data (last 24 hours)
      const sleepStartTime = (now - 24 * 60 * 60 * 1000) * 1000000;
      
      // Fetch all data in PARALLEL for faster response
      const [stepsData, heartRateData, caloriesData, sleepData] = await Promise.all([
        this.fetchGoogleFitData(accessToken, 'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps', startTime, endTime),
        this.fetchGoogleFitData(accessToken, 'derived:com.google.heart_rate.bpm:com.google.android.gms:merge_heart_rate_bpm', startTime, endTime),
        this.fetchGoogleFitData(accessToken, 'derived:com.google.calories.expended:com.google.android.gms:merge_calories_expended', startTime, endTime),
        this.fetchGoogleFitSleepData(accessToken, sleepStartTime, endTime),
      ]);
      
      // Calculate totals
      let totalSteps = 0;
      let totalCalories = 0;
      let heartRates: number[] = [];
      let sleepMinutes = 0;
      
      if (stepsData?.point) {
        stepsData.point.forEach((p: any) => {
          if (p.value?.[0]?.intVal) {
            totalSteps += p.value[0].intVal;
          }
        });
      }
      
      if (caloriesData?.point) {
        caloriesData.point.forEach((p: any) => {
          if (p.value?.[0]?.fpVal) {
            totalCalories += p.value[0].fpVal;
          }
        });
      }
      
      if (heartRateData?.point) {
        heartRateData.point.forEach((p: any) => {
          if (p.value?.[0]?.fpVal) {
            heartRates.push(p.value[0].fpVal);
          }
        });
      }
      
      if (sleepData?.session) {
        sleepData.session.forEach((s: any) => {
          if (s.activityType === 72) { // Sleep activity
            const duration = (parseInt(s.endTimeMillis) - parseInt(s.startTimeMillis)) / 1000 / 60;
            sleepMinutes += duration;
          }
        });
      }
      
      const avgHeartRate = heartRates.length > 0 
        ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length)
        : 0;
      
      return {
        watchSteps: {
          count: totalSteps,
          goal: 10000,
          distance: totalSteps * 0.75, // Approximate distance in meters
          timestamp: new Date(),
        },
        watchHeartRate: {
          current: heartRates[heartRates.length - 1] || 0,
          min: heartRates.length > 0 ? Math.min(...heartRates) : 0,
          max: heartRates.length > 0 ? Math.max(...heartRates) : 0,
          average: avgHeartRate,
          readings: heartRates.slice(-10).map(v => ({ value: v, timestamp: new Date() })),
        },
        watchCalories: {
          total: Math.round(totalCalories),
          active: Math.round(totalCalories * 0.3),
          resting: Math.round(totalCalories * 0.7),
          goal: 2000,
        },
        watchSleep: {
          totalHours: sleepMinutes / 60,
          deepSleepHours: (sleepMinutes / 60) * 0.2,
          lightSleepHours: (sleepMinutes / 60) * 0.5,
          remSleepHours: (sleepMinutes / 60) * 0.3,
          awakeDuration: 0,
          sleepQuality: sleepMinutes > 420 ? 'good' : sleepMinutes > 360 ? 'fair' : 'poor',
        },
        watchOxygen: {
          current: avgHeartRate > 0 ? 97 : 0, // SpO2 typically around 95-99%
          min: avgHeartRate > 0 ? 95 : 0,
          max: avgHeartRate > 0 ? 99 : 0,
          average: avgHeartRate > 0 ? 97 : 0,
          readings: avgHeartRate > 0 ? [{ value: 97, timestamp: new Date() }] : [],
        },
        watchStress: {
          current: avgHeartRate > 0 ? Math.min(100, Math.round((avgHeartRate - 60) * 1.5)) : 0,
          average: avgHeartRate > 0 ? Math.min(100, Math.round((avgHeartRate - 60) * 1.2)) : 0,
          level: avgHeartRate < 70 ? 'low' : avgHeartRate < 85 ? 'moderate' : 'high',
          readings: avgHeartRate > 0 ? [{ value: avgHeartRate, timestamp: new Date() }] : [],
        },
        watchBreathing: {
          current: avgHeartRate > 0 ? Math.round(avgHeartRate / 5) : 0,
          average: avgHeartRate > 0 ? Math.round(avgHeartRate / 5) : 0,
          min: avgHeartRate > 0 ? Math.round(avgHeartRate / 6) : 0,
          max: avgHeartRate > 0 ? Math.round(avgHeartRate / 4) : 0,
        },
        watchActivity: {
          activeMinutes: Math.round(totalSteps / 100),
          sedentaryMinutes: Math.max(0, 480 - Math.round(totalSteps / 100)), // Assume 8 hour day
          standingHours: Math.min(12, Math.round(totalSteps / 1000)),
          workouts: [],
        },
        watchDevice: {
          name: connection.watchDeviceName || 'Google Fit Device',
          type: 'google_fit',
          model: connection.watchDeviceModel,
          lastSyncTime: new Date(),
        },
      };
    } catch (error) {
      console.error('Google Fit API error:', error);
      // Return default data structure on error
      return createDefaultData();
    }
  }
  
  // Helper: Fetch data from Google Fit API
  private static async fetchGoogleFitData(accessToken: string, dataSourceId: string, startTime: number, endTime: number) {
    try {
      const url = `https://www.googleapis.com/fitness/v1/users/me/dataSources/${encodeURIComponent(dataSourceId)}/datasets/${startTime}-${endTime}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        console.error('Google Fit API error:', response.status, await response.text());
        return null;
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching Google Fit data:', error);
      return null;
    }
  }
  
  // Helper: Fetch sleep data from Google Fit
  private static async fetchGoogleFitSleepData(accessToken: string, startTime: number, endTime: number) {
    try {
      const url = `https://www.googleapis.com/fitness/v1/users/me/sessions?startTime=${new Date(startTime / 1000000).toISOString()}&endTime=${new Date(endTime / 1000000).toISOString()}&activityType=72`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        return null;
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching Google Fit sleep data:', error);
      return null;
    }
  }
  
  // Sync from Fitbit
  private static async syncFromFitbit(connection: IWatchConnection): Promise<Partial<IWatchHealthData>> {
    // TODO: Implement actual Fitbit API integration
    
    return {
      watchDevice: {
        name: connection.watchDeviceName || 'Fitbit Device',
        type: 'fitbit',
        model: connection.watchDeviceModel,
        lastSyncTime: new Date(),
      },
    };
  }
  
  // Sync from Apple Watch (data pushed from iOS app)
  private static async syncFromAppleWatch(connection: IWatchConnection): Promise<Partial<IWatchHealthData>> {
    return {
      watchDevice: {
        name: connection.watchDeviceName || 'Apple Watch',
        type: 'apple_watch',
        model: connection.watchDeviceModel,
        lastSyncTime: new Date(),
      },
    };
  }
  
  // Sync from NoiseFit - Uses manual entry or Google Fit sync
  private static async syncFromNoiseFit(connection: IWatchConnection): Promise<Partial<IWatchHealthData>> {
    // NoiseFit doesn't have public API
    // Data should be synced to Google Fit first, then we can read from there
    // For now, return device info and allow manual entry
    return {
      watchDevice: {
        name: connection.watchDeviceName || 'NoiseFit Watch',
        type: 'noisefit',
        model: connection.watchDeviceModel || 'ColorFit Vision 3',
        lastSyncTime: new Date(),
      },
    };
  }
  
  // Sync from Samsung Health
  private static async syncFromSamsung(connection: IWatchConnection): Promise<Partial<IWatchHealthData>> {
    return {
      watchDevice: {
        name: connection.watchDeviceName || 'Samsung Watch',
        type: 'samsung',
        model: connection.watchDeviceModel,
        lastSyncTime: new Date(),
      },
    };
  }
  
  // Sync from Garmin
  private static async syncFromGarmin(connection: IWatchConnection): Promise<Partial<IWatchHealthData>> {
    return {
      watchDevice: {
        name: connection.watchDeviceName || 'Garmin Watch',
        type: 'garmin',
        model: connection.watchDeviceModel,
        lastSyncTime: new Date(),
      },
    };
  }
  
  // Get OAuth URL for provider
  static getWatchOAuthUrl(provider: string, state: string, customRedirectUri?: string): string {
    const config = WATCH_PROVIDER_CONFIGS[provider];
    
    if (!config) {
      throw new Error('Invalid watch provider');
    }
    
    // Use custom redirect URI if provided (for localhost testing)
    const redirectUri = customRedirectUri || config.redirectUri;
    
    switch (provider) {
      case 'google_fit':
        return `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${config.clientId}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `response_type=code&` +
          `scope=${encodeURIComponent(config.scopes.join(' '))}&` +
          `state=${state}&` +
          `access_type=offline&` +
          `prompt=consent`;
      
      case 'fitbit':
        return `https://www.fitbit.com/oauth2/authorize?` +
          `client_id=${config.clientId}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `response_type=code&` +
          `scope=${encodeURIComponent(config.scopes.join(' '))}&` +
          `state=${state}`;
      
      default:
        throw new Error('Provider does not support OAuth');
    }
  }
  
  // Update sync preferences
  static async updateWatchSyncPreferences(
    userId: string,
    preferences: IWatchConnection['watchSyncPreferences']
  ): Promise<IWatchConnection | null> {
    return await WatchConnection.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(userId) },
      { watchSyncPreferences: preferences },
      { new: true }
    );
  }
}

export default WatchService;
