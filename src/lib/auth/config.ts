import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import {getNativeDatabase} from '@/lib/db/database';
import {nativePasswordLogin,nativeOtpLogin,nativeSessionStatus,recordNativeLogin,saveNativeCalendarCredentials,nativeOnboardingStatus} from '@/lib/db/repository/native-auth';
import { UserRole } from '@/types';
import { getBaseUrl } from '@/lib/config';
import { verify } from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { grantDietPlanAccessIfPublished } from '@/lib/auth/onboarding-access';

/**
 * In-memory cache for user active-status checks in the session callback.
 * Avoids a Firestore read on every getServerSession() call.
 * Cache TTL: 5 minutes — a user deactivated by admin will be locked out within 5 min.
 */
const userStatusCache = new Map<string, {
  status: string;
  logoutOtherSessionsAt?: number;
  keepCurrentSessionId?: string;
  expiresAt: number;
}>();
const USER_STATUS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedUserStatus(userId: string): {
  status: string;
  logoutOtherSessionsAt?: number;
  keepCurrentSessionId?: string;
} | null {
  const entry = userStatusCache.get(userId);
  if (entry && entry.expiresAt > Date.now()) {
    return {
      status: entry.status,
      logoutOtherSessionsAt: entry.logoutOtherSessionsAt,
      keepCurrentSessionId: entry.keepCurrentSessionId,
    };
  }
  // Expired or not found — clean up
  if (entry) userStatusCache.delete(userId);
  return null;
}

function setCachedUserStatus(
  userId: string,
  status: string,
  logoutOtherSessionsAt?: Date | null,
  keepCurrentSessionId?: string | null,
): void {
  // Cap cache size to prevent memory leaks
  if (userStatusCache.size > 5000) {
    // Evict oldest 1000 entries
    const keys = userStatusCache.keys();
    for (let i = 0; i < 1000; i++) {
      const k = keys.next().value;
      if (k) userStatusCache.delete(k);
    }
  }
  userStatusCache.set(userId, {
    status,
    logoutOtherSessionsAt: logoutOtherSessionsAt ? new Date(logoutOtherSessionsAt).getTime() : undefined,
    keepCurrentSessionId: keepCurrentSessionId || undefined,
    expiresAt: Date.now() + USER_STATUS_CACHE_TTL
  });
}

/** Invalidate cached status when a user is deactivated/suspended */
export function invalidateUserStatusCache(userId: string): void {
  userStatusCache.delete(userId);
}

// Browsers cap persistent cookies at roughly 400 days. NextAuth rotates the
// JWT and cookie whenever the session endpoint is read, making this a rolling
// lifetime for clients who continue using the app.
export const PERSISTENT_SESSION_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

function getHeaderValue(requestObj: any, headerName: string): string | undefined {
  if (!requestObj) return undefined;

  const headers = requestObj.headers;
  if (!headers) return undefined;

  // Fetch API Headers interface
  if (typeof headers.get === 'function') {
    const value = headers.get(headerName) || headers.get(headerName.toLowerCase()) || headers.get(headerName.toUpperCase());
    if (value && String(value).trim()) return String(value).trim();
  }

  // Plain object / Node incoming headers
  const direct = headers[headerName] ?? headers[headerName.toLowerCase()] ?? headers[headerName.toUpperCase()];
  if (Array.isArray(direct) && direct.length > 0) {
    const first = String(direct[0]).trim();
    return first || undefined;
  }
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  return undefined;
}

function normalizeIp(ip?: string): string | undefined {
  if (!ip) return undefined;
  let normalized = ip.trim();
  if (!normalized) return undefined;

  // x-forwarded-for can have a list
  if (normalized.includes(',')) {
    normalized = normalized.split(',')[0].trim();
  }

  // Remove IPv6 IPv4-mapped prefix
  if (normalized.startsWith('::ffff:')) {
    normalized = normalized.replace('::ffff:', '');
  }

  if (normalized === '::1') return '127.0.0.1';
  return normalized;
}

