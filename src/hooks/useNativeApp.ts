'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';

// Declare global NativeApp interface for Android WebView
declare global {
  interface Window {
    NativeApp?: {
      getFCMToken: () => string;
      isNativeApp: () => boolean;
      getDeviceType: () => string;
      requestNotificationPermission: () => void;
      refreshFCMToken: () => void;
      log: (message: string) => void;
    };
    // Handler that native app calls when foreground notification is received
    onForegroundNotification?: (notification: ForegroundNotification) => void;
  }
}

export interface ForegroundNotification {
  title: string;
  body: string;
  data?: {
    type?: string;
    clickAction?: string;
    url?: string;
    [key: string]: any;
  };
}

interface UseNativeAppReturn {
  isNativeApp: boolean;
  deviceType: 'android' | 'ios' | 'web';
  fcmToken: string | null;
  requestNotificationPermission: () => void;
  refreshFCMToken: () => void;
  isLoading: boolean;
  tokenRegistered: boolean;
  onForegroundNotification: (handler: (notification: ForegroundNotification) => void) => void;
}

async function registerTokenWithBackend(token: string, deviceType: 'android' | 'ios' | 'web'): Promise<boolean> {
  try {
    const response = await fetch('/api/fcm/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token,
        deviceType,
        deviceInfo: `${deviceType} WebView App`,
      }),
    });
    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error('Error registering FCM token with backend:', error);
    return false;
  }
}

