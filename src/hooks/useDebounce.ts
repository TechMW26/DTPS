import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useDebounce Hook
 * Returns a debounced value that only updates after the specified delay
 * when the input value stops changing.
 * 
 * @param value - The value to debounce
 * @param delay - The delay in milliseconds (default: 300ms)
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up the timeout
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Clean up on value change or unmount
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * useDebouncedCallback Hook
 * Returns a memoized callback that is debounced.
 * Useful when you need to debounce a function call rather than a value.
 * 
 * @param callback - The callback function to debounce
 * @param delay - The delay in milliseconds (default: 300ms)
 * @returns A debounced version of the callback
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = 300
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // Update the callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );
}

/**
 * useThrottle Hook
 * Returns a throttled value that only updates at most once per specified interval.
 * 
 * @param value - The value to throttle
 * @param interval - The minimum interval between updates in milliseconds (default: 300ms)
 * @returns The throttled value
 */
export function useThrottle<T>(value: T, interval: number = 300): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastExecutedRef = useRef<number>(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastExecutedRef.current;

    if (elapsed >= interval) {
      // Enough time has passed, update immediately
      lastExecutedRef.current = now;
      setThrottledValue(value);
    } else {
      // Schedule update for the remaining time
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        lastExecutedRef.current = Date.now();
        setThrottledValue(value);
      }, interval - elapsed);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, interval]);

  return throttledValue;
}

/**
 * useThrottledCallback Hook
 * Returns a memoized callback that is throttled.
 * 
 * @param callback - The callback function to throttle
 * @param interval - The minimum interval between calls in milliseconds (default: 300ms)
 * @returns A throttled version of the callback
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  interval: number = 300
): (...args: Parameters<T>) => void {
  const lastExecutedRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // Update the callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const elapsed = now - lastExecutedRef.current;

      if (elapsed >= interval) {
        // Enough time has passed, execute immediately
        lastExecutedRef.current = now;
        callbackRef.current(...args);
      } else {
        // Schedule execution for the remaining time
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          lastExecutedRef.current = Date.now();
          callbackRef.current(...args);
        }, interval - elapsed);
      }
    },
    [interval]
  );
}

export default useDebounce;
