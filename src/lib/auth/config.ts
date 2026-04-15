import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import WooCommerceClient from '@/lib/db/models/WooCommerceClient';
import { UserRole } from '@/types';
import { getBaseUrl } from '@/lib/config';
import { verify } from 'jsonwebtoken';

/**
 * In-memory cache for user active-status checks in the session callback.
 * Avoids hitting MongoDB on EVERY getServerSession() call.
 * Cache TTL: 5 minutes — a user deactivated by admin will be locked out within 5 min.
 */
const userStatusCache = new Map<string, { status: string; expiresAt: number }>();
const USER_STATUS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedUserStatus(userId: string): string | null {
  const entry = userStatusCache.get(userId);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.status;
  }
  // Expired or not found — clean up
  if (entry) userStatusCache.delete(userId);
  return null;
}

function setCachedUserStatus(userId: string, status: string): void {
  // Cap cache size to prevent memory leaks
  if (userStatusCache.size > 5000) {
    // Evict oldest 1000 entries
    const keys = userStatusCache.keys();
    for (let i = 0; i < 1000; i++) {
      const k = keys.next().value;
      if (k) userStatusCache.delete(k);
    }
  }
  userStatusCache.set(userId, { status, expiresAt: Date.now() + USER_STATUS_CACHE_TTL });
}

