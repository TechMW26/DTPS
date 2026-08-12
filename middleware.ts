import { withAuth } from 'next-auth/middleware';
import { NextResponse, NextRequest } from 'next/server';
import { UserRole } from '@/types';

// App version for cache busting
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || process.env.npm_package_version || '1.0.0';

// Check if maintenance mode is enabled
const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === 'true';

// Public routes that should completely bypass middleware auth
const publicUserRoutes = [
  '/user/forget-password',
  '/user/reset-password',
];

// Routes that should skip onboarding check (onboarding page itself and its API)
const onboardingExemptRoutes = [
  '/user/onboarding',
  '/api/client/onboarding',
  '/api/auth', // Auth routes must be exempt
  '/api/internal/runtime-alert',
];

// Routes exempt from maintenance mode (always accessible)
const maintenanceExemptRoutes = [
  '/maintenance',
  '/api/health',
  '/api/firebase-config',
  '/api/auth',
  '/api/internal/runtime-alert',
  '/api/media/resolve',
  '/api/audio-proxy',
  '/auth',
  '/_next',
  '/favicon.ico',
  '/icons',
  '/images',
];

// Check if the path is a public user route
function isPublicUserRoute(pathname: string): boolean {
  return publicUserRoutes.some(route => pathname.startsWith(route));
}

// Check if the path should skip onboarding redirect
function isOnboardingExemptRoute(pathname: string): boolean {
  return onboardingExemptRoutes.some(route => pathname.startsWith(route));
}

// Check if the path is exempt from maintenance mode
function isMaintenanceExemptRoute(pathname: string): boolean {
  return maintenanceExemptRoutes.some(route => pathname.startsWith(route));
}

