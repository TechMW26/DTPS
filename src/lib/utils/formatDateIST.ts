/**
 * Client-side IST date formatting utilities.
 *
 * This app is exclusively for Indian users — all dates displayed to the user
 * must be in IST (Asia/Kolkata) regardless of the user's device timezone.
 *
 * Usage:
 *   import { formatDateIST, formatTimeIST, formatDateTimeIST } from '@/lib/utils/formatDateIST';
 *   <span>{formatDateIST(someDate)}</span>
 */

const IST = 'Asia/Kolkata';

/** "26 Mar 2026" */
export function formatDateIST(date: string | Date | undefined | null, options?: Intl.DateTimeFormatOptions): string {
    if (!date) return '-';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return 'Invalid Date';
    return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: IST,
        ...options,
    });
}

/** "26 Mar" (no year) */
export function formatShortDateIST(date: string | Date | undefined | null): string {
    if (!date) return '-';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return 'Invalid Date';
    return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        timeZone: IST,
    });
}

/** "04:30 PM" */
export function formatTimeIST(date: string | Date | undefined | null): string {
    if (!date) return '-';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return 'Invalid Date';
    return d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: IST,
    });
}

/** "26 Mar 2026, 04:30 PM" */
export function formatDateTimeIST(date: string | Date | undefined | null): string {
    if (!date) return '-';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return 'Invalid Date';
    return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: IST,
    });
}

/** Wrapper for .toLocaleDateString() with IST forced — accepts custom Intl options */
export function toLocaleDateStringIST(
    date: string | Date,
    locale: string = 'en-IN',
    options: Intl.DateTimeFormatOptions = {}
): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return 'Invalid Date';
    return d.toLocaleDateString(locale, { timeZone: IST, ...options });
}

/** Wrapper for .toLocaleTimeString() with IST forced */
export function toLocaleTimeStringIST(
    date: string | Date,
    locale: string = 'en-IN',
    options: Intl.DateTimeFormatOptions = {}
): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return 'Invalid Date';
    return d.toLocaleTimeString(locale, { timeZone: IST, ...options });
}

/** Wrapper for .toLocaleString() with IST forced */
export function toLocaleStringIST(
    date: string | Date,
    locale: string = 'en-IN',
    options: Intl.DateTimeFormatOptions = {}
): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return 'Invalid Date';
    return d.toLocaleString(locale, { timeZone: IST, ...options });
}
