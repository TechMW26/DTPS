'use client';

/**
 * Auto-Save Hook for Meal Plans and Templates
 * 
 * Features:
 * - Debounced auto-save to server
 * - Local storage fallback for offline support
 * - Clear draft functionality
 * - Auto-restore on component mount
 * - Visual status indicators
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { apiPost, apiGet, apiDelete } from '@/lib/api/client';

export type DraftStatus = 'idle' | 'saving' | 'saved' | 'error' | 'restoring';

export type DraftType = 'meal-plan' | 'meal-plan-template' | 'diet-template' | 'recipe' | 'recipe-edit';

export interface DraftData<T = any> {
  id: string;
  type: DraftType;
  data: T;
  lastSaved: number;
  userId?: string;
}

export interface UseAutoSaveOptions<T> {
  /** Unique identifier for this draft (use 'new' for new items) */
  id: string;
  /** Type of content being saved */
  type: DraftType;
  /** Initial data */
  initialData: T;
  /** Debounce delay in ms (default: 2000) */
  debounceMs?: number;
  /** Enable server-side persistence (default: true) */
  serverPersist?: boolean;
  /** Callback when draft is restored */
  onRestore?: (data: T) => void;
  /** User ID for server-side storage */
  userId?: string;
  /** Draft expiry in hours (default: 24 for recipes, 168 for templates) */
  expiryHours?: number;
}

const STORAGE_PREFIX = 'draft_';
const MAX_DRAFT_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours as requested

/**
 * Get local storage key for a draft
 */
function getStorageKey(type: string, id: string): string {
  return `${STORAGE_PREFIX}${type}_${id}`;
}

/**
 * Save draft to local storage
 */
function saveToLocalStorage<T>(type: string, id: string, data: T): void {
  if (typeof window === 'undefined') return;

  try {
    const draft: DraftData<T> = {
      id,
      type: type as any,
      data,
      lastSaved: Date.now(),
    };
    localStorage.setItem(getStorageKey(type, id), JSON.stringify(draft));
  } catch (error) {
    console.warn('Failed to save draft to localStorage:', error);
  }
}

/**
 * Load draft from local storage
 */
function loadFromLocalStorage<T>(type: string, id: string): DraftData<T> | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(getStorageKey(type, id));
    if (!stored) return null;

    const draft = JSON.parse(stored) as DraftData<T>;

    // Check if draft is too old
    if (Date.now() - draft.lastSaved > MAX_DRAFT_AGE_MS) {
      localStorage.removeItem(getStorageKey(type, id));
      return null;
    }

    return draft;
  } catch (error) {
    console.warn('Failed to load draft from localStorage:', error);
    return null;
  }
}

/**
 * Remove draft from local storage
 */
function removeFromLocalStorage(type: string, id: string): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(getStorageKey(type, id));
  } catch (error) {
    console.warn('Failed to remove draft from localStorage:', error);
  }
}

/**
 * Auto-save hook for meal plans and templates
 */
