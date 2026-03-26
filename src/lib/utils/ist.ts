/**
 * IST (Indian Standard Time) Utilities
 *
 * This application is exclusively for Indian users.
 * ALL timestamps must be displayed in IST (Asia/Kolkata, UTC+5:30).
 *
 * MongoDB stores dates in UTC internally — this is correct.
 * These utilities ensure dates are DISPLAYED and FORMATTED in IST.
 */

import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { parseISO, startOfDay, endOfDay } from 'date-fns';

export const IST_TIMEZONE = 'Asia/Kolkata';

// ─── Date Creation ───────────────────────────────────────────────────────────

/** Get the current time as a Date (UTC internally, but use formatIST* for display) */
export function nowIST(): Date {
    return new Date();
}

/** Get today's date string in IST (yyyy-MM-dd) */
export function todayIST(): string {
    return formatInTimeZone(new Date(), IST_TIMEZONE, 'yyyy-MM-dd');
}

/** Get start of today in IST as a UTC Date (for DB queries like "all records from today") */
export function startOfTodayIST(): Date {
    const istNow = toZonedTime(new Date(), IST_TIMEZONE);
    const istMidnight = startOfDay(istNow);
    // Convert IST midnight back to UTC for DB queries
    return new Date(istMidnight.getTime() - 5.5 * 60 * 60 * 1000);
}

/** Get end of today in IST as a UTC Date (for DB queries) */
export function endOfTodayIST(): Date {
    const istNow = toZonedTime(new Date(), IST_TIMEZONE);
    const istEnd = endOfDay(istNow);
    // Convert IST end-of-day back to UTC for DB queries
    return new Date(istEnd.getTime() - 5.5 * 60 * 60 * 1000);
}

// ─── Formatting (Server-side) ────────────────────────────────────────────────

/** Format any date to IST with a custom format string (date-fns tokens) */
export function formatIST(date: Date | string, formatStr: string = 'dd MMM yyyy, hh:mm a'): string {
    const d = typeof date === 'string' ? parseISO(date) : date;
    if (isNaN(d.getTime())) return 'Invalid Date';
    return formatInTimeZone(d, IST_TIMEZONE, formatStr);
}

/** Format date only in IST (e.g. "26 Mar 2026") */
export function formatISTDate(date: Date | string): string {
    return formatIST(date, 'dd MMM yyyy');
}

/** Format time only in IST (e.g. "04:30 PM") */
export function formatISTTime(date: Date | string): string {
    return formatIST(date, 'hh:mm a');
}

/** Format as ISO string in IST (for API responses) — e.g. "2026-03-26T16:30:00+05:30" */
export function toISTISO(date: Date | string): string {
    return formatIST(date, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx");
}

/** Format relative date in IST (e.g. "Today", "Yesterday", "26 Mar") */
export function formatISTRelative(date: Date | string): string {
    const d = typeof date === 'string' ? parseISO(date) : date;
    if (isNaN(d.getTime())) return 'Invalid Date';

    const todayStr = todayIST();
    const dateStr = formatInTimeZone(d, IST_TIMEZONE, 'yyyy-MM-dd');

    if (dateStr === todayStr) return 'Today';

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatInTimeZone(yesterday, IST_TIMEZONE, 'yyyy-MM-dd');
    if (dateStr === yesterdayStr) return 'Yesterday';

    return formatInTimeZone(d, IST_TIMEZONE, 'dd MMM');
}

// ─── Mongoose toJSON Transform Helper ────────────────────────────────────────

/**
 * Recursively converts all Date values in a plain object to IST ISO strings.
 * Used by the global Mongoose toJSON plugin.
 */
export function convertDatesToIST(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return toISTISO(obj);
    if (Array.isArray(obj)) return obj.map(convertDatesToIST);
    if (typeof obj === 'object') {
        const result: any = {};
        for (const key of Object.keys(obj)) {
            result[key] = convertDatesToIST(obj[key]);
        }
        return result;
    }
    return obj;
}
