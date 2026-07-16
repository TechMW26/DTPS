'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import PaymentForm from '@/components/payments/PaymentForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { 
  Calendar, 
  Clock, 
  User,
  DollarSign,
  ArrowLeft
} from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';

interface Appointment {
  _id: string;
  type: string;
  status: string;
  scheduledAt: string;
  duration: number;
  notes?: string;
  dietitian: {
    _id: string;
    firstName: string;
    lastName: string;
    consultationFee: number;
  };
  client: {
    firstName: string;
    lastName: string;
  };
}

export default function AppointmentPaymentPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const appointmentId = params?.id as string;
  
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (appointmentId) {
      fetchAppointment();
    }
  }, [appointmentId]);

  const fetchAppointment = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/appointments/${appointmentId}`);
      if (response.ok) {
        const data = await response.json();
        setAppointment(data);
      }
    } catch (error) {
      console.error('Error fetching appointment:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = (paymentIntent: any) => {
    // Redirect to success page or back to appointments
    router.push(`/appointments?success=payment&appointmentId=${appointmentId}`);
  };

  const handlePaymentError = (error: string) => {
    console.error('Payment error:', error);
    // Handle payment error (show notification, etc.)
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner />
        </div>
      </DashboardLayout>
    );
  }

  if (!appointment) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Card>
            <CardContent className="text-center py-12">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Appointment Not Found</h3>
              <p className="text-gray-600">The requested appointment could not be found.</p>
              <Button asChild className="mt-4">
                <Link href="/appointments">Back to Appointments</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const appointmentFee = appointment.dietitian.consultationFee;
  const appointmentTypeFormatted = appointment.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/appointments">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Link>
          </Button>
          
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Payment</h1>
            <p className="text-gray-600 mt-1">Complete payment for your appointment</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Appointment Details */}
          <Card>
            <CardHeader>
              <CardTitle>Appointment Details</CardTitle>
              <CardDescription>Review your appointment information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <User className="h-4 w-4 text-gray-400" />
                <span className="font-medium">
                  Dt. {appointment.dietitian.firstName} {appointment.dietitian.lastName}
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-gray-400" />
                <span>{format(new Date(appointment.scheduledAt), 'EEEE, MMMM d, yyyy')}</span>
              </div>

              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-gray-400" />
                <span>
                  {format(new Date(appointment.scheduledAt), 'h:mm a')} 
                  ({appointment.duration} minutes)
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-medium">Appointment Type:</span>
                <Badge variant="outline">{appointmentTypeFormatted}</Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-medium">Status:</span>
                <Badge className="bg-yellow-100 text-yellow-800">
                  {appointment.status}
                </Badge>
              </div>

              {appointment.notes && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-1">Notes:</h4>
                  <p className="text-sm text-gray-700">{appointment.notes}</p>
                </div>
              )}

              <div className="border-t pt-4">
                <div className="flex items-center justify-between text-lg font-semibold">
                  <div className="flex items-center space-x-2">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    <span>Consultation Fee:</span>
                  </div>
                  <span className="text-green-600">${appointmentFee.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Form */}
          <div>
            <PaymentForm
              amount={appointmentFee}
              currency="USD"
              description={`${appointmentTypeFormatted} with Dt. ${appointment.dietitian.firstName} ${appointment.dietitian.lastName}`}
              appointmentId={appointment._id}
              dietitianId={appointment.dietitian._id}
              onSuccess={handlePaymentSuccess}
              onError={handlePaymentError}
            />
          </div>
        </div>

        {/* Security Notice */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start space-x-3">
              <div className="shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Secure Payment</h4>
                <p className="text-sm text-gray-600 mt-1">
                  Your payment is processed securely through Stripe. We never store your card information on our servers. 
                  All transactions are encrypted and protected by industry-standard security measures.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