export function useAutoSave<T>({
  id,
  type,
  initialData,
  debounceMs = 2000,
  serverPersist = true,
  onRestore,
  userId,
}: UseAutoSaveOptions<T>) {
  const [data, setData] = useState<T>(initialData);
  const [status, setStatus] = useState<DraftStatus>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);
  const previousDataRef = useRef<string>(JSON.stringify(initialData));

  /**
   * Save draft to server
   */
  const saveDraftToServer = useCallback(async (draftData: T): Promise<boolean> => {
    if (!serverPersist) return true;

    try {
      const response = await apiPost('/api/drafts', {
        type,
        id,
        data: draftData,
        userId,
      }, {
        showErrorToast: false,
        retries: 1,
      });

      return response.success;
    } catch {
      return false;
    }
  }, [type, id, userId, serverPersist]);

  /**
   * Save draft (debounced)
   */
  const saveDraft = useCallback(async (newData: T) => {
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Check if data actually changed
    const newDataStr = JSON.stringify(newData);
    if (newDataStr === previousDataRef.current) {
      return;
    }

    // Update previous data ref
    previousDataRef.current = newDataStr;
    setStatus('saving');

    // Debounce the actual save
    saveTimeoutRef.current = setTimeout(async () => {
      // Save to local storage immediately (offline support)
      saveToLocalStorage(type, id, newData);

      // Save to server
      const success = await saveDraftToServer(newData);

      if (success) {
        setStatus('saved');
        setLastSaved(new Date());
        setHasDraft(true);
      } else {
        setStatus('error');
        // Still saved locally, so show partial success
        console.warn('Draft saved locally but server sync failed');
      }

      // Reset status after a delay
      setTimeout(() => setStatus('idle'), 2000);
    }, debounceMs);
  }, [type, id, debounceMs, saveDraftToServer]);

  /**
   * Update data and trigger auto-save
   */
  const updateData = useCallback((newData: T | ((prev: T) => T)) => {
    setData(prevData => {
      const updated = typeof newData === 'function'
        ? (newData as (prev: T) => T)(prevData)
        : newData;

      saveDraft(updated);
      return updated;
    });
  }, [saveDraft]);

  /**
   * Clear draft
   */
  const clearDraft = useCallback(async () => {
    // Clear pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Remove from local storage
    removeFromLocalStorage(type, id);

    // Remove from server
    if (serverPersist) {
      await apiDelete(`/api/drafts?type=${type}&id=${id}`, {
        showErrorToast: false,
      });
    }

    // Reset state
    setData(initialData);
    previousDataRef.current = JSON.stringify(initialData);
    setHasDraft(false);
    setLastSaved(null);
    setStatus('idle');

    toast.success('Draft cleared');
  }, [type, id, initialData, serverPersist]);

  /**
   * Restore draft
   */
  const restoreDraft = useCallback(async (): Promise<boolean> => {
    setStatus('restoring');

    // Try to load from server first
    if (serverPersist) {
      try {
        const response = await apiGet<{ draft: DraftData<T> }>(
          `/api/drafts?type=${type}&id=${id}`,
          { showErrorToast: false }
        );

        if (response.success && response.data?.draft) {
          setData(response.data.draft.data);
          previousDataRef.current = JSON.stringify(response.data.draft.data);
          setLastSaved(new Date(response.data.draft.lastSaved));
          setHasDraft(true);
          setStatus('idle');
          onRestore?.(response.data.draft.data);
          return true;
        }
      } catch {
        // Fall through to local storage
      }
    }

    // Try local storage
    const localDraft = loadFromLocalStorage<T>(type, id);
    if (localDraft) {
      setData(localDraft.data);
      previousDataRef.current = JSON.stringify(localDraft.data);
      setLastSaved(new Date(localDraft.lastSaved));
      setHasDraft(true);
      setStatus('idle');
      onRestore?.(localDraft.data);
      return true;
    }

    setStatus('idle');
    return false;
  }, [type, id, serverPersist, onRestore]);

  /**
   * Check if draft exists
   */
  const checkForDraft = useCallback(async (): Promise<boolean> => {
    // Check local storage first
    const localDraft = loadFromLocalStorage<T>(type, id);
    if (localDraft) {
      setHasDraft(true);
      return true;
    }

    // Check server
    if (serverPersist) {
      try {
        const response = await apiGet<{ exists: boolean }>(
          `/api/drafts/exists?type=${type}&id=${id}`,
          { showErrorToast: false }
        );

        if (response.success && response.data?.exists) {
          setHasDraft(true);
          return true;
        }
      } catch {
        // Ignore
      }
    }

    return false;
  }, [type, id, serverPersist]);

  /**
   * Force save immediately
   */
  const forceSave = useCallback(async () => {
    // Clear pending debounce
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setStatus('saving');
    saveToLocalStorage(type, id, data);
    const success = await saveDraftToServer(data);

    if (success) {
      setStatus('saved');
      setLastSaved(new Date());
      setHasDraft(true);
      toast.success('Draft saved');
    } else {
      setStatus('error');
      toast.error('Failed to save draft');
    }

    setTimeout(() => setStatus('idle'), 2000);
  }, [type, id, data, saveDraftToServer]);

  // Initialize and check for existing draft
  useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      checkForDraft();
    }
  }, [checkForDraft]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Save before page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Sync save to local storage before unload
      if (previousDataRef.current !== JSON.stringify(initialData)) {
        saveToLocalStorage(type, id, data);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [type, id, data, initialData]);

  return {
    data,
    setData: updateData,
    status,
    lastSaved,
    hasDraft,
    clearDraft,
    restoreDraft,
    forceSave,
    checkForDraft,
  };
}