// Add app version header to response
function addAppVersionHeader(response: NextResponse): NextResponse {
  response.headers.set('X-App-Version', APP_VERSION);
  return response;
}

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;
    const fullUrl = req.nextUrl.href;

    // ─────────────────────────────────────────────────────────────────────────
    // MAINTENANCE MODE CHECK - runs first for all requests
    // ─────────────────────────────────────────────────────────────────────────
    if (MAINTENANCE_MODE && !isMaintenanceExemptRoute(pathname)) {
      // Allow admin users to bypass maintenance mode
      const userRole = token?.role?.toString().toLowerCase();
      const isAdmin = userRole?.includes('admin');

      if (!isAdmin) {
        // Redirect non-admin users to maintenance page
        return NextResponse.redirect(new URL('/maintenance', req.url));
      }
    }

    // If it's a public user route, just pass through with pathname and URL headers
    if (isPublicUserRoute(pathname)) {
      const response = NextResponse.next();
      response.headers.set('x-pathname', pathname);
      response.headers.set('x-url', fullUrl);
      return addAppVersionHeader(response);
    }

    // If no token and accessing client-facing routes, redirect to /client-auth/signin
    // This prevents NextAuth from sending mobile/client users to the staff /auth/signin page
    if (!token) {
      const isClientRoute = pathname.startsWith('/user') ||
        pathname.startsWith('/dashboard/client') ||
        pathname.startsWith('/client-dashboard') ||
        pathname.startsWith('/my-plan') ||
        pathname.startsWith('/payment');

      if (isClientRoute) {
        const signInUrl = new URL('/client-auth/signin', req.url);
        signInUrl.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(signInUrl);
      }

      const response = NextResponse.next();
      return addAppVersionHeader(response);
    }

    // Normalize role to lowercase for comparison
    const userRole = token?.role?.toLowerCase();

    // Check if user is trying to access a role-specific route
    // Admin routes - allow anyone with admin in their role
    if (pathname.startsWith('/admin') || pathname.startsWith('/dashboard/admin')) {
      if (!userRole || !userRole.includes('admin')) {
        console.log('Admin access denied. Role:', token?.role);
        // Redirect non-admins to their appropriate dashboard

        const redirectPath = userRole === 'dietitian'
          ? '/dashboard/dietitian'
          : userRole === 'health_counselor'
            ? '/dashboard/health-counselor'
            : userRole === 'client'
              ? '/user'
              : '/client-auth/signin';
        return NextResponse.redirect(new URL(redirectPath, req.url));
      }
    }

    // Health Counselor specific routes - only health counselors and admins
    if (pathname.startsWith('/health-counselor') || pathname.startsWith('/dashboard/health-counselor')) {
      if (userRole !== 'health_counselor' && !userRole?.includes('admin')) {
        console.log('Health Counselor access denied. Role:', token?.role);
        const redirectPath = userRole === 'dietitian'
          ? '/dashboard/dietitian'
          : userRole === 'client'
            ? '/user'
            : '/client-auth/signin';
        return NextResponse.redirect(new URL(redirectPath, req.url));
      }
    }

    // Dietitian-only routes - do NOT allow health counselors on dietitian dashboard
    if (pathname.startsWith('/dashboard/dietitian')) {
      if (userRole !== 'dietitian' && !userRole?.includes('admin')) {
        console.log('Dietitian dashboard access denied. Role:', token?.role);
        const redirectPath = userRole === 'health_counselor'
          ? '/dashboard/health-counselor'
          : userRole === 'client'
            ? '/user'
            : '/client-auth/signin';
        return NextResponse.redirect(new URL(redirectPath, req.url));
      }
    }

    // Dietician client routes - allow dietitians, health counselors, and admins
    if (pathname.startsWith('/dietician')) {
      if (userRole !== 'dietitian' &&
        userRole !== 'health_counselor' &&
        !userRole?.includes('admin')) {
        console.log('Dietitian route access denied. Role:', token?.role);
        // Redirect to appropriate dashboard
        const redirectPath = userRole === 'client'
          ? '/user'
          : '/client-auth/signin';
        return NextResponse.redirect(new URL(redirectPath, req.url));
      }
    }

    // Client/User routes - only for clients (NOT for admin or dietitian)
    // Public user routes are already handled above, so we can safely check all /user routes here
    if (pathname.startsWith('/user') || pathname.startsWith('/dashboard/client') || pathname.startsWith('/client-dashboard')) {
      if (userRole !== 'client') {
        console.log('Client access denied. Role:', token?.role);
        // Redirect to appropriate dashboard
        const redirectPath = userRole === 'dietitian'
          ? '/dashboard/dietitian'
          : userRole === 'health_counselor'
            ? '/health-counselor/clients'
            : userRole === 'admin'
              ? '/admin'
              : '/client-auth/signin';
        return NextResponse.redirect(new URL(redirectPath, req.url));
      }

      // CRITICAL: Onboarding redirect logic for clients
      // Check if user has completed onboarding (from JWT token)
      // Skip check for onboarding-exempt routes (onboarding page itself, auth routes)
      if (!isOnboardingExemptRoute(pathname)) {
        const onboardingCompleted = token?.onboardingCompleted;

        // If onboardingCompleted is explicitly false, redirect to onboarding
        // Note: undefined or true means allow access (backward compatibility)
        if (onboardingCompleted === false) {
          console.log('Client onboarding incomplete, redirecting to /user/onboarding');
          return NextResponse.redirect(new URL('/user/onboarding', req.url));
        }
      }
    }

    // If client is on onboarding page but has already completed onboarding, redirect to /user
    if (pathname === '/user/onboarding' || pathname.startsWith('/user/onboarding')) {
      if (userRole === 'client' && token?.onboardingCompleted === true) {
        console.log('Client onboarding already complete, redirecting to /user');
        return NextResponse.redirect(new URL('/user', req.url));
      }
    }

    // Allow access to the route - add pathname header for layout detection
    const response = NextResponse.next();
    response.headers.set('x-pathname', pathname);
    return addAppVersionHeader(response);
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname;

        // Media elements cannot attach NextAuth credentials consistently in
        // native WebViews. These handlers are read-only and enforce their own
        // strict upstream allowlist, so they must remain publicly reachable.
        if (
          pathname.startsWith('/api/media/resolve') ||
          pathname.startsWith('/api/audio-proxy')
        ) {
          const method = req.method?.toUpperCase();
          if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
        }

        // Allow unauthenticated access to payment callbacks/public payment-link endpoints.
        // These are hit by external providers (Razorpay) or on redirect back from payment.
        if (
          pathname.startsWith('/api/payment-links/webhook') ||
          pathname.startsWith('/api/payment-links/verify') ||
          pathname.startsWith('/api/payment-links/public') ||
          pathname.startsWith('/payment/success') ||
          pathname.startsWith('/payment/manual')
        ) {
          return true;
        }

        // Allow public read-only access to blogs endpoints (list + detail).
        // This prevents WebView cookie/session flakiness from hiding blogs UI.
        if (pathname.startsWith('/api/client/blogs')) {
          const method = req.method?.toUpperCase();
          if (method === 'GET' || method === 'HEAD') return true;
        }

        // CRITICAL: Check public user routes FIRST before anything else
        if (isPublicUserRoute(pathname)) {
          return true;
        }

        // Public routes that don't require authentication
        const publicRoutes = [
          '/auth/signin',
          '/auth/signup',
          '/auth/error',
          '/api/health',
          '/api/firebase-config',
          '/api/auth',
          '/api/internal/runtime-alert',
          '/api/user/forget-password',
          '/api/user/reset-password',
          '/client-login',
          '/client-auth/signin',
          '/client-auth/signup',
          '/client-auth/onboarding',
          '/client-auth/forget-password',
          '/client-auth/reset-password',
          '/client-auth/error',
        ];

        // Home page now handles its own redirect (server component)
        if (pathname === '/') {
          return true;
        }

        // Check if the route is public
        const isPublicRoute = publicRoutes.some(route =>
          pathname.startsWith(route)
        );

        if (isPublicRoute) {
          return true;
        }

        // For client-facing routes, return true even without token so the
        // middleware function can redirect to /client-auth/signin instead of
        // NextAuth's default /auth/signin (which is the staff login page).
        const isClientRoute = pathname.startsWith('/user') ||
          pathname.startsWith('/dashboard/client') ||
          pathname.startsWith('/client-dashboard') ||
          pathname.startsWith('/my-plan') ||
          pathname.startsWith('/payment');
        if (isClientRoute && !token) {
          return true;
        }

        // All other routes require authentication
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (NextAuth.js routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - any file with an extension (static assets from /public like /icons/*.png)
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.json|sw.js|firebase-messaging-sw.js|socket\\.io|.*\\..*).*)',
  ],
};
