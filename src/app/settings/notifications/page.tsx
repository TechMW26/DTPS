'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import SendNotificationForm from '@/components/notifications/SendNotificationForm';
import { UserRole } from '@/types';
import { Bell, Loader2 } from 'lucide-react';

// Define allowed roles outside component to prevent recreation
const ALLOWED_ROLES = [UserRole.ADMIN, UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR];

export default function SendNotificationPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    } else if (status === 'authenticated' && session?.user && !ALLOWED_ROLES.includes(session.user.role as UserRole)) {
      router.push('/dashboard');
    }
  }, [status, session?.user?.role, router]);

  if (status === 'loading') {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role as UserRole)) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" />
            Send Notifications
          </h1>
          <p className="text-muted-foreground">
            Send custom push notifications with role-based targeting
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Notification Form */}
          <div>
            <SendNotificationForm />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
