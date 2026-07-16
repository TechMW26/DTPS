"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface TopDietitian {
  id: string;
  name: string;
  email: string;
  clients: number;
  rating: number;
  revenue: number;
  completedAppointments?: number;
  totalAppointments?: number;
  completionRate?: number;
}

export default function AllDietitiansListPage() {
  const [dietitians, setDietitians] = useState<TopDietitian[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/admin/top-dietitians?limit=all");
        if (res.ok) {
          const data = await res.json();
          setDietitians(data.topDietitians || []);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">All Dietitians</h1>
          <Button asChild variant="outline">
            <Link href="/dashboard/admin">Back to Dashboard</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <span>Top Performing Dietitians</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-gray-500">Loading...</div>
            ) : (
              <div className="space-y-3">
                {dietitians.map((d, index) => (
                  <div key={d.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-medium text-green-600">#{index + 1}</span>
                      </div>
                      <div>
                        <p className="font-medium">{d.name}</p>
                        <p className="text-xs text-gray-500">{d.email}</p>
                      </div>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-gray-500">Clients</p>
                      <p className="font-medium">{d.clients}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

