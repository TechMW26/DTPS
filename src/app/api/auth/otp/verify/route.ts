import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import OTPRecord from '@/lib/db/models/OTPRecord';
import { UserRole } from '@/types';
import { OTP_CONFIG } from '@/lib/auth/otpStore';
import { validatePhoneNumber } from '@/lib/validations/contact';
import { sign } from 'jsonwebtoken';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { phone, otp } = body;

        // Validate inputs
        if (!phone || typeof phone !== 'string') {
            return NextResponse.json(
                { success: false, error: 'Phone number is required' },
                { status: 400 }
            );
        }

        if (!otp || typeof otp !== 'string' || !/^\d{4}$/.test(otp)) {
            return NextResponse.json(
                { success: false, error: 'Valid 4-digit OTP is required' },
                { status: 400 }
            );
        }

        const phoneValidation = validatePhoneNumber(phone, '+91');
        if (!phoneValidation.isValid || !phoneValidation.normalized) {
            return NextResponse.json(
                { success: false, error: phoneValidation.error || 'Invalid phone number' },
                { status: 400 }
            );
        }

        const normalizedPhone = phoneValidation.normalized;

        await connectDB();

        // Find the most recent OTP record for this phone (sort by createdAt desc)
        const otpRecord = await OTPRecord.findOne({
            phone: normalizedPhone,
        }).sort({ createdAt: -1 });

        if (!otpRecord) {
            // No OTP record found at all for this phone
            return NextResponse.json(
                { success: false, error: 'Phone number not registered or OTP not requested. Please request a new OTP.' },
                { status: 400 }
            );
        }

        // Check if the OTP has expired
        if (new Date() > new Date(otpRecord.expiresAt)) {
            // Clean up expired record
            await OTPRecord.deleteOne({ _id: otpRecord._id });
            return NextResponse.json(
                { success: false, error: 'OTP expired, please resend.' },
                { status: 400 }
            );
        }

        // Check max attempts
        if (otpRecord.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
            await OTPRecord.deleteOne({ _id: otpRecord._id });
            return NextResponse.json(
                { success: false, error: 'Too many failed attempts. Please request a new OTP.' },
                { status: 400 }
            );
        }

        // Verify OTP — cast both sides to string to avoid type mismatch
        if (otpRecord.otp.toString() !== otp.toString()) {
            await OTPRecord.updateOne(
                { _id: otpRecord._id },
                { $inc: { attempts: 1 } }
            );
            const remaining = OTP_CONFIG.MAX_ATTEMPTS - otpRecord.attempts - 1;
            return NextResponse.json(
                { success: false, error: `Invalid OTP. ${remaining > 0 ? remaining + ' attempts remaining.' : 'Please request a new OTP.'}` },
                { status: 400 }
            );
        }

        // OTP is valid - handle based on purpose
        let user;
        let isNewUser = false;

        if (otpRecord.purpose === 'signup') {
            // Create new user for signup
            const signupData = otpRecord.signupPayload;

            if (!signupData?.firstName || !signupData?.lastName) {
                return NextResponse.json(
                    { success: false, error: 'Signup data is missing. Please try signing up again.' },
                    { status: 400 }
                );
            }

            // Check if email is provided and already exists
            if (signupData.email) {
                const existingEmailUser = await User.findOne({
                    email: signupData.email.toLowerCase(),
                });
                if (existingEmailUser) {
                    return NextResponse.json(
                        { success: false, error: 'This email is already registered. Please use a different email or sign in.' },
                        { status: 409 }
                    );
                }
            }

            // Extract raw 10-digit phone number for search
            // DB stores phones in mixed formats (10-digit, +91, 91)
            const rawPhone = normalizedPhone.replace(/^\+91/, '').replace(/^91/, '');

            // Create phone variations to search (different formats in DB)
            const phoneVariations = [
                rawPhone,                           // 9876543210 (most common in DB)
                normalizedPhone,                    // +919876543210
                normalizedPhone.replace('+', ''),   // 919876543210
                '+91' + rawPhone,                   // +919876543210
            ];

            // Final check - ensure phone number is not already registered (race condition protection)
            const existingPhoneUser = await User.findOne({
                phone: { $in: phoneVariations }
            });
            if (existingPhoneUser) {
                // Clean up the OTP record
                await OTPRecord.deleteOne({ _id: otpRecord._id });
                return NextResponse.json(
                    { success: false, error: 'This phone number is already registered with another account. Please sign in instead.' },
                    { status: 409 }
                );
            }

            // Generate a random password for the user (they will use OTP to login)
            const randomPassword = crypto.randomBytes(16).toString('hex');

            // Create user
            user = new User({
                firstName: signupData.firstName,
                lastName: signupData.lastName,
                email: signupData.email?.toLowerCase() || `${normalizedPhone.replace(/\+/g, '')}@phone.dtps.tech`,
                phone: normalizedPhone,
                password: randomPassword,
                role: UserRole.CLIENT,
                status: 'active',
                emailVerified: !signupData.email, // Auto-verify if using phone-based email
                onboardingCompleted: false,
                isNewUser: true,
            });

            await user.save();
            isNewUser = true;

            console.log('New user created via OTP signup:', user._id, user.email);
        } else {
            // Login mode - find existing user
            if (!otpRecord.userId) {
                return NextResponse.json(
                    { success: false, error: 'User not found. Please sign up first.' },
                    { status: 404 }
                );
            }

            user = await User.findById(otpRecord.userId);

            if (!user) {
                return NextResponse.json(
                    { success: false, error: 'User not found. Please sign up first.' },
                    { status: 404 }
                );
            }

            if (user.status !== 'active') {
                return NextResponse.json(
                    { success: false, error: 'Your account is not active. Please contact support.' },
                    { status: 403 }
                );
            }

            // Update last login
            await User.findByIdAndUpdate(user._id, { lastLoginAt: new Date() });
        }

        // Delete the used OTP record
        await OTPRecord.deleteOne({ _id: otpRecord._id });

        // Generate JWT token for NextAuth
        const jwtSecret = process.env.NEXTAUTH_SECRET;
        if (!jwtSecret) {
            return NextResponse.json(
                { success: false, error: 'Server configuration error' },
                { status: 500 }
            );
        }

        // Ensure user has an email (fallback for users without one)
        const userEmail = user.email || `${normalizedPhone.replace(/\+/g, '')}@phone.dtps.tech`;

        // If user didn't have an email in DB, set it now so NextAuth can always find them
        if (!user.email) {
            await User.findByIdAndUpdate(user._id, { email: userEmail });
        }

        const token = sign(
            {
                userId: user._id.toString(),
                email: userEmail,
                name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
                role: user.role,
                onboardingCompleted: user.onboardingCompleted,
            },
            jwtSecret,
            { expiresIn: '1h' }
        );

        // Determine redirect URL based on onboarding status
        const redirectUrl = user.onboardingCompleted ? '/user' : '/user/onboarding';

        console.log(`[OTP Verify] Success for ${normalizedPhone}, userId: ${user._id}, email: ${userEmail}, purpose: ${otpRecord.purpose}`);

        return NextResponse.json({
            success: true,
            message: isNewUser ? 'Account created successfully!' : 'Login successful!',
            token,
            redirectUrl,
            user: {
                id: user._id.toString(),
                email: userEmail,
                name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
                role: user.role,
                onboardingCompleted: user.onboardingCompleted,
            },
        });
    } catch (error) {
        console.error('Error in OTP verify:', error);
        return NextResponse.json(
            { success: false, error: 'An error occurred. Please try again.' },
            { status: 500 }
        );
    }
}
