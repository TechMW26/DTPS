import { getServerSession } from 'next-auth';
import { authOptions } from './config';
import { UserRole } from '@/types';
import { NextRequest } from 'next/server';

export async function getSession() {
  return await getServerSession(authOptions);
}

export async function getCurrentUser() {
  const session = await getSession();
  return session?.user;
}

export async function requireAuth() {
  const session = await getSession();
  if (!session?.user) {
    throw new Error('Authentication required');
  }
  return session.user;
}

export async function requireRole(allowedRoles: UserRole[]) {
  const user = await requireAuth();
  if (!allowedRoles.includes(user.role)) {
    throw new Error('Insufficient permissions');
  }
  return user;
}

export async function requireDietitian() {
  return await requireRole([UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR, UserRole.ADMIN]);
}

export async function requireClient() {
  return await requireRole([UserRole.CLIENT]);
}

export async function requireAdmin() {
  return await requireRole([UserRole.ADMIN]);
}

// Utility to check if user can access resource
export function canAccessResource(
  userRole: UserRole,
  resourceOwnerId: string,
  userId: string
): boolean {
  // Admin can access everything
  if (userRole === UserRole.ADMIN) {
    return true;
  }
  
  // Users can access their own resources
  if (resourceOwnerId === userId) {
    return true;
  }
  
  return false;
}

// Utility to check if dietitian can access client data
export function canDietitianAccessClient(
  dietitianId: string,
  clientAssignedDietitianId?: string
): boolean {
  return clientAssignedDietitianId === dietitianId;
}

// API route authentication wrapper
export function withAuth(
  handler: (req: NextRequest, user: any) => Promise<Response>,
  allowedRoles?: UserRole[]
) {
  return async (req: NextRequest) => {
    try {
      const session = await getSession();
      
      if (!session?.user) {
        return new Response(
          JSON.stringify({ error: 'Authentication required' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
      if (allowedRoles && !allowedRoles.includes(session.user.role)) {
        return new Response(
          JSON.stringify({ error: 'Insufficient permissions' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
      return await handler(req, session.user);
    } catch (error) {
      console.error('Auth wrapper error:', error);
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  };
}

// Client-side auth utilities
export function isAuthenticated(session: any): boolean {
  return !!session?.user;
}

export function hasRole(session: any, roles: UserRole[]): boolean {
  return session?.user && roles.includes(session.user.role);
}

export function isDietitian(session: any): boolean {
  return hasRole(session, [UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR, UserRole.ADMIN]);
}

export function isClient(session: any): boolean {
  return hasRole(session, [UserRole.CLIENT]);
}

export function isAdmin(session: any): boolean {
  return hasRole(session, [UserRole.ADMIN]);
}
