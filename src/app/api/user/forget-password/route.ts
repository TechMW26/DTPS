import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { sendEmail, getPasswordResetTemplate } from '@/lib/services/email';
import { getBaseUrl } from '@/lib/config';
import crypto from 'crypto';

// POST /api/user/forget-password - Send password reset email for clients only
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();


    
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    await connectDB();

    // Find user by email - only allow clients
    const user = await User.findOne({ 
      email: email.toLowerCase().trim(),
      role: 'client'
    });

    // Always return success message to prevent email enumeration
    if (!user) {
      return NextResponse.json({
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
    user.passwordResetToken = hashedToken;
    user.passwordResetTokenExpiry = tokenExpiry;
    await user.save({ validateBeforeSave: false });


    // Generate reset link - use client-auth route which doesn't require authentication
    const baseUrl = getBaseUrl();
    const resetLink = `${baseUrl}/client-auth/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;


    // Send password reset email
    const emailTemplate = getPasswordResetTemplate({
      userName: user.firstName || 'User',
      resetLink,
      expiryMinutes: 60
    });

    console.log(`[USER_FORGET_PASSWORD] Sending reset email to: ${email}`);
    const emailSent = await sendEmail({
      to: email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
      text: emailTemplate.text
    });

    if (!emailSent) {
      console.error(`[USER_FORGET_PASSWORD] Failed to send password reset email to: ${email}`);
    } else {
      console.log(`[USER_FORGET_PASSWORD] Password reset email sent successfully to: ${email}`);
    }

    // Always return success message for security (don't reveal if account exists)
    return NextResponse.json({
      success: true,
      message: 'If an account exists with this email, you will receive a password reset link.'
    });

  } catch (error) {
    console.error('Error in user forget password:', error);
    return NextResponse.json(
      { error: 'An error occurred. Please try again later.' },
      { status: 500 }
    );
  }
}
