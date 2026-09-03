import crypto from 'crypto';
import { sign, verify } from 'jsonwebtoken';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { validateOptionalEmail, validatePhoneNumber } from '@/lib/validations/contact';
import { grantDietPlanAccessIfPublished } from '@/lib/auth/onboarding-access';

export type PhoneAuthMode = 'login' | 'signup';

export interface PhoneAuthSignupPayload {
    firstName: string;
    lastName: string;
    email?: string;
}

export interface PhoneAuthIntent {
    purpose: 'phone-auth-intent';
    phone: string;
    mode: PhoneAuthMode;
    userId?: string;
    userName: string;
    signupPayload?: PhoneAuthSignupPayload;
}

export function getPhoneVariations(normalizedPhone: string): string[] {
    const digits = normalizedPhone.replace(/^\+/, '');
    const variations = new Set([normalizedPhone, digits]);
    if (normalizedPhone.startsWith('+91') && digits.length === 12) {
        variations.add(digits.slice(2));
    }
    return [...variations];
}

export async function preparePhoneAuth(input: {
    phone: string;
    mode?: string;
    firstName?: unknown;
    lastName?: unknown;
    email?: unknown;
}): Promise<PhoneAuthIntent> {
    const phoneValidation = validatePhoneNumber(input.phone, '+91');
    if (!phoneValidation.isValid || !phoneValidation.normalized) {
        throw new PhoneAuthError(phoneValidation.error || 'Invalid phone number', 400);
    }

    const phone = phoneValidation.normalized;
    const mode: PhoneAuthMode = input.mode === 'signup' ? 'signup' : 'login';
    const phoneVariations = getPhoneVariations(phone);

    if (mode === 'login') {
        const user = await User.findOne({
            phone: { $in: phoneVariations },
            role: UserRole.CLIENT,
        }).select('_id firstName lastName status');

        if (!user) {
            throw new PhoneAuthError(
                'No client account was found for this phone number. Please sign up first.',
                404,
            );
        }
        if (user.status !== 'active') {
            throw new PhoneAuthError('Your account is not active. Please contact support.', 403);
        }

        return {
            purpose: 'phone-auth-intent',
            phone,
            mode,
            userId: user._id.toString(),
            userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User',
        };
    }

    if (typeof input.firstName !== 'string' || !input.firstName.trim()
        || typeof input.lastName !== 'string' || !input.lastName.trim()) {
        throw new PhoneAuthError('First name and last name are required for signup.', 400);
    }

    const emailValidation = validateOptionalEmail(
        typeof input.email === 'string' ? input.email : undefined,
    );
    if (!emailValidation.isValid) {
        throw new PhoneAuthError(emailValidation.error || 'Please enter a valid email address.', 400);
    }

    const duplicateQueries: Record<string, unknown>[] = [
        { phone: { $in: phoneVariations } },
    ];
    if (emailValidation.normalized) duplicateQueries.push({ email: emailValidation.normalized });
    const existingUser = await User.findOne({ $or: duplicateQueries }).select('_id phone email');
    if (existingUser) {
        const isPhoneDuplicate = phoneVariations.includes(String(existingUser.phone || ''));
        throw new PhoneAuthError(
            isPhoneDuplicate
                ? 'This phone number is already registered. Please sign in.'
                : 'This email is already registered. Please use a different email or sign in.',
            409,
        );
    }

    const signupPayload: PhoneAuthSignupPayload = {
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        ...(emailValidation.normalized ? { email: emailValidation.normalized } : {}),
    };
    return {
        purpose: 'phone-auth-intent',
        phone,
        mode,
        userName: `${signupPayload.firstName} ${signupPayload.lastName}`.trim(),
        signupPayload,
    };
}

function getJwtSecret(): string {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) throw new PhoneAuthError('Server configuration error', 500);
    return secret;
}

