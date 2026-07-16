'use client';

import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Activity, Target } from 'lucide-react';
import BodyMeasurements from './BodyMeasurements';

interface ClientData {
  _id?: string;
  weight?: number;
  height?: number;
  activityLevel?: string;
  healthGoals?: string[];
  medicalConditions?: string[];
  dietaryRestrictions?: string[];
  createdAt: string;
}

interface ProgressSectionProps {
  client: ClientData | null;
  setActiveSection: (section: string) => void;
  setActiveTab: (tab: string) => void;
  formatDate: (date: string) => string;
  onRegisterReset?: (fn: () => void) => void;
}

export default function ProgressSection({
  client,
  setActiveSection,
  setActiveTab,
  formatDate,
  onRegisterReset
}: ProgressSectionProps) {
  // Register reset callback for floating back button
  useEffect(() => {
    if (onRegisterReset) {
      onRegisterReset(() => { /* no internal nav state to reset */ });
    }
  }, [onRegisterReset]);

  if (!client) {
    return (
      <div className="mt-6">
        <Card>
          <CardContent className="p-6 text-center text-gray-500">
            <p>No client data available</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="mt-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-gray-600">Current Weight</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{client.weight || 'N/A'} <span className="text-lg">kg</span></p>
            <p className="text-sm text-gray-500 mt-1">Last updated: {formatDate(client.createdAt)}</p>
            <Button 
              size="sm" 
              className="mt-3 w-full" 
              variant="outline"
              onClick={() => {
                setActiveSection('forms');
                setActiveTab('lifestyle');
              }}
            >
              Update
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-gray-600">Height</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{client.height || 'N/A'} <span className="text-lg">cm</span></p>
            <p className="text-sm text-gray-500 mt-1">Current measurement</p>
            <Button 
              size="sm" 
              className="mt-3 w-full" 
              variant="outline"
              onClick={() => {
                setActiveSection('forms');
                setActiveTab('lifestyle');
              }}
            >
              Update
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-gray-600">BMI</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {client.height && client.weight 
                ? (client.weight / Math.pow(client.height / 100, 2)).toFixed(1)
                : 'N/A'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {client.height && client.weight ? (
                (client.weight / Math.pow(client.height / 100, 2)) < 18.5 ? 'Underweight' :
                (client.weight / Math.pow(client.height / 100, 2)) < 25 ? 'Normal' :
                (client.weight / Math.pow(client.height / 100, 2)) < 30 ? 'Overweight' : 'Obese'
              ) : 'Not calculated'}
            </p>
            <Button 
              size="sm" 
              className="mt-3 w-full" 
              variant="outline"
              onClick={() => {
                setActiveSection('forms');
                setActiveTab('lifestyle');
              }}
            >
              View Details
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-gray-600">Activity Level</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold capitalize">{client.activityLevel || 'Not Set'}</p>
            <p className="text-sm text-gray-500 mt-1">Current level</p>
            <Button 
              size="sm" 
              className="mt-3 w-full" 
              variant="outline"
              onClick={() => {
                setActiveSection('forms');
                setActiveTab('lifestyle');
              }}
            >
              Update
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Health Goals & Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Health Goals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {client.healthGoals && client.healthGoals.length > 0 ? (
                client.healthGoals.map((goal, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-blue-50 rounded">
                    <div className="flex items-center gap-3">
                      <Target className="h-5 w-5 text-blue-600" />
                      <span className="font-medium text-blue-900">{goal}</span>
                    </div>
                    <Badge className="bg-blue-100 text-blue-800">Active</Badge>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm">No health goals set</p>
              )}
              <Button 
                size="sm" 
                className="w-full mt-3"
                onClick={() => {
                  setActiveSection('forms');
                  setActiveTab('basic-details');
                }}
              >
                Update Goals
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Health Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-gray-600">Medical Conditions</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {client.medicalConditions && client.medicalConditions.length > 0 ? (
                    client.medicalConditions.map((condition, idx) => (
                      <Badge key={idx} className="bg-red-100 text-red-800">{condition}</Badge>
                    ))
                  ) : (
                    <span className="text-gray-500 text-sm">None</span>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-xs text-gray-600">Dietary Restrictions</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {client.dietaryRestrictions && client.dietaryRestrictions.length > 0 ? (
                    client.dietaryRestrictions.map((restriction, idx) => (
                      <Badge key={idx} variant="secondary">{restriction}</Badge>
                    ))
                  ) : (
                    <span className="text-gray-500 text-sm">None</span>
                  )}
                </div>
              </div>
              <Button 
                size="sm" 
                className="w-full"
                onClick={() => {
                  setActiveSection('forms');
                  setActiveTab('medical-info');
                }}
              >
                Update Medical Info
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Weight Progress Chart</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-gray-500">
            <Activity className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p>Weight tracking chart will appear here</p>
            <p className="text-sm mt-2">Record regular weight measurements to see progress trends</p>
            <Button className="mt-4" variant="outline">Add Weight Entry</Button>
          </div>
        </CardContent>
      </Card>

      {/* Body Measurements Section */}
      {client?._id && (
        <BodyMeasurements clientId={client._id} />
      )}
    </div>
  );
}
