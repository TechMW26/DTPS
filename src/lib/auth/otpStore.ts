// Shared OTP store for send and verify routes
// In production, use Redis or database for distributed systems
import { normalizePhoneNumber } from '@/lib/validations/contact';

interface OTPData {
    otp: string;
    expiresAt: number;
    attempts: number;
    userName: string;
    userId: string;
}

interface RateLimitData {
    count: number;
    resetAt: number;
}

// OTP store: phone -> OTP data
export const otpStore = new Map<string, OTPData>();

// Rate limit store: phone -> rate limit data
export const rateLimitStore = new Map<string, RateLimitData>();

// OTP configuration
export const OTP_CONFIG = {
    EXPIRY_MS: 5 * 60 * 1000, // 5 minutes
    MAX_ATTEMPTS: 3, // Max verification attempts
    MAX_REQUESTS_PER_HOUR: 5, // Max OTP requests per phone per hour
    OTP_LENGTH: 4
};

// Generate 4-digit OTP
export function generateOTP(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// Normalize phone number
export function normalizePhone(phone: string): string {
    return normalizePhoneNumber(phone, '+91');
}

// Clean up expired entries
export function cleanupExpiredEntries(): void {
    const now = Date.now();
    for (const [phone, data] of otpStore.entries()) {
        if (data.expiresAt < now) {
            otpStore.delete(phone);
        }
    }
    for (const [phone, data] of rateLimitStore.entries()) {
        if (data.resetAt < now) {
            rateLimitStore.delete(phone);
        }
    }
}

// Start cleanup interval (runs every minute)
if (typeof setInterval !== 'undefined') {
    setInterval(cleanupExpiredEntries, 60000);
}
