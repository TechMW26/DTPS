import {nativeResponseJson} from '@/lib/api/native-response';
import { NextRequest, NextResponse } from 'next/server';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeAccountByEmail,setNativeResetToken} from '@/lib/db/repository/native-account';
import { sendEmail, getPasswordResetTemplate } from '@/lib/services/email';
import { getBaseUrl } from '@/lib/config';
import crypto from 'crypto';

// POST /api/user/forget-password - Send password reset email for clients only
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();



    if (typeof email!=='string'||!email.trim()||email.length>320) {
      return nativeResponseJson(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const found=await nativeAccountByEmail(getNativeDatabase(),email);
    const user=found?.role==='client'?found:null;

    // Always return success message to prevent email enumeration
    if (!user) {
      return nativeResponseJson({
        success: true,
        message: 'If an account exists with this email, you will receive a password reset link.'
      });
    }


    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Set token expiry (1 hour from now)
    const tokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

    // Save hashed token and expiry to user
    await setNativeResetToken(getNativeDatabase(),user._id,hashedToken,tokenExpiry);

    // Generate reset link - use client-auth route which doesn't require authentication
    const baseUrl = getBaseUrl();
    const resetLink = `${baseUrl}/client-auth/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;


    // Send password reset email
    const emailTemplate = getPasswordResetTemplate({
      userName: user.firstName || 'User',
      resetLink,
      expiryMinutes: 60
    });

    const emailSent = await sendEmail({
      to: email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
      text: emailTemplate.text
    });

    if (!emailSent) {
    } else {
    }

    // Always return success message for security (don't reveal if account exists)
    return nativeResponseJson({
      success: true,
      message: 'If an account exists with this email, you will receive a password reset link.'
    });

  } catch (error) {
    console.error('Error in user forget password:', error);
    return nativeResponseJson(
      { error: 'An error occurred. Please try again later.' },
      { status: 500 }
    );
  }
}