// Recipe form data interface
export interface RecipeFormData {
  name: string;
  description: string;
  prepTime: string;
  cookTime: string;
  servings: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  image: string;
  imagePreview: string;
  isActive: boolean;
  ingredients: Array<{ name: string; quantity: number; unit: string; remarks?: string }>;
  instructions: string[];
  dietaryRestrictions: string[];
  medicalContraindications: string[];
}

/**
 * Auto-save hook specifically for Recipe creation/editing
 * Drafts expire after 24 hours
 */
export function useRecipeAutoSave(
  id: string,
  data: RecipeFormData,
  options: {
    debounceMs?: number;
    enabled?: boolean;
    onSaveSuccess?: () => void;
    onSaveError?: (error: Error) => void;
  } = {}
) {
  const { debounceMs = 2000, enabled = true, onSaveSuccess, onSaveError } = options;
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousDataRef = useRef<string>('');
  const isInitializedRef = useRef(false);

  const storageKey = `draft_recipe_${id}`;
  const DRAFT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

  // Save to localStorage
  const saveToStorage = useCallback((formData: RecipeFormData) => {
    if (typeof window === 'undefined') return;
    try {
      const draft = {
        data: formData,
        lastSaved: Date.now(),
        expiresAt: Date.now() + DRAFT_EXPIRY_MS,
      };
      localStorage.setItem(storageKey, JSON.stringify(draft));
      setLastSaved(new Date());
      setHasDraft(true);
      onSaveSuccess?.();
    } catch (error) {
      console.error('Failed to save recipe draft:', error);
      onSaveError?.(error as Error);
    }
  }, [storageKey, onSaveSuccess, onSaveError]);

  // Debounced save
  useEffect(() => {
    if (!enabled) return;

    const dataStr = JSON.stringify(data);

    // Skip if data hasn't changed
    if (dataStr === previousDataRef.current) return;

    // Skip if it's the initial empty data
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      previousDataRef.current = dataStr;
      return;
    }

    previousDataRef.current = dataStr;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setIsSaving(true);

    // Debounce save
    saveTimeoutRef.current = setTimeout(() => {
      saveToStorage(data);
      setIsSaving(false);
    }, debounceMs);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [data, enabled, debounceMs, saveToStorage]);

  // Restore draft from localStorage
  const restoreDraft = useCallback((): RecipeFormData | null => {
    if (typeof window === 'undefined') return null;

    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return null;

      const draft = JSON.parse(stored);

      // Check if draft has expired (24 hours)
      if (draft.expiresAt && Date.now() > draft.expiresAt) {
        localStorage.removeItem(storageKey);
        return null;
      }

      if (draft.data) {
        setLastSaved(new Date(draft.lastSaved));
        setHasDraft(true);
        return draft.data as RecipeFormData;
      }
    } catch (error) {
      console.error('Failed to restore recipe draft:', error);
    }
    return null;
  }, [storageKey]);

  // Clear draft
  const clearDraft = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(storageKey);
      setHasDraft(false);
      setLastSaved(null);
      previousDataRef.current = '';
      isInitializedRef.current = false;
    } catch (error) {
      console.error('Failed to clear recipe draft:', error);
    }
  }, [storageKey]);

  // Check if draft exists
  const checkDraft = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;

    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return false;

      const draft = JSON.parse(stored);
      if (draft.expiresAt && Date.now() > draft.expiresAt) {
        localStorage.removeItem(storageKey);
        return false;
      }

      setHasDraft(true);
      return true;
    } catch {
      return false;
    }
  }, [storageKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    isSaving,
    lastSaved,
    hasDraft,
    clearDraft,
    restoreDraft,
    checkDraft,
    saveDraft: (overrideData?: T) => saveToStorage(overrideData ?? data),
  };
}

