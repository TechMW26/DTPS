import { NextResponse } from 'next/server';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// This endpoint provides Firebase configuration for the service worker
// The service worker cannot access process.env directly, so it fetches config from here
export async function GET() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  // Validate that required config is present
  if (!config.apiKey || !config.projectId || !config.messagingSenderId) {
    return NextResponse.json(
      { error: 'Firebase configuration not available' },
      { status: 500 }
    );
  }

  return NextResponse.json(config, {
    headers: {
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
    },
  });
}
