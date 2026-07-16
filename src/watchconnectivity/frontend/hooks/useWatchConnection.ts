// Custom hook for watch connectivity
'use client';

import { useState, useEffect, useCallback } from 'react';

export interface WatchConnectionData {
  watchProvider: string;
  watchIsConnected: boolean;
  watchDeviceName?: string;
  watchDeviceModel?: string;
  watchLastSync?: string;
  watchSyncPreferences?: {
    syncSteps: boolean;
    syncHeartRate: boolean;
    syncSleep: boolean;
    syncOxygen: boolean;
    syncStress: boolean;
    syncBreathing: boolean;
    syncActivity: boolean;
    syncCalories: boolean;
  };
  watchAutoSyncInterval?: number;
}

export interface WatchHealthData {
  watchSteps: {
    count: number;
    goal: number;
    distance?: number;
    timestamp: string;
  };
  watchHeartRate: {
    current: number;
    min: number;
    max: number;
    average: number;
    restingHr?: number;
  };
  watchSleep: {
    totalHours: number;
    deepSleepHours: number;
    lightSleepHours: number;
    remSleepHours: number;
    awakeDuration: number;
    sleepQuality?: string;
  };
  watchOxygen: {
    current: number;
    min: number;
    max: number;
    average: number;
  };
  watchStress: {
    current: number;
    average: number;
    level: string;
  };
  watchBreathing: {
    current: number;
    average: number;
    min: number;
    max: number;
  };
  watchActivity: {
    activeMinutes: number;
    sedentaryMinutes: number;
    standingHours: number;
    workouts: any[];
  };
  watchCalories: {
    total: number;
    active: number;
    resting: number;
    goal: number;
  };
  watchDevice: {
    name: string;
    type: string;
    model?: string;
    lastSyncTime: string;
  };
}

