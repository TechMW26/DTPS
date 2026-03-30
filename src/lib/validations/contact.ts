export const EMAIL_REGEX = /^(?=.*[a-zA-Z])[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
export const PHONE_REGEX = /^\+\d{10,15}$/;

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

    // Common India-friendly handling (legacy DB compatibility)
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
        return { isValid: false, error: 'Please enter a valid phone number with 10 to 15 digits' };
    }

    return { isValid: true, normalized: normalizedPhone };
}
