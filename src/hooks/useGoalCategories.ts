import { useState, useEffect, useCallback } from 'react';

export interface GoalCategory {
    _id: string;
    name: string;
    value: string;
    description?: string;
    icon?: string;
    isActive: boolean;
    order: number;
}

// Default fallback goals if API fails
const DEFAULT_GOALS: GoalCategory[] = [
    { _id: '1', name: 'Weight Loss', value: 'weight-loss', isActive: true, order: 1 },
    { _id: '2', name: 'Weight Gain', value: 'weight-gain', isActive: true, order: 2 },
    { _id: '3', name: 'Muscle Gain', value: 'muscle-gain', isActive: true, order: 3 },
    { _id: '4', name: 'Maintain Weight', value: 'maintain-weight', isActive: true, order: 4 },
    { _id: '5', name: 'Disease Management', value: 'disease-management', isActive: true, order: 5 },
];

export function useGoalCategories() {
    const [categories, setCategories] = useState<GoalCategory[]>(DEFAULT_GOALS);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchCategories = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const response = await fetch('/api/admin/goal-categories?active=true', {
                credentials: 'same-origin',
            });

            if (!response.ok) {
                throw new Error('Failed to fetch goal categories');
            }

            const data = await response.json();
            setCategories(Array.isArray(data) ? data : DEFAULT_GOALS);
        } catch (err) {
            console.error('Error fetching goal categories:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch categories');
            setCategories(DEFAULT_GOALS);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    return { categories, loading, error, refetch: fetchCategories };
}
