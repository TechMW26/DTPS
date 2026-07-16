'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target, Activity, AlertCircle, Apple } from 'lucide-react';

interface Client {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  height?: number;
  weight?: number;
  activityLevel?: string;
  healthGoals?: string[];
  medicalConditions?: string[];
  allergies?: string[];
  dietaryRestrictions?: string[];
}

interface ClientDetailsTabProps {
  client: Client;
  onUpdate?: () => void;
}

export default function ClientDetailsTab({ client, onUpdate }: ClientDetailsTabProps) {
  const calculateAge = (dob: string) => {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const calculateBMI = (weight?: number, height?: number) => {
    if (!weight || !height) return null;
    const heightInMeters = height / 100;
    const bmi = weight / (heightInMeters * heightInMeters);
    return bmi.toFixed(1);
  };

  const getBMICategory = (bmi: number) => {
    if (bmi < 18.5) return { label: 'Underweight', color: 'text-blue-600' };
    if (bmi < 25) return { label: 'Normal', color: 'text-green-600' };
    if (bmi < 30) return { label: 'Overweight', color: 'text-yellow-600' };
    return { label: 'Obese', color: 'text-red-600' };
  };

  const bmi = calculateBMI(client.weight, client.height);
  const bmiCategory = bmi ? getBMICategory(parseFloat(bmi)) : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Activity className="h-5 w-5 mr-2" />
            Basic Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Age</p>
              <p className="font-medium">
                {client.dateOfBirth ? `${calculateAge(client.dateOfBirth)} years` : 'Not provided'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Gender</p>
              <p className="font-medium capitalize">{client.gender || 'Not provided'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Height</p>
              <p className="font-medium">{client.height ? `${client.height} cm` : 'Not provided'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Weight</p>
              <p className="font-medium">{client.weight ? `${client.weight} kg` : 'Not provided'}</p>
            </div>
            {bmi && (
              <>
                <div>
                  <p className="text-sm text-gray-600">BMI</p>
                  <p className={`font-medium ${bmiCategory?.color}`}>{bmi}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Category</p>
                  <p className={`font-medium ${bmiCategory?.color}`}>{bmiCategory?.label}</p>
                </div>
              </>
            )}
            <div className="col-span-2">
              <p className="text-sm text-gray-600">Activity Level</p>
              <p className="font-medium capitalize">{client.activityLevel || 'Not provided'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Health Goals */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Target className="h-5 w-5 mr-2" />
            Health Goals
          </CardTitle>
        </CardHeader>
        <CardContent>
          {client.healthGoals && client.healthGoals.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {client.healthGoals.map((goal, index) => (
                <Badge key={index} variant="outline" className="text-sm">
                  {goal}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No health goals specified</p>
          )}
        </CardContent>
      </Card>

      {/* Medical Conditions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <AlertCircle className="h-5 w-5 mr-2 text-red-500" />
            Medical Conditions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {client.medicalConditions && client.medicalConditions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {client.medicalConditions.map((condition, index) => (
                <Badge key={index} variant="outline" className="text-sm border-red-200 text-red-700">
                  {condition}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No medical conditions reported</p>
          )}
        </CardContent>
      </Card>

      {/* Dietary Restrictions & Allergies */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Apple className="h-5 w-5 mr-2 text-green-500" />
            Dietary Restrictions & Allergies
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-2">Dietary Restrictions</p>
            {client.dietaryRestrictions && client.dietaryRestrictions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {client.dietaryRestrictions.map((restriction, index) => (
                  <Badge key={index} variant="outline" className="text-sm border-green-200 text-green-700">
                    {restriction}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">None</p>
            )}
          </div>

          <div>
            <p className="text-sm text-gray-600 mb-2">Allergies</p>
            {client.allergies && client.allergies.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {client.allergies.map((allergy, index) => (
                  <Badge key={index} variant="outline" className="text-sm border-orange-200 text-orange-700">
                    {allergy}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">None</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

