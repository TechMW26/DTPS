import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import OTPRecord from '@/lib/db/models/OTPRecord';
import { UserRole } from '@/types';
import { OTP_CONFIG, normalizePhone } from '@/lib/auth/otpStore';
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

        if (!otp || typeof otp !== 'string' || otp.length !== 4) {
            return NextResponse.json(
                { success: false, error: 'Valid 4-digit OTP is required' },
                { status: 400 }
            );
        }

        const normalizedPhone = normalizePhone(phone);

        await connectDB();

        // Find the OTP record
        const otpRecord = await OTPRecord.findOne({
            phone: normalizedPhone,
            expiresAt: { $gt: new Date() },
        });

        if (!otpRecord) {
            return NextResponse.json(
                { success: false, error: 'OTP expired or not found. Please request a new OTP.' },
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

        // Verify OTP
        if (otpRecord.otp !== otp) {
            await OTPRecord.updateOne(
                { _id: otpRecord._id },
                { $inc: { attempts: 1 } }
            );
            const remaining = OTP_CONFIG.MAX_ATTEMPTS - otpRecord.attempts - 1;
            return NextResponse.json(
                { success: false, error: `Invalid OTP. ${remaining} attempts remaining.` },
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

        const token = sign(
            {
                userId: user._id.toString(),
                email: user.email,
                name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
                role: user.role,
                onboardingCompleted: user.onboardingCompleted,
            },
            jwtSecret,
            { expiresIn: '1h' }
        );

        // Determine redirect URL based on onboarding status
        const redirectUrl = user.onboardingCompleted ? '/user' : '/user/onboarding';

        return NextResponse.json({
            success: true,
            message: isNewUser ? 'Account created successfully!' : 'Login successful!',
            token,
            redirectUrl,
            user: {
                id: user._id.toString(),
                email: user.email,
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
