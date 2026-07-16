'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  CreditCard,
  DollarSign,
  Calendar,
  Receipt,
  Download,
  Plus
} from 'lucide-react';
import { format } from 'date-fns';
import { useRealtime } from '@/hooks/useRealtime';

interface Payment {
  _id: string;
  amount: number;
  currency: string;
  description: string;
  status: string;
  paymentMethod: string;
  createdAt: string;
  paidAt?: string;
  dietitian: {
    firstName: string;
    lastName: string;
  };
  appointment?: {
    type: string;
    scheduledAt: string;
  };
}

export default function BillingPage() {
  const { data: session, status } = useSession();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  // Only fetch when session is authenticated
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      fetchPayments();
    } else if (status === 'unauthenticated') {
      setLoading(false);
    }
  }, [status, session?.user?.id]);

  useRealtime({
    onMessage: (event) => {
      if (event.type === 'payment_updated' || event.type === 'payment_link_updated') {
        fetchPayments();
      }
    },
  });

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/payments');
      if (response.ok) {
        const data = await response.json();
        setPayments(data.payments);
      }
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPaymentsByStatus = () => {
    return {
      all: payments,
      completed: payments.filter(payment => payment.status === 'completed'),
      pending: payments.filter(payment => payment.status === 'pending'),
      failed: payments.filter(payment => payment.status === 'failed')
    };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTotalSpent = () => {
    return payments
      .filter(payment => payment.status === 'completed')
      .reduce((total, payment) => total + payment.amount, 0);
  };

  const getThisMonthSpent = () => {
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    return payments
      .filter(payment => 
        payment.status === 'completed' && 
        new Date(payment.paidAt || payment.createdAt) >= thisMonth
      )
      .reduce((total, payment) => total + payment.amount, 0);
  };

  const paymentGroups = getPaymentsByStatus();

  const PaymentCard = ({ payment }: { payment: Payment }) => (
    <Card key={payment._id}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              <Receipt className="h-4 w-4 text-gray-400" />
              <h3 className="font-semibold">{payment.description}</h3>
              <Badge className={getStatusColor(payment.status)}>
                {payment.status}
              </Badge>
            </div>
            
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-center space-x-2">
                <DollarSign className="h-4 w-4" />
                <span>
                  ${payment.amount.toFixed(2)} {payment.currency}
                </span>
              </div>
              
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4" />
                <span>
                  {format(new Date(payment.createdAt), 'MMMM d, yyyy')}
                  {payment.paidAt && payment.status === 'completed' && (
                    <span className="text-green-600 ml-2">
                      (Paid {format(new Date(payment.paidAt), 'MMM d')})
                    </span>
                  )}
                </span>
              </div>
              
              <div className="flex items-center space-x-2">
                <CreditCard className="h-4 w-4" />
                <span className="capitalize">{payment.paymentMethod}</span>
              </div>
              
              {payment.dietitian && (
                <div>
                  <span className="text-gray-500">Provider: </span>
                  <span>Dt. {payment.dietitian.firstName} {payment.dietitian.lastName}</span>
                </div>
              )}
              
              {payment.appointment && (
                <div>
                  <span className="text-gray-500">Service: </span>
                  <span className="capitalize">
                    {payment.appointment.type.replace('_', ' ')} - {' '}
                    {format(new Date(payment.appointment.scheduledAt), 'MMM d, yyyy')}
                  </span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex flex-col space-y-2 ml-4">
            {payment.status === 'completed' && (
              <Button size="sm" variant="outline">
                <Download className="h-3 w-3 mr-1" />
                Receipt
              </Button>
            )}
            
            {payment.status === 'pending' && (
              <Button size="sm">
                Pay Now
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Billing & Payments</h1>
          <p className="text-gray-600 mt-1">Manage your payments and billing history</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center space-x-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                <span>Total Spent</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">
                ${getTotalSpent().toFixed(2)}
              </p>
              <p className="text-sm text-gray-600">All time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center space-x-2">
                <Calendar className="h-5 w-5 text-blue-600" />
                <span>This Month</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-600">
                ${getThisMonthSpent().toFixed(2)}
              </p>
              <p className="text-sm text-gray-600">
                {format(new Date(), 'MMMM yyyy')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center space-x-2">
                <Receipt className="h-5 w-5 text-purple-600" />
                <span>Transactions</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-purple-600">
                {payments.length}
              </p>
              <p className="text-sm text-gray-600">Total payments</p>
            </CardContent>
          </Card>
        </div>

        {/* Payment History */}
        <Card>
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
            <CardDescription>
              View and manage your payment transactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="all">
                  All ({paymentGroups.all.length})
                </TabsTrigger>
                <TabsTrigger value="completed">
                  Completed ({paymentGroups.completed.length})
                </TabsTrigger>
                <TabsTrigger value="pending">
                  Pending ({paymentGroups.pending.length})
                </TabsTrigger>
                <TabsTrigger value="failed">
                  Failed ({paymentGroups.failed.length})
                </TabsTrigger>
              </TabsList>

              {Object.entries(paymentGroups).map(([status, statusPayments]) => (
                <TabsContent key={status} value={status} className="space-y-4">
                  {loading ? (
                    <div className="flex items-center justify-center h-32">
                      <LoadingSpinner />
                    </div>
                  ) : statusPayments.length === 0 ? (
                    <div className="text-center py-12">
                      <Receipt className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        No {status === 'all' ? '' : status} payments
                      </h3>
                      <p className="text-gray-600">
                        {status === 'all' 
                          ? "You haven't made any payments yet."
                          : `You don't have any ${status} payments.`
                        }
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {statusPayments.map((payment) => (
                        <PaymentCard key={payment._id} payment={payment} />
                      ))}
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CreditCard className="h-5 w-5" />
              <span>Payment Methods</span>
            </CardTitle>
            <CardDescription>
              Manage your saved payment methods
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Payment Methods</h3>
              <p className="text-gray-600 mb-4">
                Add a payment method to make future payments easier
              </p>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Payment Method
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
