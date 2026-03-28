'use client';

// Hooks barrel export
export {
  useMediaQuery,
  useIsMobile,
  useIsTablet,
  useIsDesktop,
  useIsSmallScreen,
  useIsLargeScreen,
  useBreakpoint,
  useIsTouchDevice,
  useOrientation
} from './useMediaQuery';

export { useMobileDetection } from './useMobileDetection';
export { useNotifications } from './useNotifications';
export { useRealtime } from './useRealtime';

export { useCallManager } from './useCallManager';
export { useSimpleWebRTC } from './useSimpleWebRTC';
export { default as useBodyScrollLock } from './useBodyScrollLock';
export { useScrollRestoration, saveScrollPosition, getScrollPosition } from './useScrollRestoration';
export { useAuthenticatedFetch, authenticatedFetch } from './useAuthenticatedFetch';
export {
  useAutoSave,
  useMealPlanAutoSave,
  useDietTemplateAutoSave,
  useFormAutoSave,
  useRecipeAutoSave,
  type RecipeFormData,
  type MealPlanFormData,
  type DraftType,
} from './useAutoSave';
export {
  useDebounce,
  useDebouncedCallback,
  useThrottle,
  useThrottledCallback
} from './useDebounce';