// Meal Plan form data interface
export interface MealPlanFormData {
  clientId: string;
  planName: string;
  description: string;
  startDate: string;
  endDate: string;
  targetCalories: string;
  targetProtein: string;
  targetCarbs: string;
  targetFat: string;
  meals: Array<{ day: number; mealType: string; recipe: string; quantity: number }>;
  medicalHistory?: string;
  notes?: string;
}

/**
 * Auto-save hook specifically for Meal Plan creation/editing
 * Drafts expire after 24 hours
 * Generic type T allows it to work with both MealPlanFormData and MealPlanTemplate
 */
export function useMealPlanAutoSave<T = MealPlanFormData>(
  id: string,
  data: T,
  options: {
    debounceMs?: number;
    enabled?: boolean;
    onSaveSuccess?: () => void;
    onSaveError?: (error: Error) => void;
  } = {}
) {
  const { debounceMs = 2000, enabled = true, onSaveSuccess, onSaveError } = options;
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousDataRef = useRef<string>('');
  const isInitializedRef = useRef(false);

  const storageKey = `draft_meal-plan_${id}`;

  // Save to localStorage
  const saveToStorage = useCallback((formData: T) => {
    if (typeof window === 'undefined') return;

    try {
      const draft = {
        id,
        type: 'meal-plan',
        data: formData,
        lastSaved: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      };
      localStorage.setItem(storageKey, JSON.stringify(draft));
      setHasDraft(true);
      setLastSaved(new Date());
    } catch (error) {
      console.error('Failed to save meal plan draft:', error);
    }
  }, [id, storageKey]);

  // Debounced save effect
  useEffect(() => {
    if (!enabled) return;

    const currentDataStr = JSON.stringify(data);

    // Skip if no changes
    if (previousDataRef.current === currentDataStr) return;

    // Skip initial empty state
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      previousDataRef.current = currentDataStr;
      return;
    }

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setIsSaving(true);

    // Debounced save
    saveTimeoutRef.current = setTimeout(() => {
      saveToStorage(data);
      previousDataRef.current = currentDataStr;
      setIsSaving(false);
      onSaveSuccess?.();
    }, debounceMs);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [data, enabled, debounceMs, saveToStorage, onSaveSuccess]);

  // Restore draft from localStorage
  const restoreDraft = useCallback((): T | null => {
    if (typeof window === 'undefined') return null;

    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return null;

      const draft = JSON.parse(stored);

      // Check if expired
      if (draft.expiresAt && Date.now() > draft.expiresAt) {
        localStorage.removeItem(storageKey);
        return null;
      }

      setHasDraft(true);
      setLastSaved(draft.lastSaved ? new Date(draft.lastSaved) : null);
      previousDataRef.current = JSON.stringify(draft.data);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return draft.data as any;
    } catch (error) {
      console.error('Failed to restore meal plan draft:', error);
      return null;
    }
  }, [storageKey]);

  // Clear draft
  const clearDraft = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(storageKey);
      setHasDraft(false);
      setLastSaved(null);
      previousDataRef.current = '';
      isInitializedRef.current = false;
    } catch (error) {
      console.error('Failed to clear meal plan draft:', error);
    }
  }, [storageKey]);

  // Check if draft exists
  const checkDraft = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;

    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return false;

      const draft = JSON.parse(stored);
      if (draft.expiresAt && Date.now() > draft.expiresAt) {
        localStorage.removeItem(storageKey);
        return false;
      }

      setHasDraft(true);
      return true;
    } catch {
      return false;
    }
  }, [storageKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    isSaving,
    lastSaved,
    hasDraft,
    clearDraft,
    restoreDraft,
    checkDraft,
    saveDraft: () => saveToStorage(data),
  };
}

