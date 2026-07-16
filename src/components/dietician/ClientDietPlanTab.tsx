'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Plus,
  Calendar,
  UtensilsCrossed,
  Eye,
  Edit,
  Trash2,
  CheckCircle2
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';

interface MealPlan {
  _id: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  dailyCalorieTarget: number;
  isActive: boolean;
  createdAt: string;
}

interface ClientDietPlanTabProps {
  clientId: string;
  client: any;
}

export default function ClientDietPlanTab({ clientId, client }: ClientDietPlanTabProps) {
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMealPlans();
  }, [clientId]);

  const fetchMealPlans = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/meals?clientId=${clientId}`);
      if (response.ok) {
        const data = await response.json();
        setMealPlans(data.mealPlans || []);
      }
    } catch (error) {
      console.error('Error fetching meal plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (planId: string) => {
    if (!confirm('Are you sure you want to delete this meal plan?')) return;

    try {
      const response = await fetch(`/api/meals/${planId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        fetchMealPlans();
      }
    } catch (error) {
      console.error('Error deleting meal plan:', error);
    }
  };

  const toggleActive = async (planId: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/meals/${planId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus })
      });

      if (response.ok) {
        fetchMealPlans();
      }
    } catch (error) {
      console.error('Error updating meal plan:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Diet Plans</h2>
          <p className="text-gray-600 mt-1">
            Manage diet plans for {client.firstName} {client.lastName}
          </p>
        </div>
        <Button asChild className="cursor-pointer">
          <Link href={`/meal-plans/create?clientId=${clientId}`}>
            <Plus className="h-4 w-4 mr-2" />
            Create Diet Plan
          </Link>
        </Button>
      </div>

      {/* Meal Plans List */}
      {mealPlans.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <UtensilsCrossed className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Diet Plans Yet</h3>
            <p className="text-gray-600 mb-4">
              Create a personalized diet plan for this client
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {mealPlans.map((plan) => (
            <Card key={plan._id} className={plan.isActive ? 'border-green-500 border-2' : ''}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <CardTitle className="text-xl">{plan.name}</CardTitle>
                      {plan.isActive && (
                        <Badge className="bg-green-100 text-green-800">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      )}
                    </div>
                    {plan.description && (
                      <CardDescription className="mt-2">{plan.description}</CardDescription>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Start Date</p>
                    <p className="font-medium flex items-center">
                      <Calendar className="h-3 w-3 mr-1" />
                      {format(new Date(plan.startDate), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">End Date</p>
                    <p className="font-medium flex items-center">
                      <Calendar className="h-3 w-3 mr-1" />
                      {format(new Date(plan.endDate), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Daily Calories</p>
                    <p className="font-medium">{plan.dailyCalorieTarget} kcal</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Created</p>
                    <p className="font-medium">{format(new Date(plan.createdAt), 'MMM d, yyyy')}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-2 border-t">
                  <Button size="sm" variant="outline" asChild className="cursor-pointer">
                    <Link href={`/meal-plans/${plan._id}`}>
                      <Eye className="h-3 w-3 mr-1" />
                      View
                    </Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild className="cursor-pointer">
                    <Link href={`/meal-plans/${plan._id}/edit`}>
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleActive(plan._id, plan.isActive)}
                    className="cursor-pointer"
                  >
                    {plan.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(plan._id)}
                    className="cursor-pointer text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

