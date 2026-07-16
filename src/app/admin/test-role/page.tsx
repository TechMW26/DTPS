'use client';

import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function TestRolePage() {
  const { data: session, status } = useSession();

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Session Debug Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-600">Status:</p>
              <p className="text-lg font-bold">{status}</p>
            </div>

            {session?.user && (
              <>
                <div>
                  <p className="text-sm font-medium text-gray-600">User Role (Original):</p>
                  <p className="text-lg font-bold text-blue-600">{session.user.role}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-600">User Role (Lowercase):</p>
                  <p className="text-lg font-bold text-green-600">{session.user.role?.toLowerCase()}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-600">User Email:</p>
                  <p className="text-lg">{session.user.email}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-600">User Name:</p>
                  <p className="text-lg">{session.user.name}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-600">Full Session Data:</p>
                  <pre className="mt-2 p-4 bg-gray-100 rounded-lg overflow-auto">
                    {JSON.stringify(session, null, 2)}
                  </pre>
                </div>
              </>
            )}

            <div className="pt-4 space-y-2">
              <Button asChild className="w-full">
                <Link href="/admin/allclients">Go to All Clients Page</Link>
              </Button>
              <Button variant="outline" asChild className="w-full">
                <Link href="/dashboard/admin">Back to Dashboard</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
