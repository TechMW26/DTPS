import { formatInTimeZone } from 'date-fns-tz';
import { format, parseISO } from 'date-fns';

/**
 * Common timezone identifiers
 */
export const COMMON_TIMEZONES = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
];

/**
 * Get user's browser timezone
 */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    console.warn('Could not detect browser timezone, falling back to UTC');
    return 'UTC';
  }
}

/**
 * Convert a date to a specific timezone
 */
export function convertToTimezone(date: Date | string, timezone: string): Date {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return new Date(formatInTimeZone(dateObj, timezone, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"));
}

/**
 * Format a date in a specific timezone
 */
export function formatInUserTimezone(
  date: Date | string,
  timezone: string,
  formatString: string = 'PPpp'
): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatInTimeZone(dateObj, timezone, formatString);
}

/**
 * Format appointment time for display
 */
export function formatAppointmentTime(
  scheduledAt: Date | string,
  timezone: string = 'UTC'
): {
  date: string;
  time: string;
  datetime: string;
  dayOfWeek: string;
} {
  try {
    if (!scheduledAt) {
      return {
        date: 'N/A',
        time: 'N/A',
        datetime: 'N/A',
        dayOfWeek: 'N/A',
      };
    }

    const dateObj = typeof scheduledAt === 'string' ? parseISO(scheduledAt) : scheduledAt;

    if (isNaN(dateObj.getTime())) {
      return {
        date: 'Invalid Date',
        time: 'Invalid Date',
        datetime: 'Invalid Date',
        dayOfWeek: 'Invalid Date',
      };
    }

    return {
      date: formatInTimeZone(dateObj, timezone, 'MMMM d, yyyy'),
      time: formatInTimeZone(dateObj, timezone, 'h:mm a'),
      datetime: formatInTimeZone(dateObj, timezone, 'PPpp'),
      dayOfWeek: formatInTimeZone(dateObj, timezone, 'EEEE'),
    };
  } catch (error) {
    console.error('Error formatting appointment time:', error);
    return {
      date: 'Error',
      time: 'Error',
      datetime: 'Error',
      dayOfWeek: 'Error',
    };
  }
}

/**
 * Check if an appointment is in the past
 */
export function isAppointmentPast(scheduledAt: Date | string, timezone: string = 'UTC'): boolean {
  const dateObj = typeof scheduledAt === 'string' ? parseISO(scheduledAt) : scheduledAt;
  const now = new Date();
  
  // Convert both dates to the same timezone for comparison
  const appointmentInTimezone = convertToTimezone(dateObj, timezone);
  const nowInTimezone = convertToTimezone(now, timezone);
  
  return appointmentInTimezone < nowInTimezone;
}

/**
 * Get time until appointment
 */
export function getTimeUntilAppointment(
  scheduledAt: Date | string,
  timezone: string = 'UTC'
): {
  isPast: boolean;
  days: number;
  hours: number;
  minutes: number;
  totalMinutes: number;
} {
  const dateObj = typeof scheduledAt === 'string' ? parseISO(scheduledAt) : scheduledAt;
  const now = new Date();
  
  const appointmentInTimezone = convertToTimezone(dateObj, timezone);
  const nowInTimezone = convertToTimezone(now, timezone);
  
  const diffMs = appointmentInTimezone.getTime() - nowInTimezone.getTime();
  const isPast = diffMs < 0;
  const absDiffMs = Math.abs(diffMs);
  
  const totalMinutes = Math.floor(absDiffMs / (1000 * 60));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  
  return {
    isPast,
    days,
    hours,
    minutes,
    totalMinutes,
  };
}

/**
 * Convert local time to UTC for database storage
 */
export function convertLocalToUTC(localDateTime: Date | string, timezone: string): Date {
  const dateObj = typeof localDateTime === 'string' ? parseISO(localDateTime) : localDateTime;
  
  // Create a date string in the local timezone
  const localDateString = formatInTimeZone(dateObj, timezone, "yyyy-MM-dd'T'HH:mm:ss");
  
  // Parse it as if it were in the local timezone and convert to UTC
  const utcDate = new Date(localDateString + (timezone === 'UTC' ? 'Z' : ''));
  
  return utcDate;
}

/**
 * Generate time slots for a given date and timezone
 * Note: This function uses 24-hour format internally for calculations
 * Input times can be in either 12-hour (e.g., "9:00 AM") or 24-hour (e.g., "09:00") format
 */
export function generateTimeSlots(
  date: Date | string,
  startTime: string, // "9:00 AM" or "09:00"
  endTime: string,   // "5:00 PM" or "17:00"
  intervalMinutes: number = 15,
  timezone: string = 'UTC'
): string[] {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  const slots: string[] = [];
  
  // Parse time - handle both 12-hour and 24-hour formats
  const parseTime = (timeStr: string): { hour: number; minute: number } => {
    const match12 = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match12) {
      let hour = parseInt(match12[1], 10);
      const minute = parseInt(match12[2], 10);
      const period = match12[3].toUpperCase();
      if (period === 'PM' && hour !== 12) hour += 12;
      if (period === 'AM' && hour === 12) hour = 0;
      return { hour, minute };
    }
    const [hour, minute] = timeStr.split(':').map(Number);
    return { hour, minute };
  };
  
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  
  const startDateTime = new Date(dateObj);
  startDateTime.setHours(start.hour, start.minute, 0, 0);
  
  const endDateTime = new Date(dateObj);
  endDateTime.setHours(end.hour, end.minute, 0, 0);
  
  let currentTime = new Date(startDateTime);
  
  while (currentTime < endDateTime) {
    const timeString = formatInTimeZone(currentTime, timezone, 'HH:mm');
    slots.push(timeString);
    currentTime = new Date(currentTime.getTime() + (intervalMinutes * 60 * 1000));
  }
  
  return slots;
}
