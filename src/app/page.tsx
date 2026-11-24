import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/auth/signin');
  }

  // Redirect authenticated users to their role-specific dashboard
  const role = (session.user as any)?.role?.toLowerCase();

  switch (role) {
    case 'admin':
      redirect('/dashboard/admin');
    case 'dietitian':
      redirect('/dashboard/dietitian');
    case 'health_counselor':
      redirect('/health-counselor/clients');
    case 'client':
      redirect('/user');
    default:
      redirect('/auth/signin');
  }
}
