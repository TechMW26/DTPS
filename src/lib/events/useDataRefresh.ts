'use client';

import { useEffect, useCallback } from 'react';
import { dataEvents, DataEventTypes } from './dataEvents';

type EventType = typeof DataEventTypes[keyof typeof DataEventTypes];

/**
 * Hook to subscribe to data change events
 * Automatically refreshes data when events are emitted
 * 
 * @param events - Array of event types to listen to
 * @param onDataChange - Callback function to refresh data
 * @param deps - Dependencies array for the callback
 */
export function useDataRefresh(
  events: EventType | EventType[],
  onDataChange: () => void | Promise<void>,
  deps: any[] = []
) {
  const memoizedCallback = useCallback(onDataChange, deps);

  useEffect(() => {
    const eventArray = Array.isArray(events) ? events : [events];
    const unsubscribes: (() => void)[] = [];

    eventArray.forEach(event => {
      const unsubscribe = dataEvents.on(event, memoizedCallback);
      unsubscribes.push(unsubscribe);
    });

    // Cleanup on unmount
    return () => {
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }, [events, memoizedCallback]);
}

/**
 * Hook to emit data change events
 * Returns a function to trigger events
 */
export function useDataEmit() {
  const emit = useCallback((event: EventType, data?: any) => {
    dataEvents.emit(event, data);
  }, []);

  return emit;
}

/**
 * Helper function to emit events (for use outside React components)
 */
export function emitDataChange(event: EventType, data?: any) {
  dataEvents.emit(event, data);
}

// Re-export event types for convenience
export { DataEventTypes };