/**
 * Auto-save hook specifically for Diet Template creation/editing
 * Generic type T allows it to work with any diet template structure
 * Drafts expire after 24 hours
 */
export function useDietTemplateAutoSave<T = any>(
  id: string,
  data: T,
  options: {
    debounceMs?: number;
    enabled?: boolean;
    onSaveSuccess?: () => void;
    onSaveError?: (error: Error) => void;
  } = {}
) {
  const { debounceMs = 2000, enabled = true, onSaveSuccess, onSaveError } = options;
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousDataRef = useRef<string>('');
  const isInitializedRef = useRef(false);

  const storageKey = `draft_diet-template_${id}`;

  // Save to localStorage
  const saveToStorage = useCallback((formData: T) => {
    if (typeof window === 'undefined') return;

    try {
      const draft = {
        id,
        type: 'diet-template',
        data: formData,
        lastSaved: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      };
      localStorage.setItem(storageKey, JSON.stringify(draft));
      setHasDraft(true);
      setLastSaved(new Date());
    } catch (error) {
      console.error('Failed to save diet template draft:', error);
    }
  }, [id, storageKey]);

  // Debounced save effect
  useEffect(() => {
    if (!enabled) return;

    const currentDataStr = JSON.stringify(data);

    // Skip if no changes
    if (previousDataRef.current === currentDataStr) return;

    // Skip initial empty state
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      previousDataRef.current = currentDataStr;
      return;
    }

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setIsSaving(true);

    // Debounced save
    saveTimeoutRef.current = setTimeout(() => {
      saveToStorage(data);
      previousDataRef.current = currentDataStr;
      setIsSaving(false);
      onSaveSuccess?.();
    }, debounceMs);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [data, enabled, debounceMs, saveToStorage, onSaveSuccess]);

  // Restore draft from localStorage
  const restoreDraft = useCallback((): T | null => {
    if (typeof window === 'undefined') return null;

    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return null;

      const draft = JSON.parse(stored);

      // Check if expired
      if (draft.expiresAt && Date.now() > draft.expiresAt) {
        localStorage.removeItem(storageKey);
        return null;
      }

      setHasDraft(true);
      setLastSaved(draft.lastSaved ? new Date(draft.lastSaved) : null);
      previousDataRef.current = JSON.stringify(draft.data);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return draft.data as any;
    } catch (error) {
      console.error('Failed to restore diet template draft:', error);
      return null;
    }
  }, [storageKey]);

  // Clear draft
  const clearDraft = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(storageKey);
      setHasDraft(false);
      setLastSaved(null);
      previousDataRef.current = '';
      isInitializedRef.current = false;
    } catch (error) {
      console.error('Failed to clear diet template draft:', error);
    }
  }, [storageKey]);

  // Check if draft exists
  const checkDraft = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;

    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return false;

      const draft = JSON.parse(stored);
      if (draft.expiresAt && Date.now() > draft.expiresAt) {
        localStorage.removeItem(storageKey);
        return false;
      }

      setHasDraft(true);
      return true;
    } catch {
      return false;
    }
  }, [storageKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    isSaving,
    lastSaved,
    hasDraft,
    clearDraft,
    restoreDraft,
    checkDraft,
    saveDraft: () => saveToStorage(data),
  };
}

/**
 * Generic form auto-save hook
 * Works with any form data structure
 * Drafts expire after 24 hours
 */
