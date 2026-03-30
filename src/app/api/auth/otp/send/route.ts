import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import OTPRecord from '@/lib/db/models/OTPRecord';
import { UserRole } from '@/types';
import {
    OTP_CONFIG,
    generateOTP,
} from '@/lib/auth/otpStore';
import { validateOptionalEmail, validatePhoneNumber } from '@/lib/validations/contact';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { phone, mode = 'login', firstName, lastName, email } = body;

        // Validate phone number
        if (!phone || typeof phone !== 'string') {
            return NextResponse.json(
                { success: false, error: 'Phone number is required' },
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

        // Rate limiting check using database
        const oneHourAgo = new Date(Date.now() - 3600000);
        const recentOtpCount = await OTPRecord.countDocuments({
            phone: normalizedPhone,
            createdAt: { $gte: oneHourAgo }
        });

        if (recentOtpCount >= OTP_CONFIG.MAX_REQUESTS_PER_HOUR) {
            return NextResponse.json(
                { success: false, error: 'Too many OTP requests. Please try again in an hour.' },
                { status: 429 }
            );
        }

        // Extract raw 10-digit phone number for search
        // DB stores phones in mixed formats (10-digit, +91, 91)
        let rawPhone = normalizedPhone.replace(/^\+91/, '').replace(/^91/, '');

        // Create phone variations to search (different formats in DB)
        const phoneVariations = [
            rawPhone,                           // 9876543210 (most common in DB)
            normalizedPhone,                    // +919876543210
            normalizedPhone.replace('+', ''),   // 919876543210
            '+91' + rawPhone,                   // +919876543210
        ];

        let userName = 'User';
        let userId: string | undefined;
        let otpPurpose: 'login' | 'signup' = mode === 'signup' ? 'signup' : 'login';
        let signupPayload: { firstName: string; lastName: string; email?: string } | undefined;

        if (otpPurpose === 'login') {
            // Find user by phone number (only clients can use OTP login)
            const user = await User.findOne({
                phone: { $in: phoneVariations },
                role: UserRole.CLIENT
            }).select('_id firstName lastName phone email');

            if (!user) {
                return NextResponse.json(
                    { success: false, error: 'No client account found with this phone number. Please sign up first.' },
                    { status: 404 }
                );
            }

            userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User';
            userId = user._id.toString();
        } else {
            // Signup mode: first and last name required
            if (!firstName || !lastName || typeof firstName !== 'string' || typeof lastName !== 'string') {
                return NextResponse.json(
                    { success: false, error: 'First name and last name are required for signup.' },
                    { status: 400 }
                );
            }

            // Email is optional, but must be valid if provided
            const emailValidation = validateOptionalEmail(email);
            if (!emailValidation.isValid) {
                return NextResponse.json(
                    { success: false, error: emailValidation.error || 'Please enter a valid email address.' },
                    { status: 400 }
                );
            }

            // Do not allow duplicate client creation by phone
            const existingClient = await User.findOne({
                phone: { $in: phoneVariations }
            }).select('_id');

            if (existingClient) {
                return NextResponse.json(
                    { success: false, error: 'This phone/WhatsApp number is already registered. Please sign in.' },
                    { status: 409 }
                );
            }

            userName = `${String(firstName).trim()} ${String(lastName).trim()}`.trim();
            signupPayload = {
                firstName: String(firstName).trim(),
                lastName: String(lastName).trim(),
                email: emailValidation.normalized
            };
        }

        // Generate OTP
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + OTP_CONFIG.EXPIRY_MS);

        // Store OTP in database (upsert - update if exists, insert if not)
        await OTPRecord.findOneAndUpdate(
            { phone: normalizedPhone },
            {
                phone: normalizedPhone,
                otp,
                userId,
                userName,
                purpose: otpPurpose,
                signupPayload,
                attempts: 0,
                expiresAt,
                createdAt: new Date()
            },
            { upsert: true, new: true }
        );


        // Send OTP via AISensy WhatsApp API
        const apiKey = process.env.AISENSY_API_KEY;
        const apiUrl = process.env.AISENSY_API_URL || 'https://backend.aisensy.com/campaign/t1/api/v2';

        if (!apiKey) {
            console.error('AISENSY_API_KEY not configured');
            return NextResponse.json(
                { success: false, error: 'OTP service not configured. Please contact support.' },
                { status: 500 }
            );
        }

        // Prepare destination (phone without + for AISensy)
        const destination = normalizedPhone.startsWith('+') ? normalizedPhone.substring(1) : normalizedPhone;

        const aisensyPayload = {
            apiKey,
            campaignName: 'OTP',
            destination,
            userName,
            source: 'organic',
            templateParams: [otp],
            buttons: [
                {
                    type: 'button',
                    sub_type: 'url',
                    index: '0',
                    parameters: [
                        {
                            type: 'text',
                            text: otp
                        }
                    ]
                }
            ]
        };

        try {
            const aisensyResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(aisensyPayload)
            });

            const aisensyData = await aisensyResponse.json();

            if (!aisensyResponse.ok) {
                console.error('AISensy API error:', aisensyData);
                return NextResponse.json(
                    { success: false, error: 'Failed to send OTP. Please try again.' },
                    { status: 500 }
                );
            }

            return NextResponse.json({
                success: true,
                message: 'OTP sent successfully to your WhatsApp',
                phone: normalizedPhone.slice(0, -4) + '****', // Mask last 4 digits
                expiresIn: Math.floor(OTP_CONFIG.EXPIRY_MS / 1000) // seconds
            });

        } catch (sendError) {
            console.error('Error sending OTP via AISensy:', sendError);
            return NextResponse.json(
                { success: false, error: 'Failed to send OTP. Please check your WhatsApp number and try again.' },
                { status: 500 }
            );
        }

    } catch (error) {
        console.error('Error in OTP send:', error);
        return NextResponse.json(
            { success: false, error: 'An error occurred. Please try again.' },
            { status: 500 }
        );
    }
}
