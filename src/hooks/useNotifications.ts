'use client';

import { useState, useEffect, useCallback } from 'react';
import { NotificationService } from '@/lib/notifications/notification-service';

interface NotificationState {
  permission: 'granted' | 'denied' | 'default';
  isSupported: boolean;
  isEnabled: boolean;
}

export function useNotifications() {
  const [notificationState, setNotificationState] = useState<NotificationState>({
    permission: 'default',
    isSupported: false,
    isEnabled: false
  });

  const notificationService = NotificationService.getInstance();

  // Initialize notification state
  useEffect(() => {
    const updateState = () => {
      const permissionStatus = notificationService.getPermissionStatus();
      setNotificationState({
        permission: permissionStatus.granted ? 'granted' : 
                   permissionStatus.denied ? 'denied' : 'default',
        isSupported: notificationService.getIsSupported(),
        isEnabled: permissionStatus.granted
      });
    };

    updateState();
    
    // Set up notification handlers
    notificationService.setupNotificationHandlers();

    // Listen for permission changes
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'notifications' }).then((permission) => {
        permission.addEventListener('change', updateState);
      });
    }
  }, [notificationService]);

  const requestPermission = useCallback(async () => {
    try {
      const result = await notificationService.requestPermission();
      setNotificationState(prev => ({
        ...prev,
        permission: result.granted ? 'granted' : 
                   result.denied ? 'denied' : 'default',
        isEnabled: result.granted
      }));
      return result;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return { granted: false, denied: true, default: false };
    }
  }, [notificationService]);

  const showMessageNotification = useCallback(async (
    senderName: string,
    messageContent: string,
    senderAvatar?: string,
    conversationId?: string
  ) => {
    if (!notificationState.isEnabled) return;

    try {
      await notificationService.showMessageNotification(
        senderName,
        messageContent,
        senderAvatar,
        conversationId
      );
    } catch (error) {
      console.error('Error showing message notification:', error);
    }
  }, [notificationService, notificationState.isEnabled]);

  const showCallNotification = useCallback(async (
    callerName: string,
    callType: 'audio' | 'video',
    callerAvatar?: string,
    callId?: string
  ) => {
    if (!notificationState.isEnabled) return;

    try {
      await notificationService.showCallNotification(
        callerName,
        callType,
        callerAvatar,
        callId
      );
    } catch (error) {
      console.error('Error showing call notification:', error);
    }
  }, [notificationService, notificationState.isEnabled]);

  const showStatusNotification = useCallback(async (
    title: string,
    message: string,
    type: 'delivered' | 'read' | 'typing' = 'delivered'
  ) => {
    if (!notificationState.isEnabled) return;

    try {
      await notificationService.showStatusNotification(title, message, type);
    } catch (error) {
      console.error('Error showing status notification:', error);
    }
  }, [notificationService, notificationState.isEnabled]);

  const showAppointmentNotification = useCallback(async (
    clientName: string,
    scheduledAt: Date | string,
    duration: number,
    type: 'booked' | 'cancelled' | 'reminder' = 'booked',
    clientAvatar?: string,
    appointmentId?: string
  ) => {
    if (!notificationState.isEnabled) return;

    try {
      await notificationService.showAppointmentNotification(
        clientName,
        scheduledAt,
        duration,
        type,
        clientAvatar,
        appointmentId
      );
    } catch (error) {
      console.error('Error showing appointment notification:', error);
    }
  }, [notificationService, notificationState.isEnabled]);

  const clearNotification = useCallback((tag: string) => {
    notificationService.clearNotification(tag);
  }, [notificationService]);

  const clearAllNotifications = useCallback(() => {
    notificationService.clearAllNotifications();
  }, [notificationService]);

  return {
    notificationState,
    requestPermission,
    showMessageNotification,
    showCallNotification,
    showStatusNotification,
    showAppointmentNotification,
    clearNotification,
    clearAllNotifications
  };
}
