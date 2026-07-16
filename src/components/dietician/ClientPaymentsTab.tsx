'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Plus,
  IndianRupee,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Link as LinkIcon,
  Copy,
  CreditCard
} from 'lucide-react';
import { format } from 'date-fns';

interface SubscriptionPlan {
  _id: string;
  name: string;
  description?: string;
  price: number;
  duration: number;
  durationType: string;
  category: string;
}

interface Subscription {
  _id: string;
  plan: SubscriptionPlan;
  startDate: string;
  endDate: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  amount: number;
  currency: string;
  paymentLink?: string;
  transactionId?: string;
  paidAt?: string;
  notes?: string;
  createdAt: string;
}

interface ClientPaymentsTabProps {
  clientId: string;
  client: any;
}

export default function ClientPaymentsTab({ clientId, client }: ClientPaymentsTabProps) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [selectedPlan, setSelectedPlan] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'manual' | 'cash' | 'bank-transfer'>('razorpay');
  const [generateLink, setGenerateLink] = useState(true);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchSubscriptions();
    fetchPlans();
  }, [clientId]);

  const fetchSubscriptions = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/subscriptions?clientId=${clientId}`);
      if (response.ok) {
        const data = await response.json();
        setSubscriptions(data.subscriptions || []);
      }
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPlans = async () => {
    try {
      const response = await fetch('/api/admin/subscription-plans?isActive=true');
      if (response.ok) {
        const data = await response.json();
        setPlans(data.plans || []);
      }
    } catch (error) {
      console.error('Error fetching plans:', error);
    }
  };

  const handleCreateSubscription = async () => {
    if (!selectedPlan) {
      alert('Please select a plan');
      return;
    }

    try {
      setCreating(true);
      const response = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          planId: selectedPlan,
          paymentMethod,
          generatePaymentLink: paymentMethod === 'razorpay' && generateLink,
          notes
        })
      });

      if (response.ok) {
        const data = await response.json();
        setDialogOpen(false);
        fetchSubscriptions();

        // Show payment link if generated
        if (data.subscription.paymentLink) {
          alert(`Payment link generated: ${data.subscription.paymentLink}`);
        }

        // Reset form
        setSelectedPlan('');
        setPaymentMethod('razorpay');
        setGenerateLink(true);
        setNotes('');
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to create subscription');
      }
    } catch (error) {
      console.error('Error creating subscription:', error);
      alert('Failed to create subscription');
    } finally {
      setCreating(false);
    }
  };

  const handleMarkAsPaid = async (subscriptionId: string) => {
    const transactionId = prompt('Enter transaction ID (optional):');

    try {
      const response = await fetch(`/api/subscriptions/${subscriptionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark-paid',
          transactionId
        })
      });

      if (response.ok) {
        fetchSubscriptions();
      }
    } catch (error) {
      console.error('Error marking as paid:', error);
    }
  };

  const copyPaymentLink = (link: string) => {
    navigator.clipboard.writeText(link);
    alert('Payment link copied to clipboard!');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>;
      case 'expired':
        return <Badge className="bg-gray-100 text-gray-800"><XCircle className="h-3 w-3 mr-1" />Expired</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />Cancelled</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-800">Paid</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      case 'refunded':
        return <Badge className="bg-purple-100 text-purple-800">Refunded</Badge>;
      default:
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
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
          <h2 className="text-2xl font-bold text-gray-900">Payments & Subscriptions</h2>
          <p className="text-gray-600 mt-1">
            Manage subscriptions and payments for {client.firstName} {client.lastName}
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="cursor-pointer">
              <Plus className="h-4 w-4 mr-2" />
              Add Subscription
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Subscription</DialogTitle>
              <DialogDescription>
                Create a subscription plan for {client.firstName} {client.lastName}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Select Plan</Label>
                <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan._id} value={plan._id}>
                        {plan.name} - ₹{plan.price} ({plan.duration} {plan.durationType})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={(value: any) => setPaymentMethod(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="razorpay">Razorpay (Online)</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank-transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {paymentMethod === 'razorpay' && (
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="generateLink"
                    checked={generateLink}
                    onChange={(e) => setGenerateLink(e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="generateLink" className="cursor-pointer">
                    Generate payment link
                  </Label>
                </div>
              )}

              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes..."
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateSubscription} disabled={creating}>
                {creating ? 'Creating...' : 'Create Subscription'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Subscriptions List */}
      {subscriptions.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <IndianRupee className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Subscriptions Yet</h3>
            <p className="text-gray-600 mb-4">
              Create a subscription plan for this client
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {subscriptions.map((subscription) => (
            <Card key={subscription._id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl">{subscription.plan.name}</CardTitle>
                    {subscription.plan.description && (
                      <CardDescription className="mt-1">{subscription.plan.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex flex-col items-end space-y-1">
                    {getStatusBadge(subscription.status)}
                    {getPaymentStatusBadge(subscription.paymentStatus)}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Amount</p>
                    <p className="font-medium text-lg flex items-center">
                      <IndianRupee className="h-4 w-4" />
                      {subscription.amount?.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Start Date</p>
                    <p className="font-medium">{format(new Date(subscription.startDate), 'MMM d, yyyy')}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">End Date</p>
                    <p className="font-medium">{format(new Date(subscription.endDate), 'MMM d, yyyy')}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Payment Method</p>
                    <p className="font-medium capitalize">{subscription.paymentMethod}</p>
                  </div>
                </div>

                {subscription.paymentLink && (
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <LinkIcon className="h-4 w-4 text-blue-600" />
                        <span className="text-sm text-blue-900 font-medium">Payment Link</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyPaymentLink(subscription.paymentLink!)}
                        className="cursor-pointer"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy Link
                      </Button>
                    </div>
                  </div>
                )}

                {subscription.transactionId && (
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-sm text-gray-600 mb-1">Transaction ID</p>
                    <p className="font-mono text-sm text-gray-900 break-all">{subscription.transactionId}</p>
                  </div>
                )}

                {subscription.paidAt && (
                  <div className="text-sm">
                    <span className="text-gray-600">Paid On: </span>
                    <span className="font-medium">{format(new Date(subscription.paidAt), 'MMM d, yyyy h:mm a')}</span>
                  </div>
                )}

                {subscription.notes && (
                  <div className="text-sm">
                    <span className="text-gray-600">Notes: </span>
                    <span>{subscription.notes}</span>
                  </div>
                )}

                {subscription.paymentStatus === 'pending' && subscription.paymentMethod !== 'razorpay' && (
                  <div className="pt-2 border-t">
                    <Button
                      size="sm"
                      onClick={() => handleMarkAsPaid(subscription._id)}
                      className="cursor-pointer"
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Mark as Paid
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

