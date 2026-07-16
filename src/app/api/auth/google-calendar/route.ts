import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/config';
import { getBaseUrl } from '@/lib/config';
import { google } from 'googleapis';

/**
 * Google Calendar OAuth Flow Handler
 * POST: Generates authorization URL for user to connect calendar
 */

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the base URL - remove trailing slash if present
    let baseUrl = getBaseUrl();
    baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    
    const redirectUri = `${baseUrl}/api/auth/google-calendar/callback`;

    // Initialize OAuth client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    // Generate the authorization URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events'
      ],
      prompt: 'consent' // Force consent screen to get refresh token
    });

    return NextResponse.json({
      success: true,
      authUrl
    });
  } catch (error: any) {
    console.error('Error generating Google Calendar auth URL:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate auth URL' },
      { status: 500 }
    );
  }
}

