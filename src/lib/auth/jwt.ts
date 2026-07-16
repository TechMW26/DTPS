import jwt, { SignOptions, Secret } from 'jsonwebtoken';

// Get JWT secret from environment or use a default (change in production!)
const JWT_SECRET: Secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'dtps-jwt-secret-key-change-in-production';
const JWT_EXPIRES_IN = '30d'; // 30 days

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
  iat?: number;
  exp?: number;
}

/**
 * Generate a JWT token for a user
 */
export function generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN,
  };
  return jwt.sign(payload, JWT_SECRET, options);
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    console.error('JWT verification error:', error);
    return null;
  }
}

/**
 * Decode a JWT token without verifying (useful for debugging)
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch (error) {
    return null;
  }
}

/**
 * Check if a token is expired
 */
export function isTokenExpired(token: string): boolean {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return true;
  
  const currentTime = Math.floor(Date.now() / 1000);
  return decoded.exp < currentTime;
}

/**
 * Refresh a token (generate a new one with the same payload)
 */
export function refreshToken(token: string): string | null {
  const decoded = verifyToken(token);
  if (!decoded) return null;
  
  // Remove iat and exp to generate fresh timestamps
  const { iat, exp, ...payload } = decoded;
  return generateToken(payload);
}

/**
 * Extract token from Authorization header
 * Supports: "Bearer <token>" format
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader) return null;
  
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  return authHeader;
}

export default {
  generateToken,
  verifyToken,
  decodeToken,
  isTokenExpired,
  refreshToken,
  extractTokenFromHeader,
};
