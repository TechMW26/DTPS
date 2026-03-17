'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { StatsCard } from '@/components/ui/stats-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import ContactDietitian from '@/components/client/ContactDietitian';
import { 
  Heart, 
  Calendar, 
  TrendingUp, 
  Target,
  Clock,
  MessageCircle,
  Utensils,
  Activity
} from 'lucide-react';
import Link from 'next/link';

export default function ClientDashboard() {
  const { data: session } = useSession();
  const router = useRouter();

  // Redirect clients to mobile dashboard
  useEffect(() => {
    if (session?.user?.role === 'client') {
      router.push('/client-dashboard');
    }
  }, [session, router]);

  // Mock data - in real app, this would come from API
  const stats = {
    currentWeight: '68.5 kg',
    goalWeight: '65 kg',
    caloriesConsumed: 1450,
    caloriesTarget: 1800,
    waterIntake: 6,
    waterTarget: 8,
    workoutsThisWeek: 3,
    workoutTarget: 5
  };

  const upcomingAppointments = [
    {
      id: 1,
      date: '2024-08-28',
      time: '10:00 AM',
      dietitian: 'Dt. Sarah Johnson',
      type: 'Follow-up Consultation'
    },
    {
      id: 2,
      date: '2024-09-02',
      time: '2:00 PM',
      dietitian: 'Dt. Sarah Johnson',
      type: 'Progress Review'
    }
  ];

  const recentMeals = [
    { meal: 'Breakfast', calories: 350, time: '09:00 AM' },
    { meal: 'Lunch', calories: 520, time: '01:00 PM' },
    { meal: 'Mid Evening', calories: 180, time: '04:00 PM' },
  ];

  const progressData = {
    weightLoss: 2.5, // kg lost
    targetLoss: 3.5, // target kg to lose
    daysOnPlan: 28,
    totalPlanDays: 90
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Welcome back, {session?.user?.firstName}!
            </h1>
            <p className="text-gray-600 mt-1">
              Here's your health overview for today
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            title="Current Weight"
            value={stats.currentWeight}
            description="Goal: 65 kg"
            icon={<Target className="h-4 w-4" />}
            trend={{ value: -2.3, isPositive: true }}
          />
          <StatsCard
            title="Calories Today"
            value={`${stats.caloriesConsumed}/${stats.caloriesTarget}`}
            description="Remaining: 350 cal"
            icon={<Utensils className="h-4 w-4" />}
          />
          <StatsCard
            title="Water Intake"
            value={`${stats.waterIntake}/${stats.waterTarget} glasses`}
            description="Stay hydrated!"
            icon={<Activity className="h-4 w-4" />}
          />
          <StatsCard
            title="Workouts This Week"
            value={`${stats.workoutsThisWeek}/${stats.workoutTarget}`}
            description="2 more to go!"
            icon={<TrendingUp className="h-4 w-4" />}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Progress Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Heart className="h-5 w-5 text-green-600" />
                <span>Progress Overview</span>
              </CardTitle>
              <CardDescription>
                Your journey so far
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Weight Loss Progress</span>
                  <span>{progressData.weightLoss}kg / {progressData.targetLoss}kg</span>
                </div>
                <Progress 
                  value={(progressData.weightLoss / progressData.targetLoss) * 100} 
                  className="h-2"
                />
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Plan Duration</span>
                  <span>{progressData.daysOnPlan} / {progressData.totalPlanDays} days</span>
                </div>
                <Progress 
                  value={(progressData.daysOnPlan / progressData.totalPlanDays) * 100} 
                  className="h-2"
                />
              </div>

              <div className="pt-4">
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/progress">View Detailed Progress</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Today's Meals */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Utensils className="h-5 w-5 text-green-600" />
                <span>Today's Meals</span>
              </CardTitle>
              <CardDescription>
                Track your daily nutrition
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentMeals.map((meal, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">{meal.meal}</p>
                      <p className="text-sm text-gray-600">{meal.time}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{meal.calories} cal</p>
                    </div>
                  </div>
                ))}
                
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upcoming Appointments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="h-5 w-5 text-green-600" />
                <span>Upcoming Appointments</span>
              </CardTitle>
              <CardDescription>
                Your scheduled consultations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {upcomingAppointments.map((appointment) => (
                  <div key={appointment.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{appointment.type}</p>
                      <p className="text-sm text-gray-600">with {appointment.dietitian}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{appointment.date}</p>
                      <p className="text-sm text-gray-600">{appointment.time}</p>
                    </div>
                  </div>
                ))}
                
                <Button variant="outline" className="w-full mt-4" asChild>
                  <Link href="/appointments">View All Appointments</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Contact Dietitian */}
          <ContactDietitian />

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>
                Common tasks and shortcuts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="h-20 flex flex-col space-y-2" asChild>
                  <Link href="/my-plan">
                    <Heart className="h-6 w-6" />
                    <span>My Meal Plan</span>
                  </Link>
                </Button>

                <Button variant="outline" className="h-20 flex flex-col space-y-2" asChild>
                  <Link href="/messages">
                    <MessageCircle className="h-6 w-6" />
                    <span>Message Dietitian</span>
                  </Link>
                </Button>

                <Button variant="outline" className="h-20 flex flex-col space-y-2" asChild>
                  <Link href="/progress">
                    <TrendingUp className="h-6 w-6" />
                    <span>Track Progress</span>
                  </Link>
                </Button>

                <Button variant="outline" className="h-20 flex flex-col space-y-2" asChild>
                  <Link href="/appointments/book">
                    <Clock className="h-6 w-6" />
                    <span>Book Session</span>
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
