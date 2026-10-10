import {nativeResponseJson} from '@/lib/api/native-response';
import { NextRequest, NextResponse } from 'next/server';
import {getNativeDatabase} from '@/lib/db/database';
import {consumeNativeReset,validateNativeReset} from '@/lib/db/repository/native-account';
import {invalidateUserStatusCache} from '@/lib/auth/config';
import crypto from 'crypto';

// POST /api/auth/reset-password - Reset user password with token
export async function POST(request: NextRequest) {
  try {
    const { token, email, password } = await request.json();

    if (typeof token!=='string'||typeof email!=='string'||typeof password!=='string'||!token||!email||!password) {
      return nativeResponseJson(
        { error: 'Token, email, and password are required' },
        { status: 400 }
      );
    }

    // Validate password length
    if (password.length < 4) {
      return nativeResponseJson(
        { error: 'Password must be at least 4 characters long' },
        { status: 400 }
      );
    }


    // Hash the provided token to compare with stored hash
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with valid token
    const user = await consumeNativeReset(getNativeDatabase(),email,hashedToken,password);

    if (!user) {
      return nativeResponseJson(
        { error: 'Invalid or expired password reset link. Please request a new one.' },
        { status: 400 }
      );
    }

    invalidateUserStatusCache(user._id);

    return nativeResponseJson({
      success: true,
      message: 'Password has been reset successfully. You can now login with your new password.',
      role: user.role
    });

  } catch (error) {
    console.error('Error in reset password:', error);
    return nativeResponseJson(
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
      return nativeResponseJson(
        { valid: false, error: 'Token and email are required' },
        { status: 400 }
      );
    }


    // Hash the provided token to compare with stored hash
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with valid token
    const user = await validateNativeReset(getNativeDatabase(),email,hashedToken);

    if (!user) {
      return nativeResponseJson({
        valid: false,
        error: 'Invalid or expired password reset link. Please request a new one.'
      });
    }

    return nativeResponseJson({
      valid: true,
      userName: user.firstName
    });

  } catch (error) {
    console.error('Error validating reset token:', error);
    return nativeResponseJson(
      { valid: false, error: 'An error occurred. Please try again later.' },
      { status: 500 }
    );
  }
}