export function useNativeApp(): UseNativeAppReturn {
  const { data: session, status } = useSession();
  const [isNativeApp, setIsNativeApp] = useState(false);
  const [deviceType, setDeviceType] = useState<'android' | 'ios' | 'web'>('web');
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tokenRegistered, setTokenRegistered] = useState(false);
  const tokenRegistrationAttempted = useRef(false);
  const tokenCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const notificationHandlerRef = useRef<((notification: ForegroundNotification) => void) | null>(null);
  
  // Track last notification to prevent duplicates
  const lastNotificationRef = useRef<{ id: string; timestamp: number } | null>(null);

  // Set up foreground notification handler that native app can call
  const onForegroundNotification = useCallback((handler: (notification: ForegroundNotification) => void) => {
    console.log('[useNativeApp] Setting foreground notification handler');
    notificationHandlerRef.current = handler;
  }, []);
  
  // Helper to check if notification is duplicate
  const isDuplicateNotification = useCallback((notification: ForegroundNotification): boolean => {
    const now = Date.now();
    const notificationId = `${notification.title}-${notification.body}-${JSON.stringify(notification.data || {})}`;
    
    // Check if same notification was received within last 2 seconds
    if (lastNotificationRef.current) {
      const timeDiff = now - lastNotificationRef.current.timestamp;
      if (lastNotificationRef.current.id === notificationId && timeDiff < 2000) {
        console.log('[useNativeApp] Duplicate notification detected, skipping');
        return true;
      }
    }
    
    // Update last notification
    lastNotificationRef.current = { id: notificationId, timestamp: now };
    return false;
  }, []);

  // Listen for foreground notifications from native app
  useEffect(() => {
    if (typeof window === 'undefined') return;

    console.log('[useNativeApp] Setting up global foreground notification handlers');

    // Set up global handler that native app will call
    window.onForegroundNotification = (notification: ForegroundNotification) => {
      console.log('[useNativeApp] window.onForegroundNotification called with:', JSON.stringify(notification));
      
      // Check for duplicate
      if (isDuplicateNotification(notification)) {
        return;
      }
      
      if (notificationHandlerRef.current) {
        console.log('[useNativeApp] Calling registered handler');
        notificationHandlerRef.current(notification);
      } else {
        console.warn('[useNativeApp] No handler registered for foreground notifications');
      }
    };

    // Also listen for custom event (alternative approach)
    const handleForegroundNotification = (event: CustomEvent<ForegroundNotification>) => {
      console.log('[useNativeApp] nativeForegroundNotification event received:', JSON.stringify(event.detail));
      
      // Check for duplicate
      if (isDuplicateNotification(event.detail)) {
        return;
      }
      
      if (notificationHandlerRef.current) {
        console.log('[useNativeApp] Calling registered handler from event');
        notificationHandlerRef.current(event.detail);
      } else {
        console.warn('[useNativeApp] No handler registered for foreground notification event');
      }
    };

    window.addEventListener('nativeForegroundNotification', handleForegroundNotification as EventListener);

    return () => {
      window.onForegroundNotification = undefined;
      window.removeEventListener('nativeForegroundNotification', handleForegroundNotification as EventListener);
    };
  }, [isDuplicateNotification]);

  useEffect(() => {
    // Check if running in native app
    const checkNativeApp = () => {
      if (typeof window !== 'undefined' && window.NativeApp) {
        try {
          const isNative = window.NativeApp.isNativeApp();
          setIsNativeApp(isNative);
          
          if (isNative) {
            const type = window.NativeApp.getDeviceType();
            setDeviceType(type === 'android' ? 'android' : type === 'ios' ? 'ios' : 'web');
            
            // Get FCM token
            const token = window.NativeApp.getFCMToken();
            if (token && token.length > 0) {
              setFcmToken(token);
            }
          }
        } catch (error) {
          console.error('Error checking native app:', error);
        }
      }
      setIsLoading(false);
    };

    // Small delay to ensure NativeApp interface is ready
    const timer = setTimeout(checkNativeApp, 100);
    return () => clearTimeout(timer);
  }, []);

  // Listen for fcmTokenReady event from Android native app
  useEffect(() => {
    if (!isNativeApp) return;

    const handleTokenReady = (event: CustomEvent<{ token: string }>) => {
      const token = event.detail?.token;
      if (token && token.length > 0) {
        console.log('Received FCM token from native app');
        setFcmToken(token);
        // Reset registration flag to allow re-registration with new token
        tokenRegistrationAttempted.current = false;
        setTokenRegistered(false);
      }
    };

    window.addEventListener('fcmTokenReady', handleTokenReady as EventListener);

    return () => {
      window.removeEventListener('fcmTokenReady', handleTokenReady as EventListener);
    };
  }, [isNativeApp]);

  // Poll for FCM token if not available initially (token might be fetched async by Firebase)
  useEffect(() => {
    if (!isNativeApp || fcmToken) {
      return;
    }

    let attempts = 0;
    const maxAttempts = 10;

    tokenCheckInterval.current = setInterval(() => {
      attempts++;
      if (typeof window !== 'undefined' && window.NativeApp) {
        try {
          const token = window.NativeApp.getFCMToken();
          if (token && token.length > 0) {
            setFcmToken(token);
            if (tokenCheckInterval.current) {
              clearInterval(tokenCheckInterval.current);
            }
          }
        } catch (error) {
          console.error('Error getting FCM token:', error);
        }
      }
      
      if (attempts >= maxAttempts && tokenCheckInterval.current) {
        clearInterval(tokenCheckInterval.current);
      }
    }, 1000); // Check every second for up to 10 seconds

    return () => {
      if (tokenCheckInterval.current) {
        clearInterval(tokenCheckInterval.current);
      }
    };
  }, [isNativeApp, fcmToken]);

  // Register token with backend when user is authenticated and token is available
  useEffect(() => {
    const registerToken = async () => {
      if (
        status === 'authenticated' &&
        session?.user?.id &&
        fcmToken &&
        isNativeApp &&
        !tokenRegistered &&
        !tokenRegistrationAttempted.current
      ) {
        tokenRegistrationAttempted.current = true;
        console.log('Registering FCM token with backend...');
        
        const success = await registerTokenWithBackend(fcmToken, deviceType);
        if (success) {
          setTokenRegistered(true);
          console.log('FCM token registered successfully');
        } else {
          // Reset flag to allow retry
          tokenRegistrationAttempted.current = false;
          console.error('Failed to register FCM token');
        }
      }
    };

    registerToken();
  }, [status, session?.user?.id, fcmToken, isNativeApp, deviceType, tokenRegistered]);

  const requestNotificationPermission = useCallback(() => {
    if (typeof window !== 'undefined' && window.NativeApp) {
      try {
        window.NativeApp.requestNotificationPermission();
      } catch (error) {
        console.error('Error requesting notification permission:', error);
      }
    }
  }, []);

  const refreshFCMToken = useCallback(() => {
    if (typeof window !== 'undefined' && window.NativeApp) {
      try {
        window.NativeApp.refreshFCMToken();
      } catch (error) {
        console.error('Error refreshing FCM token:', error);
      }
    }
  }, []);

  return {
    isNativeApp,
    deviceType,
    fcmToken,
    requestNotificationPermission,
    refreshFCMToken,
    isLoading,
    tokenRegistered,
    onForegroundNotification,
  };
}

export default useNativeApp;
