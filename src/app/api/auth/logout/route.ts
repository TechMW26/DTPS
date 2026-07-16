import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getBaseUrl } from '@/lib/config';

// POST /api/auth/logout - Clear all auth cookies and session data
export async function POST() {
  try {
    const cookieStore = await cookies();
    
    // Get all NextAuth related cookie names
    const authCookies = [
      'next-auth.session-token',
      '__Secure-next-auth.session-token',
      'next-auth.csrf-token',
      '__Secure-next-auth.csrf-token',
      'next-auth.callback-url',
      '__Secure-next-auth.callback-url',
      '__Host-next-auth.csrf-token',
      'next-auth.pkce.code_verifier',
      '__Secure-next-auth.pkce.code_verifier',
    ];

    // Delete each auth cookie
    const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
    
    for (const cookieName of authCookies) {
      // Clear cookie with various path combinations
      response.cookies.delete({
        name: cookieName,
        path: '/',
      });
      
      // Also try to delete with domain variations
      response.cookies.set({
        name: cookieName,
        value: '',
        expires: new Date(0),
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
      });
    }

    // Clear any additional app-specific cookies
    const appCookies = ['user-preferences', 'theme', 'locale'];
    for (const cookieName of appCookies) {
      response.cookies.delete({
        name: cookieName,
        path: '/',
      });
    }

    return response;
  } catch (error) {
    console.error('Error during logout:', error);
    return NextResponse.json({ success: false, error: 'Logout failed' }, { status: 500 });
  }
}

// GET /api/auth/logout - Redirect-based logout
export async function GET() {
  const response = NextResponse.redirect(new URL('/auth/signin', getBaseUrl()));
  
  const authCookies = [
    'next-auth.session-token',
    '__Secure-next-auth.session-token',
    'next-auth.csrf-token',
    '__Secure-next-auth.csrf-token',
    'next-auth.callback-url',
    '__Secure-next-auth.callback-url',
  ];

  for (const cookieName of authCookies) {
    response.cookies.set({
      name: cookieName,
      value: '',
      expires: new Date(0),
      path: '/',
    });
  }

  return response;
}
