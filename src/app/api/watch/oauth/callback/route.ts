// API Route: Watch OAuth Callback - Simplified and Robust
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getBaseUrl } from '@/lib/config';
import connectDB from '@/lib/db/connection';
import WatchConnection from '@/watchconnectivity/backend/models/WatchConnection';
import mongoose from 'mongoose';

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
    
    // Parse state (format: userId:provider)
    const [userId, provider] = state.split(':');
    
    if (!userId || !provider) {
      console.error('Invalid state format:', state);
      return NextResponse.redirect(
        new URL('/user/watch?error=invalid_state', baseUrl)
      );
    }
    
    await connectDB();
    
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
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', tokenResponse.status, errorData);
      return NextResponse.redirect(
        new URL('/user/watch?error=token_exchange_failed', baseUrl)
      );
    }
    
    const tokens = await tokenResponse.json();
    console.log('Tokens received successfully!');
    
    // Save or update watch connection in database
    await WatchConnection.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(userId) },
      {
        userId: new mongoose.Types.ObjectId(userId),
        watchProvider: provider,
        watchIsConnected: true,
        watchAccessToken: tokens.access_token,
        watchRefreshToken: tokens.refresh_token,
        watchTokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
        watchLastSyncTime: new Date(),
        watchSyncPreferences: {
          autoSync: true,
          syncInterval: 60,
          dataTypes: ['steps', 'heartRate', 'sleep', 'calories'],
        },
      },
      { upsert: true, new: true }
    );
    
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
      return NextResponse.json(
        { success: false, error: 'Please login first' },
        { status: 401 }
      );
    }
    
    const { watchProvider } = await req.json();
    
    if (!watchProvider) {
      return NextResponse.json(
        { success: false, error: 'Watch provider is required' },
        { status: 400 }
      );
    }
    
    // Handle Apple Watch - requires iOS app
    if (watchProvider === 'apple_watch') {
      return NextResponse.json({
        success: true,
        message: 'Apple Watch uses HealthKit - please use the iOS app',
        watchOAuthUrl: null,
        watchRequiresApp: true,
      });
    }
    
    // Handle watches that need manual entry or Google Fit sync
    if (['noisefit', 'samsung', 'garmin', 'other'].includes(watchProvider)) {
      return NextResponse.json({
        success: true,
        message: 'This watch uses manual entry. Tip: Sync your watch to Google Fit app, then connect via Google Fit for automatic sync!',
        watchOAuthUrl: null,
        watchRequiresManual: true,
      });
    }
    
    // Only Google Fit supports OAuth
    if (watchProvider !== 'google_fit') {
      return NextResponse.json({
        success: false,
        error: 'Unsupported provider',
      });
    }
    
    // Validate Google credentials
    if (!GOOGLE_FIT_CONFIG.clientId || !GOOGLE_FIT_CONFIG.clientSecret) {
      console.error('Missing Google OAuth credentials in .env');
      return NextResponse.json({
        success: false,
        error: 'Google Fit not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      }, { status: 500 });
    }
    
    // Build OAuth URL using NEXTAUTH_URL for consistency
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const redirectUri = `${baseUrl}/api/watch/oauth/callback`;
    const state = `${session.user.id}:${watchProvider}`;
    
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
    
    return NextResponse.json({
      success: true,
      watchOAuthUrl,
      watchRequiresApp: false,
    });
    
  } catch (error) {
    console.error('Watch OAuth URL generation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate OAuth URL' },
      { status: 500 }
    );
  }
}