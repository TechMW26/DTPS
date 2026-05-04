'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export default function UserError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void; 
}) {
    useEffect(() => {
        // Log error to monitoring service
        console.error('User section error:', error);
    }, [error]);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-4">
            <div className="text-center max-w-md">
                <div className="flex justify-center mb-6">
                    <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                        <AlertCircle className="w-10 h-10 text-red-600 dark:text-red-400" />
                    </div>
                </div>

                <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
                    Something went wrong
                </h1>

                <p className="text-gray-600 dark:text-gray-300 mb-6">
                    We encountered an error while loading this page. Please try again or contact support if the problem persists.
                </p>

                {error.message && (
                    <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800">
                        <p className="text-xs text-red-700 dark:text-red-300 font-mono">
                            {error.message}
                        </p>
                    </div>
                )}


                <div className="flex gap-3 justify-center">
                    <Button
                        onClick={reset}
                        className="bg-[#3AB1A0] hover:bg-[#3AB1A0]/90 text-white"
                    >
                        Try Again
                    </Button>
                    <Link href="/user">
                        <Button variant="outline">
                            Back to Dashboard
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    );
}