function deriveDeviceNameFromUserAgent(userAgent?: string): string {
  if (!userAgent) return 'Unknown Device';

  const ua = userAgent.toLowerCase();

  if (ua.includes('iphone')) return 'iPhone';
  if (ua.includes('ipad')) return 'iPad';

  if (ua.includes('android')) {
    const modelMatch = userAgent.match(/Android\s[\d.]+;\s*([^;\)]+?)\s+Build/i);
    if (modelMatch?.[1]) {
      return modelMatch[1].trim();
    }
    return 'Android Device';
  }

  if (ua.includes('macintosh') || ua.includes('mac os')) return 'Mac';
  if (ua.includes('windows')) return 'Windows PC';
  if (ua.includes('linux')) return 'Linux Device';

  return 'Unknown Device';
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        loginContext: { label: 'Login Context', type: 'text' },
        otpToken: { label: 'OTP Token', type: 'text' }
      },
      async authorize(credentials, req) {
        const loginSessionId = randomUUID();
        const loginSessionStartedAt = Date.now();

        const extractIpAddress = (requestObj: any): string | undefined => {
          const forwardedFor = getHeaderValue(requestObj, 'x-forwarded-for');
          const realIp = getHeaderValue(requestObj, 'x-real-ip');
          const cfIp = getHeaderValue(requestObj, 'cf-connecting-ip');
          const trueClientIp = getHeaderValue(requestObj, 'true-client-ip');
          const xClientIp = getHeaderValue(requestObj, 'x-client-ip');

          const candidate =
            normalizeIp(forwardedFor) ||
            normalizeIp(realIp) ||
            normalizeIp(cfIp) ||
            normalizeIp(trueClientIp) ||
            normalizeIp(xClientIp) ||
            normalizeIp(requestObj?.ip) ||
            normalizeIp(requestObj?.socket?.remoteAddress) ||
            normalizeIp(requestObj?.connection?.remoteAddress);

          if (candidate) return candidate;

          // Local development fallback
          const host = getHeaderValue(requestObj, 'host');
          if (host?.includes('localhost') || host?.includes('127.0.0.1')) {
            return '127.0.0.1';
          }

          return undefined;
        };

        const extractUserAgent = (requestObj: any): string | undefined => {
          const ua = getHeaderValue(requestObj, 'user-agent');
          if (ua) return ua;

          // Some clients may not send user-agent but provide UA hints.
          const platformHint = getHeaderValue(requestObj, 'sec-ch-ua-platform');
          if (platformHint) return `Unknown Browser on ${platformHint.replace(/"/g, '')}`;

          return undefined;
        };

        const loginIp = extractIpAddress(req);
        const loginUserAgent = extractUserAgent(req);
        const loginDeviceName = deriveDeviceNameFromUserAgent(loginUserAgent);
        const loginContext = (credentials as any)?.loginContext as 'staff' | 'client' | undefined;
        const otpToken = (credentials as any)?.otpToken as string | undefined;

        const db=getNativeDatabase();
        let user;
        if(otpToken) {
          const secret=process.env.NEXTAUTH_SECRET;
          if(!secret)throw new Error('Server configuration error');
          try {
            const decoded=verify(otpToken,secret) as {userId?:string};
            if(!decoded.userId)throw new Error('Missing account');
            user=await nativeOtpLogin(db,decoded.userId,loginContext);
          }catch {throw new Error('Invalid or expired OTP session');}
        } else {
          if(!credentials?.email||!credentials?.password)throw new Error('Email and password are required');
          user=await nativePasswordLogin(db,credentials.email,credentials.password,loginContext);
        }
        if(!user)throw new Error('Wrong email or password');
        try {
          await recordNativeLogin(db,{
            userId:user._id,userRole:user.role,userName:user.fullName,userEmail:user.email,
            action:'Logged In',actionType:'login',category:'auth',description:`${user.fullName||'User'} logged in`,
            ipAddress:loginIp,userAgent:loginUserAgent,details:{deviceName:loginDeviceName,sessionId:loginSessionId},
          });
        }catch {console.error('Failed to record login activity');}
        return {
          id:user._id,email:user.email||'',name:user.fullName,role:user.role,
          firstName:user.firstName,lastName:user.lastName,avatar:user.avatar,emailVerified:!!user.emailVerified,
          onboardingCompleted:user.onboardingCompleted,sessionId:loginSessionId,sessionStartedAt:loginSessionStartedAt,
          ...(user.isWooCommerceClient?{isWooCommerceClient:true,phone:user.phone,city:user.city,country:user.country,totalOrders:user.totalOrders,totalSpent:user.totalSpent}:{}),
        };
      }
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/calendar'
        }
      }
    })
  ],
  session: {
    strategy: 'jwt',
    maxAge: PERSISTENT_SESSION_MAX_AGE_SECONDS,
  },
  jwt: {
    maxAge: PERSISTENT_SESSION_MAX_AGE_SECONDS,
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.session-token'
        : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: PERSISTENT_SESSION_MAX_AGE_SECONDS,
      },
    },
    callbackUrl: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.callback-url'
        : 'next-auth.callback-url',
      options: {
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    csrfToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Host-next-auth.csrf-token'
        : 'next-auth.csrf-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  callbacks: {
    async jwt({ token, user, account, trigger, session }) {
      // Initial sign in
      if (user) {
        token.role = user.role;
        token.firstName = user.firstName;
        token.lastName = user.lastName;
        token.avatar = user.avatar;
        token.emailVerified = !!user.emailVerified;
        token.sessionId = (user as any).sessionId || token.sessionId || randomUUID();
        token.sessionStartedAt = (user as any).sessionStartedAt || Date.now();

        // For client users, fetch onboardingCompleted from database on initial sign in
        if (user.role === UserRole.CLIENT && !user.isWooCommerceClient) {
          try {
            const completed=await nativeOnboardingStatus(getNativeDatabase(),user.id);
            const hasAccessiblePlan = completed
              ? false
              : await grantDietPlanAccessIfPublished(user.id);
            token.onboardingCompleted = Boolean(
              completed || hasAccessiblePlan
            );
          } catch (error) {
            console.error('Error fetching onboarding status:', error);
            token.onboardingCompleted = false;
          }
        } else if (user.isWooCommerceClient) {
          // WooCommerce clients don't need onboarding
          token.onboardingCompleted = true;
        }

        // Store WooCommerce client specific data
        if (user.isWooCommerceClient) {
          token.isWooCommerceClient = true;
          token.phone = user.phone;
          token.city = user.city;
          token.country = user.country;
          token.totalOrders = user.totalOrders;
          token.totalSpent = user.totalSpent;
        }
      }

      // Handle Google account linking to store calendar tokens
      if (account && account.provider === 'google') {
        token.googleAccessToken = account.access_token;
        token.googleRefreshToken = account.refresh_token;
        token.googleTokenExpiry = account.expires_at ? new Date(account.expires_at * 1000) : undefined;

        // Store tokens in database for later use
        try {
          if(token.sub)await saveNativeCalendarCredentials(getNativeDatabase(),token.sub,account);
        } catch (error) {
          console.error('Error storing Google Calendar tokens:', error);
        }
      }

      // Handle session update - allows refreshing onboardingCompleted after onboarding completion
      if (trigger === 'update' && session) {
        // Session updates are untrusted client input. Refresh permitted fields from storage.
        if(token.sub && token.role===UserRole.CLIENT && !token.isWooCommerceClient) {
          token.onboardingCompleted=await nativeOnboardingStatus(getNativeDatabase(),token.sub);
        }
      }

      return token;
    },
    async session({ session, token }) {
      // Ensure session and session.user exist before modification
      if (!session) {
        return { user: {}, expires: new Date(0).toISOString() } as any;
      }
      if (!session.user) {
        session.user = {} as any;
      }

      if (token) {
        // Ensure user.id is set from either sub or from the token directly
        session.user.id = token.sub || (token as any).id || '';
        session.user.role = token.role as UserRole;
        session.user.firstName = token.firstName as string;
        session.user.lastName = token.lastName as string;
        session.user.avatar = token.avatar as string;
        session.user.emailVerified = token.emailVerified as boolean;
        session.user.sessionId = token.sessionId as string;
        session.user.sessionStartedAt = token.sessionStartedAt as number;

        // Include onboardingCompleted for client users
        session.user.onboardingCompleted = token.onboardingCompleted as boolean ?? true;

        // Include WooCommerce client specific data
        if (token.isWooCommerceClient) {
          session.user.isWooCommerceClient = true;
          session.user.phone = token.phone as string;
          session.user.city = token.city as string;
          session.user.country = token.country as string;
          session.user.totalOrders = token.totalOrders as number;
          session.user.totalSpent = token.totalSpent as number;
        }

        // Check if user is still active — uses in-memory cache to avoid DB hit on every request
        const userId = token.sub;
        if (userId) {
          const cachedStatus = getCachedUserStatus(userId);
          if (cachedStatus !== null) {
            // Cache hit — check status without DB call
            if (cachedStatus.status !== 'active') {
              // Return empty session to trigger logout instead of null
              return { user: {}, expires: new Date(0).toISOString() } as any;
            }

            const shouldLogoutThisSession = Boolean(
              cachedStatus.logoutOtherSessionsAt &&
              token.sessionId !== cachedStatus.keepCurrentSessionId &&
              (
                !token.sessionStartedAt ||
                Number(token.sessionStartedAt) <= Number(cachedStatus.logoutOtherSessionsAt)
              )
            );

            if (shouldLogoutThisSession) {
              return { user: {}, expires: new Date(0).toISOString() } as any;
            }
          } else {
            // Missing or unreadable accounts must not be cached as active.
            try {
              const user=await nativeSessionStatus(getNativeDatabase(),userId,!!token.isWooCommerceClient);
              if(!user || user.status!=='active') {
                setCachedUserStatus(userId,user?.status||'inactive');
                return {user:{},expires:new Date(0).toISOString()} as any;
              }
              setCachedUserStatus(userId,user.status,user.logoutOtherSessionsAt,user.keepCurrentSessionId);
              if(user.logoutOtherSessionsAt && token.sessionId!==user.keepCurrentSessionId &&
                (!token.sessionStartedAt || Number(token.sessionStartedAt)<=user.logoutOtherSessionsAt.getTime())) {
                return {user:{},expires:new Date(0).toISOString()} as any;
              }
            }catch {
              return {user:{},expires:new Date(0).toISOString()} as any;
            }
          }
        }
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Prefer NextAuth-provided baseUrl (request origin aware).
      // Fallback to app config only when baseUrl is missing.
      const safeBaseUrl = baseUrl || getBaseUrl();

      // Allows relative callback URLs
      if (url.startsWith('/')) return `${safeBaseUrl}${url}`;
      // Allows callback URLs on the same origin
      else if (new URL(url).origin === safeBaseUrl) return url;
      return safeBaseUrl;
    }
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  events: {
    async signIn({ user, isNewUser }) {
      if (isNewUser) {
      }
    },
    async signOut({ token }) {
    }
  },
  debug: process.env.NODE_ENV === 'development' && process.env.NEXT_DEBUG_AUTH === 'true',
};
