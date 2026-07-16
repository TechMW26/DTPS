import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format user ID for display
 * Dietitian: Dt-XXXX (first 4 chars of MongoDB ObjectId)
 * Client: C-XXXX (first 4 chars of MongoDB ObjectId)
 * Admin: A-XXXX
 * Health Counselor: HC-XXXX
 */
export function formatUserId(id: string, role?: string): string {
  if (!id) return '';
  const shortId = id.slice(0, 4).toUpperCase();
  
  switch (role?.toLowerCase()) {
    case 'dietitian':
      return `Dt-${shortId}`;
    case 'client':
      return `C-${shortId}`;
    case 'admin':
      return `A-${shortId}`;
    case 'health_counselor':
      return `HC-${shortId}`;
    default:
      return `U-${shortId}`;
  }
}

/**
 * Get dietitian display ID (Dt-XXXX format)
 */
export function getDietitianId(id: string): string {
  if (!id) return '';
  return `Dt-${id.slice(0, 4).toUpperCase()}`;
}

/**
 * Get client display ID (C-XXXX format)
 */
export function getClientId(id: string): string {
  if (!id) return '';
  return `C-${id.slice(0, 4).toUpperCase()}`;
}

/**
 * Get health counselor display ID (HC-XXXX format)
 */
export function getHealthCounselorId(id: string): string {
  if (!id) return '';
  return `HC-${id.slice(0, 4).toUpperCase()}`;
}

/**
 * Convert time to 12-hour format with AM/PM
 * Handles both 24-hour format (HH:mm) and 12-hour format (h:mm AM/PM)
 * Examples:
 * - "06:00" → "6:00 AM"
 * - "12:00" → "12:00 PM"
 * - "15:30" → "3:30 PM"
 * - "00:00" → "12:00 AM"
 * - "12:30" → "12:30 PM"
 * - "6:30 PM" → "6:30 PM" (already 12-hour)
 * 
 * @param timeStr - Time in 24-hour format (HH:mm) or 12-hour format (h:mm AM/PM)
 * @returns Time in 12-hour format with AM/PM
 */
export function convertTo12HourFormat(timeStr: string): string {
  if (!timeStr || typeof timeStr !== 'string') {
    return '12:00 PM';
  }

  timeStr = timeStr.trim();

  // Check if already in 12-hour format with AM/PM
  if (timeStr.toLowerCase().includes('am') || timeStr.toLowerCase().includes('pm')) {
    return timeStr;
  }

  // Parse 24-hour format
  const timeParts = timeStr.split(':');
  if (timeParts.length < 2) {
    return '12:00 PM';
  }

  let hours = parseInt(timeParts[0], 10);
  const minutes = parseInt(timeParts[1], 10);

  // Validate hours and minutes
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return '12:00 PM';
  }

  // Determine AM/PM and convert to 12-hour format
  const ampm = hours >= 12 ? 'PM' : 'AM';
  
  // Convert hours: 0 → 12, 13-23 → 1-11
  if (hours > 12) {
    hours -= 12;
  } else if (hours === 0) {
    hours = 12;
  }

  // Format minutes to always have 2 digits
  const formattedMinutes = minutes.toString().padStart(2, '0');

  return `${hours}:${formattedMinutes} ${ampm}`;
}
