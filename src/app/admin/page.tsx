'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export default function AdminPage() {
    const router = useRouter();

    useEffect(() => {
        // Redirect to admin users page (main dashboard)
        router.replace('/admin/users');
    }, [router]);

    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
                <LoadingSpinner className="h-8 w-8 mx-auto mb-4" />
                <p className="text-gray-600">Redirecting to admin dashboard...</p>
            </div>
        </div>
    );
}
