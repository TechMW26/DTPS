import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/config';
import { getBaseUrl } from '@/lib/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { google } from 'googleapis';

/**
 * Google Calendar OAuth Callback Handler
 */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    // Get base URL without trailing slash
    let baseUrl = getBaseUrl();
    baseUrl = baseUrl.replace(/\/$/, '');

    // Handle user denial of permissions
    if (error) {
      return NextResponse.redirect(
        new URL('/settings?calendar=denied', baseUrl)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/settings?calendar=error&message=no-code', baseUrl)
      );
    }

    // Get the stored session to authenticate the user
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.redirect(
        new URL('/auth/signin?error=session-expired', baseUrl)
      );
    }

    const redirectUri = `${baseUrl}/api/auth/google-calendar/callback`;

    // Initialize OAuth client with correct redirect URI
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    // Exchange code for tokens with timeout
    let tokens;
    let tokenTimeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const tokenPromise = oauth2Client.getToken(code);
      const timeoutPromise = new Promise<void>((_, reject) => {
        tokenTimeoutId = setTimeout(() => reject(new Error('Token exchange timeout')), 15000);
      });
      tokens = await Promise.race([tokenPromise, timeoutPromise]) as any;
      if (tokenTimeoutId) clearTimeout(tokenTimeoutId);
    } catch (tokenError: any) {
      if (tokenTimeoutId) clearTimeout(tokenTimeoutId);
      console.error('Error exchanging code for tokens:', tokenError);
      return NextResponse.redirect(
        new URL('/settings?calendar=error&message=token-exchange-failed', baseUrl)
      );
    }

    if (!tokens.tokens.access_token) {
      return NextResponse.redirect(
        new URL('/settings?calendar=error&message=no-token', baseUrl)
      );
    }

    // Save tokens to database with timeout
    try {
      await connectDB();
      const user = await User.findById(session.user.id);

      if (!user) {
        return NextResponse.redirect(
          new URL('/settings?calendar=error&message=user-not-found', baseUrl)
        );
      }

      user.googleCalendarAccessToken = tokens.tokens.access_token;
      user.googleCalendarRefreshToken = tokens.tokens.refresh_token || user.googleCalendarRefreshToken;
      user.googleCalendarTokenExpiry = tokens.tokens.expiry_date ? new Date(tokens.tokens.expiry_date) : undefined;
      await user.save();

      console.log('Google Calendar tokens saved successfully for user:', session.user.id);
    } catch (dbError: any) {
      console.error('Error saving to database:', dbError);
      return NextResponse.redirect(
        new URL('/settings?calendar=error&message=database-error', baseUrl)
      );
    }

    // Redirect to settings with success
    return NextResponse.redirect(
      new URL('/settings?calendar=connected&success=true', baseUrl)
    );
  } catch (error: any) {
    console.error('Error in Google Calendar callback:', error);
    let baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    baseUrl = baseUrl.replace(/\/$/, '');
    return NextResponse.redirect(
      new URL(`/settings?calendar=error&message=${encodeURIComponent(error.message || 'Unknown error')}`, baseUrl)
    );
  }
}
