// Google Fit integration for fitness tracking

// Google API types
declare global {
  interface Window {
    gapi: any;
  }
}

export interface FitnessData {
  steps: number;
  calories: number;
  distance: number;
  heartRate?: number;
  activeMinutes: number;
  sleepHours?: number;
  floors?: number;
  vo2Max?: number;
  lastSync: Date;
}

export interface DeviceConnector {
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  getData(): Promise<FitnessData>;
  isSupported(): boolean;
}

// Google Fit API connector - works with all devices
export class GoogleFitConnector implements DeviceConnector {
  private accessToken: string | null = null;
  private isConnected = false;

  async connect(): Promise<boolean> {
    try {
      // Check if Google APIs are available
      if (typeof window === 'undefined' || !window.gapi) {
        // Load Google API if not available
        await this.loadGoogleAPI();
      }

      // Initialize Google API
      await new Promise((resolve) => {
        window.gapi.load('auth2', resolve);
      });

      await window.gapi.auth2.init({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || 'your-google-client-id',
        scope: 'https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.body.read https://www.googleapis.com/auth/fitness.location.read'
      });

      const authInstance = window.gapi.auth2.getAuthInstance();

      if (!authInstance.isSignedIn.get()) {
        const user = await authInstance.signIn();
        this.accessToken = user.getAuthResponse().access_token;
      } else {
        this.accessToken = authInstance.currentUser.get().getAuthResponse().access_token;
      }

      this.isConnected = true;
      return true;
    } catch (error) {
      console.error('Failed to connect to Google Fit:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (window.gapi && window.gapi.auth2) {
        const authInstance = window.gapi.auth2.getAuthInstance();
        if (authInstance.isSignedIn.get()) {
          await authInstance.signOut();
        }
      }
      this.accessToken = null;
      this.isConnected = false;
    } catch (error) {
      console.error('Failed to disconnect from Google Fit:', error);
    }
  }

  async getData(): Promise<FitnessData> {
    if (!this.isConnected || !this.accessToken) {
      throw new Error('Google Fit not connected');
    }

    try {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      // Get fitness data from Google Fit
      const [stepsData, caloriesData, heartRateData, distanceData] = await Promise.all([
        this.getFitnessData('derived:com.google.step_count.delta:com.google.android.gms:estimated_steps', startOfDay, endOfDay),
        this.getFitnessData('derived:com.google.calories.expended:com.google.android.gms:merge_calories_expended', startOfDay, endOfDay),
        this.getFitnessData('derived:com.google.heart_rate.bpm:com.google.android.gms:merge_heart_rate_bpm', startOfDay, endOfDay),
        this.getFitnessData('derived:com.google.distance.delta:com.google.android.gms:merge_distance_delta', startOfDay, endOfDay)
      ]);

      const heartRateValue = this.extractValue(heartRateData, 'fpVal');

      return {
        steps: this.extractValue(stepsData, 'intVal') || 0,
        calories: Math.round(this.extractValue(caloriesData, 'fpVal') || 0),
        distance: Math.round(this.extractValue(distanceData, 'fpVal') || 0),
        heartRate: heartRateValue ? Math.round(heartRateValue) : undefined,
        activeMinutes: Math.floor((this.extractValue(stepsData, 'intVal') || 0) / 100), // Rough estimation
        lastSync: new Date()
      };
    } catch (error) {
      console.error('Failed to get Google Fit data:', error);
      throw error;
    }
  }

  isSupported(): boolean {
    return typeof window !== 'undefined';
  }

  private async loadGoogleAPI(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[src="https://apis.google.com/js/api.js"]')) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google API'));
      document.head.appendChild(script);
    });
  }

  private async getFitnessData(dataTypeName: string, startTime: Date, endTime: Date): Promise<any> {
    const response = await fetch(
      `https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          aggregateBy: [{ dataTypeName }],
          bucketByTime: { durationMillis: 86400000 }, // 1 day
          startTimeMillis: startTime.getTime(),
          endTimeMillis: endTime.getTime(),
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Google Fit API error: ${response.statusText}`);
    }

    return response.json();
  }

  private extractValue(data: any, valueType: 'intVal' | 'fpVal'): number | undefined {
    try {
      const bucket = data?.bucket?.[0];
      const dataset = bucket?.dataset?.[0];
      const point = dataset?.point?.[0];
      const value = point?.value?.[0];
      return value?.[valueType];
    } catch (error) {
      return undefined;
    }
  }
}

// Factory function to get Google Fit connector
export function getDeviceConnector(): DeviceConnector {
  return new GoogleFitConnector();
}
