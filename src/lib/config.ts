// Application configuration
// This file contains configuration constants for the application

// Production URL - used for payment links, callbacks, etc.
export const PRODUCTION_URL = 'https://dtps.tech';

/**
 * Get the base URL for the application
 * In production, always use the production URL
 * In development, use localhost
 */
export function getBaseUrl(): string {
  // On Vercel, use the deployment-specific URL (auto-set by Vercel at build time)
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Check if we're in production with custom domain
  const isProduction = process.env.NODE_ENV === 'production' ||
                       process.env.VERCEL_ENV === 'production' ||
                       process.env.NEXTAUTH_URL?.includes('dtps.tech');

  if (isProduction) {
    return PRODUCTION_URL;
  }

  // In development, use NEXTAUTH_URL or fallback to localhost
  return process.env.NEXTAUTH_URL || 'http://localhost:3000';
}

/**
 * Get URL for payment links - always use production URL
 * Payment links must be accessible publicly
 */
export function getPaymentLinkBaseUrl(): string {
  // Always use production URL for payment links since they need to be publicly accessible
  return PRODUCTION_URL;
}

/**
 * Get URL for payment callbacks
 * Always uses production URL for Razorpay callbacks since
 * these need to be accessible from Razorpay servers
 */
export function getPaymentCallbackUrl(path: string = '/user?payment_success=true'): string {
  // For payment callbacks, always use production URL
  return `${PRODUCTION_URL}${path}`;
}
