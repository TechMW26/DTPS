import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import crypto from 'crypto';

// POST /api/auth/reset-password - Reset user password with token
export async function POST(request: NextRequest) {
  try {
    const { token, email, password } = await request.json();

    if (!token || !email || !password) {
      return NextResponse.json(
        { error: 'Token, email, and password are required' },
        { status: 400 }
      );
    }

    // Validate password length
    if (password.length < 4) {
      return NextResponse.json(
        { error: 'Password must be at least 4 characters long' },
        { status: 400 }
      );
    }

    await connectDB();

    // Hash the provided token to compare with stored hash
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with valid token
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      passwordResetToken: hashedToken,
      passwordResetTokenExpiry: { $gt: new Date() }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid or expired password reset link. Please request a new one.' },
        { status: 400 }
      );
    }

    // Update password (will be hashed by pre-save hook)
    user.password = password;

    // Clear reset token fields
    user.passwordResetToken = null;
    user.passwordResetTokenExpiry = null;

    await user.save();


    return NextResponse.json({
      success: true,
      message: 'Password has been reset successfully. You can now login with your new password.',
      role: user.role
    });

  } catch (error) {
    console.error('Error in reset password:', error);
    return NextResponse.json(
      { error: 'An error occurred. Please try again later.' },
      { status: 500 }
    );
  }
}

// GET /api/auth/reset-password - Validate reset token
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const email = searchParams.get('email');

    if (!token || !email) {
      return NextResponse.json(
        { valid: false, error: 'Token and email are required' },
        { status: 400 }
      );
    }

    await connectDB();

    // Hash the provided token to compare with stored hash
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with valid token
    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      passwordResetToken: hashedToken,
      passwordResetTokenExpiry: { $gt: new Date() }
    });

    if (!user) {
      return NextResponse.json({
        valid: false,
        error: 'Invalid or expired password reset link. Please request a new one.'
      });
    }

    return NextResponse.json({
      valid: true,
      userName: user.firstName
    });

  } catch (error) {
    console.error('Error validating reset token:', error);
    return NextResponse.json(
      { valid: false, error: 'An error occurred. Please try again later.' },
      { status: 500 }
    );
  }
}
