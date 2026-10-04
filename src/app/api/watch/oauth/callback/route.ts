import {nativeResponseJson} from '@/lib/api/native-response';
// API Route: Watch OAuth Callback - Simplified and Robust
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getBaseUrl } from '@/lib/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeWatchConnection,saveNativeWatchOAuthState,consumeNativeWatchOAuthState} from '@/lib/db/repository/native-admin-watch';
import {randomBytes,createHash} from 'node:crypto';

// Google Fit OAuth Configuration - prefer watch-specific env vars
const GOOGLE_FIT_CONFIG = {
  clientId: (
    process.env.GOOGLE_CLIENT_IDwatch ||
    process.env.GOOGLE_CLIENT_IDWATCH ||
    process.env.GOOGLE_CLIENT_ID_WATCH ||
    process.env.GOOGLE_FIT_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    ''
  ),
  clientSecret: (
    process.env.GOOGLE_CLIENT_SECRETwatch ||
    process.env.GOOGLE_CLIENT_SECRETWATCH ||
    process.env.GOOGLE_CLIENT_SECRET_WATCH ||
    process.env.GOOGLE_FIT_CLIENT_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    ''
  ),
  scopes: [
    'https://www.googleapis.com/auth/fitness.activity.read',
    'https://www.googleapis.com/auth/fitness.heart_rate.read',
    'https://www.googleapis.com/auth/fitness.sleep.read',
    'https://www.googleapis.com/auth/fitness.body.read',
  ],
};

/**
 * GET /api/watch/oauth/callback
 * Handles the OAuth callback from Google after user grants permission
 */
export async function GET(req: NextRequest) {
  const baseUrl = getBaseUrl();

  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle OAuth errors
    if (error) {
      console.error('OAuth error from Google:', error);
      return NextResponse.redirect(
        new URL(`/user/watch?error=${encodeURIComponent(error)}`, baseUrl)
      );
    }

    // Validate required parameters
    if (!code || !state) {
      console.error('Missing code or state in callback');
      return NextResponse.redirect(
        new URL('/user/watch?error=missing_params', baseUrl)
      );
    }

    const session=await getServerSession(authOptions);if(!session?.user?.id||!/^([a-f0-9]{64})$/i.test(state))return NextResponse.redirect(new URL('/user/watch?error=invalid_state',baseUrl));
    const userId=session.user.id,provider=await consumeNativeWatchOAuthState(getNativeDatabase(),userId,createHash('sha256').update(state).digest('hex'));

    // Exchange authorization code for tokens
    // Use NEXTAUTH_URL for consistent redirect URI
    const redirectUri = `${baseUrl}/api/watch/oauth/callback`;

    console.log('=== Watch OAuth Callback ===');
    console.log('User ID:', userId);
    console.log('Provider:', provider);
    console.log('Redirect URI:', redirectUri);

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_FIT_CONFIG.clientId,
        client_secret: GOOGLE_FIT_CONFIG.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', tokenResponse.status);
      return NextResponse.redirect(
        new URL('/user/watch?error=token_exchange_failed', baseUrl)
      );
    }

    const tokens = await tokenResponse.json();
    console.log('Tokens received successfully!');

    // Save or update watch connection in database
    await nativeWatchConnection(getNativeDatabase(),userId,{watchProvider:provider,watchIsConnected:true,watchAccessToken:tokens.access_token,...(tokens.refresh_token?{watchRefreshToken:tokens.refresh_token}:{}),watchTokenExpiry:new Date(Date.now()+Number(tokens.expires_in||3600)*1000),watchLastSync:new Date()});

    console.log('Watch connection saved for user:', userId);

    return NextResponse.redirect(
      new URL('/user/watch?success=connected', baseUrl)
    );

  } catch (error) {
    console.error('Watch OAuth callback error:', error);
    return NextResponse.redirect(
      new URL('/user/watch?error=callback_failed', baseUrl)
    );
  }
}

/**
 * POST /api/watch/oauth/callback
 * Generate OAuth URL for Google Fit connection
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return nativeResponseJson(
        { success: false, error: 'Please login first' },
        { status: 401 }
      );
    }

    const { watchProvider } = await req.json();

    if (!watchProvider) {
      return nativeResponseJson(
        { success: false, error: 'Watch provider is required' },
        { status: 400 }
      );
    }

    // Handle Apple Watch - requires iOS app
    if (watchProvider === 'apple_watch') {
      return nativeResponseJson({
        success: true,
        message: 'Apple Watch uses HealthKit - please use the iOS app',
        watchOAuthUrl: null,
        watchRequiresApp: true,
      });
    }

    // Handle watches that need manual entry or Google Fit sync
    if (['noisefit', 'samsung', 'garmin', 'other'].includes(watchProvider)) {
      return nativeResponseJson({
        success: true,
        message: 'This watch uses manual entry. Tip: Sync your watch to Google Fit app, then connect via Google Fit for automatic sync!',
        watchOAuthUrl: null,
        watchRequiresManual: true,
      });
    }

    // Only Google Fit supports OAuth
    if (watchProvider !== 'google_fit') {
      return nativeResponseJson({
        success: false,
        error: 'Unsupported provider',
      });
    }

    // Validate Google credentials
    if (!GOOGLE_FIT_CONFIG.clientId || !GOOGLE_FIT_CONFIG.clientSecret) {
      console.error('Missing Google OAuth credentials in .env');
      return nativeResponseJson({
        success: false,
        error: 'Google Fit not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      }, { status: 500 });
    }

    // Build OAuth URL using NEXTAUTH_URL for consistency
    const baseUrl = getBaseUrl();
    const redirectUri = `${baseUrl}/api/watch/oauth/callback`;
    const state=randomBytes(32).toString('hex');
    await saveNativeWatchOAuthState(getNativeDatabase(),session.user.id,createHash('sha256').update(state).digest('hex'));

    const params = new URLSearchParams({
      client_id: GOOGLE_FIT_CONFIG.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_FIT_CONFIG.scopes.join(' '),
      state: state,
      access_type: 'offline',
      prompt: 'consent',
    });

    const watchOAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    console.log('=== Watch OAuth URL Generated ===');
    console.log('User ID:', session.user.id);
    console.log('Redirect URI:', redirectUri);

    return nativeResponseJson({
      success: true,
      watchOAuthUrl,
      watchRequiresApp: false,
    });

  } catch (error) {
    console.error('Watch OAuth URL generation error:', error);
    return nativeResponseJson(
      { success: false, error: 'Failed to generate OAuth URL' },
      { status: 500 }
    );
  }
}