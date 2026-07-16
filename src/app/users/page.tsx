import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth/config';
import { UserRole } from '@/types';

export default async function UsersIndexPage() {
  const session = await getServerSession(authOptions);

  // Not logged in → send to sign in
  if (!session?.user) {
    redirect('/auth/signin');
  }

  // Admins were likely expecting the admin Users manager
  if (session.user.role === UserRole.ADMIN) {
    redirect('/admin/users');
  }

  // Non-admins: route them to a sensible place
  if (session.user.role === UserRole.DIETITIAN || session.user.role === UserRole.HEALTH_COUNSELOR) {
    // Dietitians and Health Counselors generally manage clients
    redirect('/clients');
  }
  if (session.user.role === UserRole.CLIENT) {
    // Clients typically use their dashboard
    redirect('/dashboard/client');
  }

  // Fallback
  redirect('/');
}

