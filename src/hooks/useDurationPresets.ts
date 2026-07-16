'use client';

import { useState, useEffect, useCallback } from 'react';

export interface DurationPreset {
    _id?: string;
    days: number;
    label: string;
}

// Default fallback presets in case API fails
const DEFAULT_PRESETS: DurationPreset[] = [
    { days: 7, label: '1 Week' },
    { days: 10, label: '10 Days' },
    { days: 14, label: '2 Weeks' },
    { days: 21, label: '3 Weeks' },
    { days: 30, label: '1 Month' },
    { days: 60, label: '2 Months' },
    { days: 90, label: '3 Months' },
    { days: 180, label: '6 Months' },
    { days: 365, label: '1 Year' },
];

// Global cache for duration presets
let cachedPresets: DurationPreset[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useDurationPresets() {
    const [presets, setPresets] = useState<DurationPreset[]>(cachedPresets || DEFAULT_PRESETS);
    const [loading, setLoading] = useState(!cachedPresets);
    const [error, setError] = useState<string | null>(null);

    const fetchPresets = useCallback(async (force = false) => {
        // Use cache if valid and not forced
        if (!force && cachedPresets && Date.now() - cacheTimestamp < CACHE_TTL) {
            setPresets(cachedPresets);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const response = await fetch('/api/duration-presets');

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.presets && data.presets.length > 0) {
                    cachedPresets = data.presets;
                    cacheTimestamp = Date.now();
                    setPresets(data.presets);
                } else {
                    // Use defaults if no presets returned
                    setPresets(DEFAULT_PRESETS);
                }
            } else {
                // Fallback to defaults on error
                setPresets(DEFAULT_PRESETS);
                setError('Failed to fetch presets');
            }
        } catch (err) {
            console.error('Error fetching duration presets:', err);
            setPresets(DEFAULT_PRESETS);
            setError('Failed to fetch presets');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPresets();
    }, [fetchPresets]);

    // Helper function to get label from days
    const getDurationLabel = useCallback((days: number): string => {
        const preset = presets.find(p => p.days === days);
        if (preset) return preset.label;

        // Generate label for non-preset values
        if (days % 365 === 0) return `${days / 365} Year${days / 365 > 1 ? 's' : ''}`;
        if (days % 30 === 0) return `${days / 30} Month${days / 30 > 1 ? 's' : ''}`;
        if (days % 7 === 0) return `${days / 7} Week${days / 7 > 1 ? 's' : ''}`;
        return `${days} Days`;
    }, [presets]);

    // Refresh cache
    const refreshPresets = useCallback(() => {
        cachedPresets = null;
        cacheTimestamp = 0;
        fetchPresets(true);
    }, [fetchPresets]);

    return {
        presets,
        loading,
        error,
        getDurationLabel,
        refreshPresets
    };
}

// Export a function to clear the cache (useful after admin updates)
export function clearDurationPresetsCache() {
    cachedPresets = null;
    cacheTimestamp = 0;
}