export function createPhoneAuthIntentToken(intent: PhoneAuthIntent): string {
    return sign(intent, getJwtSecret(), {
        expiresIn: '10m',
        issuer: 'dtps',
        audience: 'dtps-phone-auth',
    });
}

export function verifyPhoneAuthIntentToken(token: string): PhoneAuthIntent {
    try {
        const decoded = verify(token, getJwtSecret(), {
            issuer: 'dtps',
            audience: 'dtps-phone-auth',
        }) as PhoneAuthIntent;
        if (decoded.purpose !== 'phone-auth-intent'
            || !decoded.phone
            || !['login', 'signup'].includes(decoded.mode)) {
            throw new Error('Invalid intent payload');
        }
        return decoded;
    } catch (error) {
        if (error instanceof PhoneAuthError) throw error;
        throw new PhoneAuthError(
            'This verification request has expired. Please request a new code.',
            400,
        );
    }
}

export async function completePhoneAuth(intent: PhoneAuthIntent) {
    let user;
    let isNewUser = false;

    if (intent.mode === 'signup') {
        const signup = intent.signupPayload;
        if (!signup?.firstName || !signup.lastName) {
            throw new PhoneAuthError('Signup details are missing. Please start again.', 400);
        }
        const duplicateQueries: Record<string, unknown>[] = [
            { phone: { $in: getPhoneVariations(intent.phone) } },
        ];
        if (signup.email) duplicateQueries.push({ email: signup.email.toLowerCase() });
        const existingUser = await User.findOne({ $or: duplicateQueries }).select('_id');
        if (existingUser) {
            throw new PhoneAuthError(
                'This phone number or email is already registered. Please sign in instead.',
                409,
            );
        }

        user = new User({
            firstName: signup.firstName,
            lastName: signup.lastName,
            ...(signup.email ? { email: signup.email.toLowerCase() } : {}),
            phone: intent.phone,
            password: crypto.randomBytes(16).toString('hex'),
            role: UserRole.CLIENT,
            status: 'active',
            emailVerified: false,
            onboardingCompleted: false,
            isNewUser: true,
            createdBy: { role: 'self' },
        });
        await user.save();
        isNewUser = true;
    } else {
        user = intent.userId
            ? await User.findOne({
                _id: intent.userId,
                phone: { $in: getPhoneVariations(intent.phone) },
                role: UserRole.CLIENT,
            })
            : await User.findOne({
                phone: { $in: getPhoneVariations(intent.phone) },
                role: UserRole.CLIENT,
            });
        if (!user) throw new PhoneAuthError('Client account not found. Please sign up first.', 404);
        if (user.status !== 'active') {
            throw new PhoneAuthError('Your account is not active. Please contact support.', 403);
        }
        await User.findByIdAndUpdate(user._id, { lastLoginAt: new Date() });
    }

    const canAccessAssignedPlan = !isNewUser && !user.onboardingCompleted
        ? await grantDietPlanAccessIfPublished(user._id.toString())
        : false;
    const onboardingCompleted = Boolean(user.onboardingCompleted || canAccessAssignedPlan);
    const userEmail = user.email || '';
    const token = sign({
        userId: user._id.toString(),
        email: userEmail,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        role: user.role,
        onboardingCompleted,
    }, getJwtSecret(), { expiresIn: '1h' });

    return {
        success: true,
        message: isNewUser ? 'Account created successfully.' : 'Login successful.',
        token,
        redirectUrl: canAccessAssignedPlan
            ? '/user/plan'
            : onboardingCompleted ? '/user' : '/user/onboarding',
        user: {
            id: user._id.toString(),
            email: userEmail,
            name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
            role: user.role,
            onboardingCompleted,
        },
    };
}

export function maskPhone(phone: string): string {
    return phone.length > 4 ? `${phone.slice(0, -4)}****` : '****';
}

export class PhoneAuthError extends Error {
    constructor(message: string, public readonly status: number) {
        super(message);
        this.name = 'PhoneAuthError';
    }
}
