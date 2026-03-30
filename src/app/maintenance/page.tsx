'use client';

import { Loader2 } from 'lucide-react';

export default function MaintenancePage() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 px-4">
            <div className="text-center max-w-md mx-auto">
                {/* Icon */}
                <div className="mb-8">
                    <div className="w-24 h-24 mx-auto bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                        <svg
                            className="w-12 h-12 text-orange-600 dark:text-orange-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                            />
                        </svg>
                    </div>
                </div>

                {/* Main message */}
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                    Server is Currently Down
                </h1>

                <p className="text-gray-600 dark:text-gray-400 mb-8 text-base sm:text-lg">
                    Please wait, it will be working properly in some time.
                </p>

                {/* Loading indicator */}
                <div className="flex items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Checking for updates...</span>
                </div>
            </div>

            {/* Footer branding */}
            <div className="absolute bottom-8 text-center">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                    DTPS - Diet & Therapy Planning System
                </p>
            </div>
        </div>
    );
}