export function useFormAutoSave<T = any>(
  formType: string,
  id: string,
  data: T,
  options: {
    debounceMs?: number;
    enabled?: boolean;
    onSaveSuccess?: () => void;
    onSaveError?: (error: Error) => void;
  } = {}
) {
  const { debounceMs = 2000, enabled = true, onSaveSuccess, onSaveError } = options;
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousDataRef = useRef<string>('');
  const isInitializedRef = useRef(false);

  const storageKey = `draft_${formType}_${id}`;

  // Save to localStorage
  const saveToStorage = useCallback((formData: T) => {
    if (typeof window === 'undefined') return;

    try {
      const draft = {
        id,
        type: formType,
        data: formData,
        lastSaved: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      };
      localStorage.setItem(storageKey, JSON.stringify(draft));
      setHasDraft(true);
      setLastSaved(new Date());
    } catch (error) {
      console.error(`Failed to save ${formType} draft:`, error);
    }
  }, [id, formType, storageKey]);

  // Debounced save effect
  useEffect(() => {
    if (!enabled) return;

    const currentDataStr = JSON.stringify(data);

    // Skip if no changes
    if (previousDataRef.current === currentDataStr) return;

    // Skip initial empty state
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      previousDataRef.current = currentDataStr;
      return;
    }

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setIsSaving(true);

    // Debounced save
    saveTimeoutRef.current = setTimeout(() => {
      saveToStorage(data);
      previousDataRef.current = currentDataStr;
      setIsSaving(false);
      onSaveSuccess?.();
    }, debounceMs);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [data, enabled, debounceMs, saveToStorage, onSaveSuccess]);

  // Restore draft from localStorage
  const restoreDraft = useCallback((): T | null => {
    if (typeof window === 'undefined') return null;

    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return null;

      const draft = JSON.parse(stored);

      // Check if expired
      if (draft.expiresAt && Date.now() > draft.expiresAt) {
        localStorage.removeItem(storageKey);
        return null;
      }

      setHasDraft(true);
      setLastSaved(draft.lastSaved ? new Date(draft.lastSaved) : null);
      previousDataRef.current = JSON.stringify(draft.data);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return draft.data as any;
    } catch (error) {
      console.error(`Failed to restore ${formType} draft:`, error);
      return null;
    }
  }, [storageKey, formType]);

  // Clear draft
  const clearDraft = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(storageKey);
      setHasDraft(false);
      setLastSaved(null);
      previousDataRef.current = '';
      isInitializedRef.current = false;
    } catch (error) {
      console.error(`Failed to clear ${formType} draft:`, error);
    }
  }, [storageKey, formType]);

  // Check if draft exists
  const checkDraft = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;

    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return false;

      const draft = JSON.parse(stored);
      if (draft.expiresAt && Date.now() > draft.expiresAt) {
        localStorage.removeItem(storageKey);
        return false;
      }

      setHasDraft(true);
      return true;
    } catch {
      return false;
    }
  }, [storageKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    isSaving,
    lastSaved,
    hasDraft,
    clearDraft,
    restoreDraft,
    checkDraft,
    saveDraft: () => saveToStorage(data),
  };
}

/**
 * Auto-save status indicator component
 */
export function AutoSaveIndicator({
  status,
  lastSaved
}: {
  status: DraftStatus;
  lastSaved: Date | null;
}) {
  const getStatusText = () => {
    switch (status) {
      case 'saving':
        return 'Saving...';
      case 'saved':
        return lastSaved ? `Saved at ${lastSaved.toLocaleTimeString()}` : 'Saved';
      case 'error':
        return 'Save failed';
      case 'restoring':
        return 'Restoring...';
      default:
        return lastSaved ? `Last saved at ${lastSaved.toLocaleTimeString()}` : '';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'saving':
      case 'restoring':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'saved':
        return 'text-green-600 dark:text-green-400';
      case 'error':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-500 dark:text-gray-400';
    }
  };

  return {
    text: getStatusText(),
    color: getStatusColor(),
    status,
    isSaving: status === 'saving',
    lastSaved
  };
}

export default useAutoSave;
