'use client';

import WeightTracker from '@/components/weight-tracker/WeightTracker';
import DashboardLayout from '@/components/layout/DashboardLayout';

export default function WeightTrackerPage() {
    return (
        <DashboardLayout>
            <div className="container mx-auto py-6">
                <WeightTracker />
            </div>
        </DashboardLayout>
    );
}
