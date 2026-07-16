'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ResponsiveLayout } from '@/components/client/layouts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Flame,
  Droplet,
  TrendingUp,
  Calendar,
  ChevronRight,
  Target,
  Activity,
  Apple,
  Moon,
  Plus
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';

interface DashboardStats {
  calories: { consumed: number; target: number; remaining: number };
  water: { current: number; target: number };
  protein: { current: number; target: number };
  steps: { current: number; target: number };
  weight: { current: number; target: number; change: number };
  streak: number;
}

export default function UserDashboard() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 17) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');

    // Fetch dashboard stats
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/client/dashboard-stats', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Default stats if not loaded
  const defaultStats: DashboardStats = {
    calories: { consumed: 1450, target: 2000, remaining: 550 },
    water: { current: 5, target: 8 },
    protein: { current: 45, target: 80 },
    steps: { current: 6500, target: 10000 },
    weight: { current: 72, target: 68, change: -0.5 },
    streak: 12,
  };

  const data = stats || defaultStats;
  const caloriePercent = Math.min((data.calories.consumed / data.calories.target) * 100, 100);
  const waterPercent = Math.min((data.water.current / data.water.target) * 100, 100);
  const proteinPercent = Math.min((data.protein.current / data.protein.target) * 100, 100);
  const stepsPercent = Math.min((data.steps.current / data.steps.target) * 100, 100);

  return (
    <ResponsiveLayout>
      <div className="space-y-6">
        {/* Greeting Section - Mobile Only */}
        <div className="md:hidden">
          <h1 className="text-2xl font-bold text-gray-900">
            {greeting}, {session?.user?.firstName || 'there'}! 👋
          </h1>
          <p className="text-gray-500 mt-1">{format(new Date(), 'EEEE, MMMM d')}</p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-3 md:hidden">
          {[
            { icon: Droplet, label: 'Add Water', href: '#', color: 'bg-blue-100 text-blue-600' },
            { icon: Activity, label: 'Log Weight', href: '/user/progress', color: 'bg-purple-100 text-purple-600' },
            { icon: Moon, label: 'Log Sleep', href: '#', color: 'bg-indigo-100 text-indigo-600' },
          ].map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white shadow-sm"
            >
              <div className={`h-10 w-10 rounded-full ${action.color} flex items-center justify-center`}>
                <action.icon className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium text-gray-700">{action.label}</span>
            </Link>
          ))}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Calories Card */}
          <Card className="col-span-2 lg:col-span-1 border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center">
                  <Flame className="h-5 w-5 text-orange-600" />
                </div>
                <span className="text-xs text-gray-500">Today</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{data.calories.consumed}</p>
              <p className="text-sm text-gray-500">of {data.calories.target} kcal</p>
              <Progress value={caloriePercent} className="h-2 mt-3" />
            </CardContent>
          </Card>

          {/* Water Card */}
          <Link href="/user/hydration">
            <Card className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Droplet className="h-5 w-5 text-blue-600" />
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-2xl font-bold text-gray-900">{data.water.current}</p>
                <p className="text-sm text-gray-500">of {data.water.target} glasses</p>
                <Progress value={waterPercent} className="h-2 mt-3 [&>div]:bg-blue-500" />
              </CardContent>
            </Card>
          </Link>

          {/* Protein Card */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-xl bg-green-100 flex items-center justify-center">
                  <Target className="h-5 w-5 text-green-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{data.protein.current}g</p>
              <p className="text-sm text-gray-500">of {data.protein.target}g protein</p>
              <Progress value={proteinPercent} className="h-2 mt-3 [&>div]:bg-green-500" />
            </CardContent>
          </Card>

          {/* Steps Card */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="h-10 w-10 rounded-xl bg-purple-100 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-purple-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{data.steps.current.toLocaleString()}</p>
              <p className="text-sm text-gray-500">of {data.steps.target.toLocaleString()} steps</p>
              <Progress value={stepsPercent} className="h-2 mt-3 [&>div]:bg-purple-500" />
            </CardContent>
          </Card>
        </div>

        {/* Today's Meals Section */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Today's Meals</CardTitle>
              <Link href="/user/plan" className="text-sm text-green-600 font-medium flex items-center">
                View Plan <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { name: 'Breakfast', time: '09:00 AM', calories: 450, completed: true },
              { name: 'Lunch', time: '01:00 PM', calories: 650, completed: true },
              { name: 'Mid Evening', time: '04:00 PM', calories: 150, completed: false },
              { name: 'Dinner', time: '07:00 PM', calories: 550, completed: false },
            ].map((meal) => (
              <div
                key={meal.name}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full ${meal.completed ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div>
                    <p className="font-medium text-gray-900">{meal.name}</p>
                    <p className="text-xs text-gray-500">{meal.time}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium text-gray-900">{meal.calories}</p>
                  <p className="text-xs text-gray-500">kcal</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Streak & Weight Section */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <div className="h-12 w-12 rounded-full bg-linear-to-br from-orange-400 to-red-500 flex items-center justify-center mx-auto mb-2">
                <span className="text-xl">🔥</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{data.streak}</p>
              <p className="text-sm text-gray-500">Day Streak</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <div className="h-12 w-12 rounded-full bg-linear-to-br from-green-400 to-emerald-500 flex items-center justify-center mx-auto mb-2">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              <p className="text-3xl font-bold text-gray-900">{data.weight.current} kg</p>
              <p className="text-sm text-green-600">{data.weight.change} kg this week</p>
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Appointment */}
        <Card className="border-0 shadow-sm bg-linear-to-r from-green-50 to-emerald-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <Calendar className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Next Appointment</p>
                  <p className="text-sm text-gray-600">Dt. Smith - Tomorrow, 10:00 AM</p>
                </div>
              </div>
              <Button size="sm" variant="outline" className="border-green-200 text-green-700">
                View
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ResponsiveLayout>
  );
}
