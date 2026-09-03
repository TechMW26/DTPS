export const EMAIL_REGEX = /^(?=.*[a-zA-Z])[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// E.164 permits a maximum of 15 digits. A practical eight-digit minimum keeps
// short valid international destinations available while rejecting incomplete
// country-code-only input.
export const PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

export function validateEmail(email: string): { isValid: boolean; error?: string } {
    const normalizedEmail = (email || '').trim().toLowerCase();

    if (!normalizedEmail) {
        return { isValid: false, error: 'Email is required' };
    }

    if (!normalizedEmail.includes('@')) {
        return { isValid: false, error: 'Please enter a valid email address' };
    }

    const localPart = normalizedEmail.split('@')[0];
    if (!/[a-zA-Z]/.test(localPart)) {
        return { isValid: false, error: 'Email must contain letters before @' };
    }

    if (!EMAIL_REGEX.test(normalizedEmail)) {
        return { isValid: false, error: 'Please enter a valid email address (e.g., name@example.com)' };
    }

    return { isValid: true };
}

export function validateOptionalEmail(email?: string | null): { isValid: boolean; error?: string; normalized?: string } {
    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail) {
        return { isValid: true, normalized: undefined };
    }

    const validation = validateEmail(normalizedEmail);
    if (!validation.isValid) {
        return validation;
    }

    return { isValid: true, normalized: normalizedEmail };
}

export function normalizePhoneNumber(phone: string, defaultCountryCode: string = '+91'): string {
    const raw = String(phone || '').trim();
    if (!raw) return '';

    // Keep leading + (if provided), remove all other non-digits
    if (raw.startsWith('+')) {
        const digits = raw.slice(1).replace(/\D/g, '');
        return digits ? `+${digits}` : '';
    }

    const digitsOnly = raw.replace(/\D/g, '');
    if (!digitsOnly) return '';

    // Strip leading zeros from local number — applies for all country codes.
    // e.g. UK 07911123456 with +44 → +447911123456; India 09876543210 with +91 → +919876543210
    if (digitsOnly.startsWith('0')) {
        return `${defaultCountryCode}${digitsOnly.replace(/^0+/, '')}`;
    }
    if (digitsOnly.length === 10) {
        return `${defaultCountryCode}${digitsOnly}`;
    }
    if (defaultCountryCode === '+91' && digitsOnly.startsWith('91') && digitsOnly.length === 12) {
        return `+${digitsOnly}`;
    }

    return `${defaultCountryCode}${digitsOnly}`;
}

export function validatePhoneNumber(
    phone: string,
    defaultCountryCode: string = '+91'
): { isValid: boolean; error?: string; normalized?: string } {
    const normalizedPhone = normalizePhoneNumber(phone, defaultCountryCode);

    if (!normalizedPhone) {
        return { isValid: false, error: 'Phone number is required' };
    }

    if (!PHONE_REGEX.test(normalizedPhone)) {
        return { isValid: false, error: 'Please enter a valid phone number with 8 to 15 digits, including the country code' };
    }

    return { isValid: true, normalized: normalizedPhone };
}
