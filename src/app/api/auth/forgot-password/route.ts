import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { sendEmail, getPasswordResetTemplate } from '@/lib/services/email';
import { getBaseUrl } from '@/lib/config';
import crypto from 'crypto';

// POST /api/auth/forgot-password - Send password reset email
export async function POST(request: NextRequest) {
  try {
    const { email, roleType } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    await connectDB();

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always return success message to prevent email enumeration
    if (!user) {
      return NextResponse.json({
        success: true,
        message: 'If an account exists with this email, you will receive a password reset link.'
      });
    }

    // If roleType is specified, validate that the user has the correct role
    // This is used to show appropriate error on user/client page for non-client emails
    if (roleType === 'client' && user.role !== 'client') {
      return NextResponse.json(
        { error: 'This email is not registered as a client. Please use the admin/staff portal to reset your password.' },
        { status: 400 }
      );
    }
    
    if (roleType === 'staff' && user.role === 'client') {
      return NextResponse.json(
        { error: 'This email is registered as a client. Please use the client login page to reset your password.' },
        { status: 400 }
      );
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

    // Determine the base URL for the reset link based on user role
    const baseUrl = getBaseUrl();
    
    // Route to appropriate reset page based on user role
    let resetPath = '/auth/reset-password'; // Default for admin/dietitian/health_counselor
    if (user.role === 'client') {
      resetPath = '/user/reset-password';
    }
    
    const resetLink = `${baseUrl}${resetPath}?token=${resetToken}&email=${encodeURIComponent(email)}`;

    // Send password reset email
    const emailTemplate = getPasswordResetTemplate({
      userName: user.firstName || 'User',
      resetLink,
      expiryMinutes: 60
    });

    console.log(`[FORGOT-PASSWORD] Sending reset email to: ${email} (role: ${user.role})`);
    const emailSent = await sendEmail({
      to: email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
      text: emailTemplate.text
    });

    if (!emailSent) {
      console.error(`[FORGOT-PASSWORD] Failed to send password reset email to: ${email} (role: ${user.role})`);
      return NextResponse.json({
        error: 'Failed to send password reset email',
        hint: 'Check SMTP configuration in .env (SMTP_HOST, SMTP_USER, SMTP_PASS)',
        debug: {
          smtpConfigured: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
          recipient: email
        }
      }, { status: 500 });
    }

    console.log(`[FORGOT-PASSWORD] Password reset email sent successfully to: ${email} (role: ${user.role})`);

    return NextResponse.json({
      success: true,
      message: 'If an account exists with this email, you will receive a password reset link.'
    });

  } catch (error) {
    console.error('Error in forgot password:', error);
    return NextResponse.json(
      { error: 'An error occurred. Please try again later.' },
      { status: 500 }
    );
  }
}
