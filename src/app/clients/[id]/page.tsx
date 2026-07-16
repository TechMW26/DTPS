'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import ClientsLayout from '@/components/layout/ClientsLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import {
  MessageCircle,
  Settings,
  Trash2,
  Download,
  Share,
  Target,
  Calendar
} from 'lucide-react';

import { format } from 'date-fns';

interface Client {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  avatar?: string;
  status: string;
  dateOfBirth?: string;
  gender?: string;
  height?: number;
  weight?: number;
  activityLevel?: string;
  healthGoals?: string[];
  medicalConditions?: string[];
  allergies?: string[];
  dietaryRestrictions?: string[];
  createdAt: string;
}

export default function ClientDetailsPage() {
  const params = useParams();
  const clientId = params?.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('basic-details');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (clientId) fetchClientData();
  }, [clientId]);

  const fetchClientData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/users/${clientId}`);
      if (res.ok) setClient(await res.json());
    } catch (error) {
      console.error('Error fetching client:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <ClientsLayout>
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner />
        </div>
      </ClientsLayout>
    );
  }

  if (!client) {
    return (
      <ClientsLayout>
        <div className="p-6">
          <Card className="shadow-lg">
            <CardContent className="text-center py-12">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Client Not Found</h3>
              <p className="text-gray-600">The requested client does not exist.</p>
            </CardContent>
          </Card>
        </div>
      </ClientsLayout>
    );
  }

  return (
    <ClientsLayout>
      <div className="min-h-screen bg-gray-50">

        {/* HEADER */}
        <div className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">

            {/* Profile */}
            <div className="flex items-center gap-5">
              <div className="relative">
                <Avatar className="h-20 w-20 ring-4 ring-orange-200 shadow-md">
                  <AvatarImage src={client.avatar} />
                  <AvatarFallback className="text-xl bg-orange-100 text-orange-600">
                    {client.firstName[0]}
                    {client.lastName[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 border-2 border-white rounded-full"></div>
              </div>

              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {client.firstName} {client.lastName}
                </h1>

                <p className="text-sm text-gray-600 mt-1">
                  P-{client._id.slice(-6)} • {client.gender || 'Not specified'}
                </p>

                <p className="text-xs text-gray-500 mt-1">
                  Practitioner: Sachi Tiwari, Diksha, Varsha Rahamani
                </p>

                <p className="text-xs text-gray-500">
                  Last Login: {format(new Date(), 'MMM dd, yyyy')}
                </p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white px-5 shadow-sm">
                <MessageCircle className="h-4 w-4 mr-2" /> Contact Hub
              </Button>

              <Button variant="outline" className="px-5 shadow-sm">
                <Settings className="h-4 w-4 mr-2" /> Settings
              </Button>

              <Button
                variant="outline"
                className="px-5 border-red-300 text-red-600 hover:bg-red-100 shadow-sm"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </Button>
            </div>
          </div>
        </div>

        {/* GRID */}
        <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-12 gap-6">

          {/* LEFT Sidebar */}
          <div className="col-span-3 space-y-6">

            {/* Quick Actions */}
            <Card className="shadow-sm border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Quick Send</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full justify-start">
                  <MessageCircle className="h-4 w-4 mr-2" /> Modify
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Target className="h-4 w-4 mr-2" /> Tasks
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Calendar className="h-4 w-4 mr-2" /> Planning
                </Button>
              </CardContent>

              <div className="border-t p-4 space-y-3">
                <h4 className="font-medium text-gray-800">Tags</h4>
                <Badge className="bg-blue-100 text-blue-700">Weight Loss</Badge>
              </div>

              <div className="border-t p-4 space-y-3">
                <h4 className="font-medium text-gray-800">Notes</h4>
                <Textarea placeholder="Add notes..." className="min-h-25" />
              </div>
            </Card>

            {/* Menu */}
            <Card className="shadow-sm">
              <CardContent className="pt-4">
                <nav className="space-y-1">
                  {['forms', 'journal', 'progress', 'planning', 'payments', 'bookings', 'documents'].map(
                    (item) => (
                      <button
                        key={item}
                        onClick={() => setActiveTab(item)}
                        className="w-full text-left py-2 px-3 hover:bg-gray-100 rounded text-sm text-gray-700"
                      >
                        {item.charAt(0).toUpperCase() + item.slice(1)}
                      </button>
                    )
                  )}
                </nav>
              </CardContent>
            </Card>
          </div>

          {/* MAIN CONTENT */}
          <div className="col-span-6">
            <Card className="shadow-sm border-gray-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-xl font-semibold">
                  Program Details — Weight Loss
                </CardTitle>
                <p className="text-sm text-gray-500">
                  Duration: 90 Days • Jul 25, 2025 – Oct 29, 2025 • Status: Active
                </p>
              </CardHeader>

              {/* Tabs */}
              <div className="border-b flex space-x-8 px-6">
                {['basic-details', 'medical-info', 'lifestyle', 'recall'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`py-3 text-sm font-medium border-b-2 ${
                      activeTab === tab
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.replace('-', ' ').toUpperCase()}
                  </button>
                ))}
              </div>

              <CardContent className="p-6">
                {/* BASIC DETAILS */}
                {activeTab === 'basic-details' && (
                  <div className="space-y-6">
                    <h4 className="text-lg font-bold">Personal Information</h4>

                    <div className="grid grid-cols-2 gap-6">
                      <Field label="First Name">
                        <Input value={client.firstName} readOnly={!isEditing} />
                      </Field>

                      <Field label="Last Name">
                        <Input value={client.lastName} readOnly={!isEditing} />
                      </Field>

                      <Field label="Gender">
                        <Select value={client.gender || 'male'} disabled={!isEditing}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>

                      <Field label="Date of Birth">
                        <Input
                          type="date"
                          value={
                            client.dateOfBirth
                              ? format(new Date(client.dateOfBirth), 'yyyy-MM-dd')
                              : ''
                          }
                          readOnly={!isEditing}
                        />
                      </Field>

                      <Field label="Phone Number">
                        <Input value={client.phone || ''} readOnly={!isEditing} />
                      </Field>

                      <Field label="Email">
                        <Input value={client.email} readOnly />
                      </Field>
                    </div>
                  </div>
                )}

                {/* MEDICAL INFO */}
                {activeTab === 'medical-info' && (
                  <div>
                    <h4 className="text-lg font-bold mb-4">Anthropometric Measurements</h4>

                    <div className="grid grid-cols-5 gap-4 bg-gray-50 p-5 rounded-xl shadow-sm">
                      <Metric label="Height (Ft)" value={client.height ? Math.floor(client.height / 30.48) : '5'} />
                      <Metric label="Height (In)" value={client.height ? Math.round((client.height % 30.48) / 2.54) : '8'} />
                      <Metric label="Weight" value={client.weight || '82'} />
                      <Metric label="Target Weight" value="72" />
                      <Metric
                        label="BMI"
                        value={
                          client.height && client.weight
                            ? (client.weight / ((client.height / 100) ** 2)).toFixed(1)
                            : '27.5'
                        }
                      />
                    </div>
                  </div>
                )}

              </CardContent>
            </Card>
          </div>

          {/* RIGHT Sidebar */}
          <div className="col-span-3 space-y-6">

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Customer Activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <TimelineItem label="Last Session Booked" value={format(new Date(), 'MMM dd, yyyy')} />
                <TimelineItem label="Last Progress Updated" value="Jul 09, 2025" />
                <TimelineItem label="Last Journal Updated" value="-" />
                <TimelineItem label="Last Plan Sent" value="Sep 19, 2025" />
              </CardContent>
            </Card>

            <div className="space-y-3">
              <Button className="w-full bg-blue-600 text-white hover:bg-blue-700 shadow-sm">
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>

              <Button variant="outline" className="w-full shadow-sm">
                <Share className="h-4 w-4 mr-1" />
                Share
              </Button>
            </div>

          </div>
        </div>
      </div>
    </ClientsLayout>
  );
}

/* --- REUSABLE UI COMPONENTS --- */

function Field({ label, children }: any) {
  return (
    <div className="space-y-1">
      <Label className="text-sm font-semibold text-gray-700">{label}</Label>
      {children}
    </div>
  );
}

function Metric({ label, value }: any) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

function TimelineItem({ label, value }: any) {
  return (
    <div>
      <p className="font-medium text-gray-800">{label}:</p>
      <p className="text-gray-600">{value}</p>
    </div>
  );
}
