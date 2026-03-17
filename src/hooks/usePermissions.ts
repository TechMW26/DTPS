"use client";

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

export type PermissionKey =
    | 'view_assigned_clients'
    | 'view_all_clients'
    | 'edit_client_profile'
    | 'assign_clients_to_dietitians'
    | 'assign_clients_to_health_counselors'
    | 'create_meal_plans'
    | 'edit_meal_plans'
    | 'delete_meal_plans'
    | 'view_all_meal_plans'
    | 'create_recipes'
    | 'edit_recipes'
    | 'delete_recipes'
    | 'view_all_recipes'
    | 'create_appointments'
    | 'edit_appointments'
    | 'cancel_appointments'
    | 'view_all_appointments'
    | 'create_payment_links'
    | 'view_payment_history'
    | 'view_all_payments'
    | 'mark_payments_as_paid'
    | 'send_messages'
    | 'view_all_messages'
    | 'create_diet_templates'
    | 'edit_diet_templates'
    | 'delete_diet_templates'
    | 'view_all_diet_templates'
    | 'send_push_notifications'
    | 'view_analytics'
    | 'view_revenue_reports'
    | 'manage_users'
    | 'manage_permissions'
    | 'manage_service_plans';

interface UsePermissionsReturn {
    permissions: PermissionKey[];
    loading: boolean;
    error: string | null;
    hasPermission: (key: PermissionKey) => boolean;
    hasAnyPermission: (keys: PermissionKey[]) => boolean;
    hasAllPermissions: (keys: PermissionKey[]) => boolean;
    isAdmin: boolean;
    refresh: () => Promise<void>;
}

/**
 * Hook to check user permissions on the client side
 * Admin always has all permissions
 */
export function usePermissions(): UsePermissionsReturn {
    const { data: session, status } = useSession();
    const [permissions, setPermissions] = useState<PermissionKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const isAdmin = session?.user?.role === 'admin';

    const fetchPermissions = useCallback(async () => {
        if (status === 'loading') return;

        if (!session?.user) {
            setPermissions([]);
            setLoading(false);
            return;
        }

        // Admin has all permissions
        if (isAdmin) {
            setPermissions([
                'view_assigned_clients',
                'view_all_clients',
                'edit_client_profile',
                'assign_clients_to_dietitians',
                'assign_clients_to_health_counselors',
                'create_meal_plans',
                'edit_meal_plans',
                'delete_meal_plans',
                'view_all_meal_plans',
                'create_recipes',
                'edit_recipes',
                'delete_recipes',
                'view_all_recipes',
                'create_appointments',
                'edit_appointments',
                'cancel_appointments',
                'view_all_appointments',
                'create_payment_links',
                'view_payment_history',
                'view_all_payments',
                'mark_payments_as_paid',
                'send_messages',
                'view_all_messages',
                'create_diet_templates',
                'edit_diet_templates',
                'delete_diet_templates',
                'view_all_diet_templates',
                'send_push_notifications',
                'view_analytics',
                'view_revenue_reports',
                'manage_users',
                'manage_permissions',
                'manage_service_plans',
            ]);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const response = await fetch('/api/admin/permissions/check');
            const data = await response.json();

            if (data.success) {
                setPermissions(data.permissions || []);
                setError(null);
            } else {
                setError(data.error || 'Failed to fetch permissions');
                setPermissions([]);
            }
        } catch (err) {
            console.error('Error fetching permissions:', err);
            setError('Failed to fetch permissions');
            setPermissions([]);
        } finally {
            setLoading(false);
        }
    }, [session, status, isAdmin]);

    useEffect(() => {
        fetchPermissions();
    }, [fetchPermissions]);

    const hasPermission = useCallback((key: PermissionKey): boolean => {
        if (isAdmin) return true;
        return permissions.includes(key);
    }, [permissions, isAdmin]);

    const hasAnyPermission = useCallback((keys: PermissionKey[]): boolean => {
        if (isAdmin) return true;
        return keys.some(key => permissions.includes(key));
    }, [permissions, isAdmin]);

    const hasAllPermissions = useCallback((keys: PermissionKey[]): boolean => {
        if (isAdmin) return true;
        return keys.every(key => permissions.includes(key));
    }, [permissions, isAdmin]);

    return {
        permissions,
        loading,
        error,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        isAdmin,
        refresh: fetchPermissions,
    };
}

/**
 * Hook to check a single permission
 */
export function useHasPermission(key: PermissionKey): {
    hasPermission: boolean;
    loading: boolean;
} {
    const { hasPermission, loading } = usePermissions();

    return {
        hasPermission: hasPermission(key),
        loading,
    };
}
