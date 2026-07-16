import { UserRole } from '@/types';

export const JOURNAL_ALLOWED_ROLES = [
    UserRole.ADMIN,
    UserRole.DIETITIAN,
    UserRole.HEALTH_COUNSELOR,
    'health_counselor',
    'admin',
    'dietitian',
];

export const getDateOnly = (date: Date | string): Date => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
};

export const canAccessClientData = (
    session: { user: { id: string; role: string } },
    clientId: string
): boolean => {
    if (session.user.id === clientId) return true;
    return JOURNAL_ALLOWED_ROLES.includes(session.user.role as any);
};

export const buildJournalCacheKey = (scope: string, clientId: string, date: Date): string => {
    return `journal:${scope}:${clientId}:${date.toISOString().slice(0, 10)}`;
};

export function summarizeActivities(activities: Array<{ duration: number; sets: number }>, targetMinutes = 60) {
    let totalDuration = 0;
    let totalSets = 0;

    for (const activity of activities) {
        totalDuration += activity.duration || 0;
        totalSets += activity.sets || 0;
    }

    return {
        totalDuration,
        totalSets,
        target: targetMinutes,
        percentage: Math.min(Math.round((totalDuration / targetMinutes) * 100), 100),
    };
}

export function summarizeSteps(steps: Array<{ steps: number; distance: number; calories: number }>, targetSteps = 10000) {
    let totalSteps = 0;
    let totalDistance = 0;
    let totalCalories = 0;

    for (const entry of steps) {
        totalSteps += entry.steps || 0;
        totalDistance += entry.distance || 0;
        totalCalories += entry.calories || 0;
    }

    return {
        totalSteps,
        totalDistance,
        totalCalories,
        target: targetSteps,
        percentage: Math.min(Math.round((totalSteps / targetSteps) * 100), 100),
    };
}

export function summarizeSleep(sleep: Array<{ hours: number; minutes: number }>, targetHours = 8) {
    let totalMinutes = 0;

    for (const entry of sleep) {
        totalMinutes += (entry.hours || 0) * 60 + (entry.minutes || 0);
    }

    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;
    const targetMinutes = targetHours * 60;

    return {
        totalMinutes,
        totalHours,
        remainingMinutes,
        displayTime: `${totalHours}h ${remainingMinutes}m`,
        target: targetHours,
        percentage: Math.min(Math.round((totalMinutes / targetMinutes) * 100), 100),
    };
}

export function summarizeWater(water: Array<{ amount: number; unit: string }>, targetMl = 2500) {
    const unitToMl: Record<string, number> = {
        'Glass (250ml)': 250,
        'Bottle (500ml)': 500,
        'Bottle (1L)': 1000,
        'Cup (200ml)': 200,
        glasses: 250,
    };

    let totalMl = 0;

    for (const entry of water) {
        totalMl += (entry.amount || 0) * (unitToMl[entry.unit] || 250);
    }

    return {
        totalMl,
        totalLiters: (totalMl / 1000).toFixed(1),
        target: targetMl,
        percentage: Math.min(Math.round((totalMl / targetMl) * 100), 100),
    };
}