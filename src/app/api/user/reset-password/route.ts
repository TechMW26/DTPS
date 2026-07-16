import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import crypto from 'crypto';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/user/reset-password - Validate reset token for clients
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const email = searchParams.get('email');


    if (!token || !email) {
      return NextResponse.json(
        { valid: false, error: 'Invalid reset link. Missing token or email.' },
        { status: 400 }
      );
    }

    await connectDB();

    // Hash the token to compare with stored hash
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with matching email, token, and unexpired token - only clients
    const user = await withCache(
      `user:reset-password:${JSON.stringify({
        email: email.toLowerCase().trim(),
        role: 'client',
        passwordResetToken: hashedToken,
        passwordResetTokenExpiry: { $gt: new Date() }
      })}`,
      async () => await User.findOne({
        email: email.toLowerCase().trim(),
        role: 'client',
        passwordResetToken: hashedToken,
        passwordResetTokenExpiry: { $gt: new Date() }
      }),
      { ttl: 120000, tags: ['user'] }
    );

    if (!user) {
      return NextResponse.json(
        { valid: false, error: 'This password reset link is invalid or has expired.' },
        { status: 400 }
      );
    }


    return NextResponse.json({
      valid: true,
      userName: user.firstName || 'User'
    });

  } catch (error) {
    console.error('Error validating user reset token:', error);
    return NextResponse.json(
      { valid: false, error: 'An error occurred while validating the reset link.' },
      { status: 500 }
    );
  }
}

// POST /api/user/reset-password - Reset password for clients
export async function POST(request: NextRequest) {
  try {
    const { token, email, password } = await request.json();


    if (!token || !email || !password) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (password.length < 4) {
      return NextResponse.json(
        { error: 'Password must be at least 4 characters long' },
        { status: 400 }
      );
    }

    await connectDB();

    // Hash the token to compare with stored hash
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with matching email, token, and unexpired token - only clients
    const user = await withCache(
      `user:reset-password:${JSON.stringify({
        email: email.toLowerCase().trim(),
        role: 'client',
        passwordResetToken: hashedToken,
        passwordResetTokenExpiry: { $gt: new Date() }
      })}`,
      async () => await User.findOne({
        email: email.toLowerCase().trim(),
        role: 'client',
        passwordResetToken: hashedToken,
        passwordResetTokenExpiry: { $gt: new Date() }
      }),
      { ttl: 120000, tags: ['user'] }
    );

    if (!user) {
      return NextResponse.json(
        { error: 'This password reset link is invalid or has expired.' },
        { status: 400 }
      );
    }

    // Set plain password - the pre-save hook will hash it
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetTokenExpiry = undefined;
    await user.save();


    return NextResponse.json({
      success: true,
      message: 'Password has been reset successfully'
    });

  } catch (error) {
    console.error('Error resetting user password:', error);
    return NextResponse.json(
      { error: 'An error occurred while resetting your password. Please try again.' },
      { status: 500 }
    );
  }
}
