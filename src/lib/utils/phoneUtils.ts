/**
 * Phone Number Utilities
 * 
 * Standard format: +91XXXXXXXXXX (13 characters for Indian numbers)
 * These utilities ensure consistent phone number handling across the app
 */

/**
 * Normalize a phone number to the standard format (+91XXXXXXXXXX)
 * Handles various input formats and ensures consistent output
 */
export function normalizePhone(phone: string | null | undefined): string | null {
    if (!phone) return null;

    // Convert to string and trim
    let cleaned = String(phone).trim();

    // Return null for empty or null-like strings
    if (!cleaned || cleaned === 'null' || cleaned === 'undefined') return null;

    // Remove all non-digit characters except +
    cleaned = cleaned.replace(/[^\d+]/g, '');

    // If empty after cleaning, return null
    if (!cleaned || cleaned.length === 0) return null;

    // Remove any existing country code variations and get just digits
    let digits = cleaned.replace(/\+/g, '');

    // Handle double 91 prefix (91919876543210 or +91919876543210)
    if (digits.startsWith('9191') && digits.length >= 14) {
        digits = digits.substring(2); // Remove first 91
    }

    // Handle standard 91 prefix (919876543210)
    if (digits.startsWith('91') && digits.length >= 12) {
        digits = digits.substring(2); // Remove 91 prefix
    }

    // Now we should have just the 10-digit number
    // Valid Indian numbers start with 6, 7, 8, or 9
    if (digits.length === 10 && /^[6-9]/.test(digits)) {
        return `+91${digits}`;
    }

    // If we have more than 10 digits but starts with 91, try to extract
    if (digits.length > 10 && digits.startsWith('91')) {
        const remaining = digits.substring(2);
        if (remaining.length === 10 && /^[6-9]/.test(remaining)) {
            return `+91${remaining}`;
        }
    }

    // If it's exactly 10 digits but doesn't start with 6-9, might be international
    // Just return with +91 if it looks like an Indian number
    if (digits.length === 10) {
        return `+91${digits}`;
    }

    // For other cases (international numbers), return as-is with + prefix
    if (cleaned.startsWith('+')) {
        return cleaned;
    }

    // Default: add +91 for any other 10-digit number
    if (digits.length >= 10) {
        const last10 = digits.slice(-10);
        return `+91${last10}`;
    }

    // Return original if can't normalize (for debugging)
    return phone;
}

/**
 * Format phone number for display
 * Converts +919876543210 to "+91 98765 43210" or just the number part
 */
export function formatPhoneDisplay(phone: string | null | undefined, includeCode = true): string {
    const normalized = normalizePhone(phone);
    if (!normalized) return '-';

    // Extract country code and number
    const match = normalized.match(/^\+(\d{1,3})(\d+)$/);
    if (!match) return normalized;

    const [, countryCode, number] = match;

    // Format the number with spaces for readability
    let formattedNumber = number;
    if (number.length === 10) {
        // Indian format: 98765 43210
        formattedNumber = `${number.slice(0, 5)} ${number.slice(5)}`;
    }

    if (includeCode) {
        return `+${countryCode} ${formattedNumber}`;
    }

    return formattedNumber;
}

/**
 * Get just the 10-digit number without country code
 */
export function getPhoneNumber(phone: string | null | undefined): string {
    const normalized = normalizePhone(phone);
    if (!normalized) return '';

    // Remove +91 or any country code
    return normalized.replace(/^\+\d{1,3}/, '');
}

/**
 * Extract country code from phone number
 */
export function getCountryCode(phone: string | null | undefined): string {
    const normalized = normalizePhone(phone);
    if (!normalized) return '+91';

    const match = normalized.match(/^\+(\d{1,3})/);
    return match ? `+${match[1]}` : '+91';
}

/**
 * Validate if phone number is a valid Indian mobile number
 */
export function isValidIndianMobile(phone: string | null | undefined): boolean {
    const normalized = normalizePhone(phone);
    if (!normalized) return false;

    // Must be +91 followed by 10 digits starting with 6-9
    return /^\+91[6-9]\d{9}$/.test(normalized);
}

/**
 * Check if phone numbers match (handles different formats)
 */
export function phonesMatch(phone1: string | null | undefined, phone2: string | null | undefined): boolean {
    const n1 = normalizePhone(phone1);
    const n2 = normalizePhone(phone2);

    if (!n1 || !n2) return false;
    return n1 === n2;
}