export function useWatchConnection() {
  const [watchConnection, setWatchConnection] = useState<WatchConnectionData | null>(null);
  const [watchHealthData, setWatchHealthData] = useState<WatchHealthData | null>(null);
  const [watchLoading, setWatchLoading] = useState(true);
  const [watchSyncing, setWatchSyncing] = useState(false);
  const [watchError, setWatchError] = useState<string | null>(null);

  // Fetch watch connection status
  const fetchWatchConnection = useCallback(async () => {
    try {
      const response = await fetch('/api/watch/connect');
      const data = await response.json();
      
      if (data.success) {
        setWatchConnection(data.watchConnection);
      }
    } catch (error) {
      console.error('Error fetching watch connection:', error);
      setWatchError('Failed to fetch watch connection');
    }
  }, []);

  // Fetch watch health data
  const fetchWatchHealthData = useCallback(async (date?: string) => {
    try {
      const url = date ? `/api/watch/data?date=${date}` : '/api/watch/data';
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success && data.watchHealthData) {
        setWatchHealthData(data.watchHealthData);
      }
    } catch (error) {
      console.error('Error fetching watch health data:', error);
    }
  }, []);

  // Connect watch
  const connectWatch = useCallback(async (
    watchProvider: string,
    watchDeviceName?: string,
    watchDeviceModel?: string
  ) => {
    try {
      setWatchLoading(true);
      setWatchError(null);

      // For OAuth providers (Google Fit, Fitbit), get OAuth URL
      if (['google_fit', 'fitbit'].includes(watchProvider)) {
        const oauthResponse = await fetch('/api/watch/oauth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ watchProvider }),
        });
        const oauthData = await oauthResponse.json();
        
        if (oauthData.watchOAuthUrl) {
          // Redirect to OAuth
          window.location.href = oauthData.watchOAuthUrl;
          return;
        }
        
        if (oauthData.watchRequiresApp) {
          setWatchError('This watch type requires the mobile app');
          setWatchLoading(false);
          return false;
        }
        
        if (oauthData.watchRequiresManual) {
          // Fall through to direct connection for manual entry watches
        }
      }
      
      // For NoiseFit, Apple Watch, Samsung, Garmin, Other - use direct connection with manual entry
      if (['noisefit', 'apple_watch', 'samsung', 'garmin', 'other'].includes(watchProvider)) {
        // These watches use manual data entry
      }

      // Direct connection (for manual/other watches)
      const response = await fetch('/api/watch/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          watchProvider,
          watchDeviceName,
          watchDeviceModel,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setWatchConnection(data.watchConnection);
        return true;
      } else {
        setWatchError(data.error);
        return false;
      }
    } catch (error) {
      console.error('Error connecting watch:', error);
      setWatchError('Failed to connect watch');
      return false;
    } finally {
      setWatchLoading(false);
    }
  }, []);

  // Disconnect watch
  const disconnectWatch = useCallback(async () => {
    try {
      setWatchLoading(true);
      
      const response = await fetch('/api/watch/connect', { method: 'DELETE' });
      const data = await response.json();
      
      if (data.success) {
        setWatchConnection(null);
        setWatchHealthData(null);
        return true;
      } else {
        setWatchError(data.error);
        return false;
      }
    } catch (error) {
      console.error('Error disconnecting watch:', error);
      setWatchError('Failed to disconnect watch');
      return false;
    } finally {
      setWatchLoading(false);
    }
  }, []);

  // Sync watch data
  const syncWatchData = useCallback(async () => {
    try {
      setWatchSyncing(true);
      
      const response = await fetch('/api/watch/sync', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        await fetchWatchHealthData();
        return true;
      } else {
        setWatchError(data.error);
        return false;
      }
    } catch (error) {
      console.error('Error syncing watch data:', error);
      setWatchError('Failed to sync watch data');
      return false;
    } finally {
      setWatchSyncing(false);
    }
  }, [fetchWatchHealthData]);

  // Save manual watch data
  const saveWatchData = useCallback(async (data: Partial<WatchHealthData>) => {
    try {
      const response = await fetch('/api/watch/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      const result = await response.json();
      
      if (result.success) {
        setWatchHealthData(result.watchHealthData);
        return true;
      } else {
        setWatchError(result.error);
        return false;
      }
    } catch (error) {
      console.error('Error saving watch data:', error);
      setWatchError('Failed to save watch data');
      return false;
    }
  }, []);

  // Update watch settings
  const updateWatchSettings = useCallback(async (settings: {
    watchSyncEnabled?: boolean;
    watchSyncPreferences?: WatchConnectionData['watchSyncPreferences'];
    watchAutoSyncInterval?: number;
  }) => {
    try {
      const response = await fetch('/api/watch/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      
      const data = await response.json();
      
      if (data.success) {
        await fetchWatchConnection();
        return true;
      } else {
        setWatchError(data.error);
        return false;
      }
    } catch (error) {
      console.error('Error updating watch settings:', error);
      setWatchError('Failed to update watch settings');
      return false;
    }
  }, [fetchWatchConnection]);

  // Initial fetch and auto-refresh every 5 minutes - optimized with parallel fetching
  useEffect(() => {
    const init = async () => {
      setWatchLoading(true);
      // Fetch connection and health data in parallel for faster loading
      await Promise.all([
        fetchWatchConnection(),
        fetchWatchHealthData()
      ]);
      setWatchLoading(false);
    };
    init();

    // Auto-refresh watch data every 5 minutes (300000 ms)
    const refreshInterval = setInterval(() => {
      fetchWatchHealthData();
    }, 5 * 60 * 1000); // 5 minutes

    // Also refresh when page becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchWatchHealthData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(refreshInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchWatchConnection, fetchWatchHealthData]);

  return {
    watchConnection,
    watchHealthData,
    watchLoading,
    watchSyncing,
    watchError,
    connectWatch,
    disconnectWatch,
    syncWatchData,
    saveWatchData,
    updateWatchSettings,
    fetchWatchHealthData,
    refreshWatchConnection: fetchWatchConnection,
  };
}

export default useWatchConnection;