/** Invalidate cached status when a user is deactivated/suspended */
export function invalidateUserStatusCache(userId: string): void {
  userStatusCache.delete(userId);
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
      async authorize(credentials) {
        const loginContext = (credentials as any)?.loginContext as 'staff' | 'client' | undefined;
        const otpToken = (credentials as any)?.otpToken as string | undefined;

        // OTP Token Login (WhatsApp OTP)
        if (otpToken) {
          try {
            const jwtSecret = process.env.NEXTAUTH_SECRET;
            if (!jwtSecret) {
              throw new Error('Server configuration error');
            }

            // Verify the OTP token
            const decoded = verify(otpToken, jwtSecret) as {
              userId: string;
              email: string;
              name: string;
              role: string;
              onboardingCompleted?: boolean;
            };

            if (!decoded.userId) {
              throw new Error('Invalid token: missing userId');
            }

            await connectDB();

            // Fetch fresh user data using userId from token
            const user = await User.findById(decoded.userId).select(
              'firstName lastName email role status avatar emailVerified onboardingCompleted'
            );

            if (!user) {
              throw new Error('User not found');
            }

            if (user.status !== 'active') {
              throw new Error('Your account is not active. Please contact support.');
            }

            // Verify the email matches if both are present (extra safety check)
            const tokenEmail = decoded.email?.toLowerCase();
            const credEmail = credentials?.email?.toLowerCase();
            if (tokenEmail && credEmail && tokenEmail !== credEmail) {
              console.warn('OTP auth: email mismatch, token:', tokenEmail, 'cred:', credEmail);
              // Don't reject — the userId from the signed token is authoritative
            }

            // Update lastLoginAt
            await User.findByIdAndUpdate(user._id, { lastLoginAt: new Date() });

            // Use user's real email from DB, or token email — never generate a fake email
            const userEmail = user.email || decoded.email || '';

            return {
              id: user._id.toString(),
              email: userEmail,
              name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
              role: user.role,
              firstName: user.firstName,
              lastName: user.lastName,
              avatar: user.avatar,
              emailVerified: user.emailVerified || true,
              onboardingCompleted: user.onboardingCompleted
            };
          } catch (error) {
            console.error('OTP token auth error:', error);
            throw new Error('Invalid or expired OTP session');
          }
        }

        // Standard Email/Password Login
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        try {
          await connectDB();

          // First, try to find user in main User collection
          const user = await User.findOne({
            email: credentials.email.toLowerCase()
          }).select('+password');

          if (user) {
            // Block clients from using the staff auth pages, and block staff from using the client auth pages.
            if (loginContext === 'staff' && user.role === UserRole.CLIENT) {
              throw new Error('Wrong email or password');
            }
            if (loginContext === 'client' && user.role !== UserRole.CLIENT) {
              throw new Error('Wrong email or password');
            }

            const isPasswordValid = await user.comparePassword(credentials.password);

            if (!isPasswordValid) {
              throw new Error('Wrong email or password');
            }

            // Check account status and provide specific error messages
            if (user.status === 'inactive') {
              throw new Error('Your account has been deactivated. Please contact admin.');
            }

            if (user.status === 'suspended') {
              throw new Error('Your account has been suspended. Please contact admin for assistance.');
            }

            if (user.status !== 'active') {
              throw new Error('Account is not active. Please contact support.');
            }

            // Update lastLoginAt
            await User.findByIdAndUpdate(user._id, { lastLoginAt: new Date() });

            return {
              id: user._id.toString(),
              email: user.email,
              name: user.fullName,
              role: user.role,
              firstName: user.firstName,
              lastName: user.lastName,
              avatar: user.avatar,
              emailVerified: user.emailVerified
            };
          }

          // If not found in User collection, check WooCommerceClient collection
          const wooClient = await WooCommerceClient.findOne({
            email: credentials.email.toLowerCase()
          });

          if (wooClient) {
            // WooCommerce clients are always clients.
            if (loginContext === 'staff') {
              throw new Error('Wrong email or password');
            }

            // For WooCommerce clients, use plain text password comparison
            if (wooClient.password !== credentials.password) {
              throw new Error('Wrong email or password');
            }

            return {
              id: wooClient._id.toString(),
              email: wooClient.email,
              name: wooClient.name,
              role: UserRole.CLIENT,
              firstName: wooClient.name.split(' ')[0] || wooClient.name,
              lastName: wooClient.name.split(' ').slice(1).join(' ') || '',
              avatar: undefined,
              emailVerified: true,
              isWooCommerceClient: true,
              phone: wooClient.phone,
              city: wooClient.city,
              country: wooClient.country,
              totalOrders: wooClient.totalOrders,
              totalSpent: wooClient.totalSpent
            };
          }

          throw new Error('Wrong email or password');
        } catch (error) {
          console.error('Auth error:', error);
          throw error;
        }
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
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
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
        // IMPORTANT: Set maxAge to make cookie persistent (not session cookie)
        maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
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

        // For client users, fetch onboardingCompleted from database on initial sign in
        if (user.role === UserRole.CLIENT && !user.isWooCommerceClient) {
          try {
            await connectDB();
            const dbUser = await User.findById(user.id).select('onboardingCompleted');
            token.onboardingCompleted = dbUser?.onboardingCompleted ?? false;
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
          await connectDB();
          const dbUser = await User.findById(token.sub);
          if (dbUser) {
            dbUser.googleCalendarAccessToken = account.access_token;
            dbUser.googleCalendarRefreshToken = account.refresh_token;
            dbUser.googleCalendarTokenExpiry = account.expires_at ? new Date(account.expires_at * 1000) : undefined;
            await dbUser.save();
          }
        } catch (error) {
          console.error('Error storing Google Calendar tokens:', error);
        }
      }

      // Handle session update - allows refreshing onboardingCompleted after onboarding completion
      if (trigger === 'update' && session) {
        // If onboardingCompleted is explicitly set in the update, use it
        if (typeof session.onboardingCompleted === 'boolean') {
          token.onboardingCompleted = session.onboardingCompleted;
        }
        // Merge other session updates
        token = { ...token, ...session };
      }

      return token;
    },
    async session({ session, token }) {
      if (token) {
        // Ensure user.id is set from either sub or from the token directly
        session.user.id = token.sub || (token as any).id || '';
        session.user.role = token.role as UserRole;
        session.user.firstName = token.firstName as string;
        session.user.lastName = token.lastName as string;
        session.user.avatar = token.avatar as string;
        session.user.emailVerified = token.emailVerified as boolean;

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
            if (cachedStatus !== 'active') {
              return null as any;
            }
          } else {
            // Cache miss — check DB ONLY if connection already exists
            // This avoids blocking session callbacks on cold DB connections
            try {
              // Use much shorter timeout (1.5s) and fail gracefully
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('User status check timeout')), 1500)
              );

              // Only attempt DB check if mongoose is already connected (readyState === 1)
              const mongoose = await import('mongoose');
              if (mongoose.default.connection.readyState === 1) {
                const userStatusPromise = User.findById(userId).select('status').lean();
                const userDoc = await Promise.race([userStatusPromise, timeoutPromise]) as any;
                const user = userDoc as { status?: string } | null;
                if (user) {
                  setCachedUserStatus(userId, user.status || 'active');
                  if (user.status !== 'active') {
                    return null as any;
                  }
                }
              } else {
                // DB not connected - assume active and cache it
                setCachedUserStatus(userId, 'active');
              }
            } catch (error) {
              // Silently cache 'active' on any error to prevent repeated attempts
              setCachedUserStatus(userId, 'active');
            }
          }
        }
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Use getBaseUrl() instead of baseUrl from environment
      const safeBaseUrl = getBaseUrl();

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
