'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { format } from 'date-fns';
import { toast } from 'sonner';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  CheckCircle,
  XCircle,
  Clock,
  Search,
  RefreshCw,
  Wallet,
  User,
  AlertTriangle,
  Building2,
  CreditCard,
  Smartphone,
  X,
  Download,
  ImageIcon,
} from 'lucide-react';
import { UserRole } from '@/types';
import { useRealtime } from '@/hooks/useRealtime';

interface OtherPlatformPayment {
  _id: string;
  client: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    profilePicture?: string;
  };
  dietitian: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
  platform: string;
  customPlatform?: string;
  transactionId: string;
  amount: number;
  planName?: string;
  planCategory?: string;
  durationDays?: number;
  durationLabel?: string;
  paymentLink?: {
    _id: string;
    planName: string;
    planCategory: string;
    durationDays: number;
    amount: number;
    finalAmount: number;
    servicePlanId?: string;
  };
  receiptImage?: string;
  receiptImageUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  reviewedAt?: string;
  reviewNotes?: string;
  paymentDate: string;
  notes?: string;
  createdAt: string;
}

const platformLabels: Record<string, string> = {
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
  cash: 'Cash',
  phonepe: 'PhonePe',
  gpay: 'Google Pay',
  paytm: 'Paytm',
  other: 'Other',
};

const platformIcons: Record<string, React.ReactNode> = {
  upi: <CreditCard className="h-4 w-4" />,
  bank_transfer: <Building2 className="h-4 w-4" />,
  cash: <Wallet className="h-4 w-4" />,
  phonepe: <Smartphone className="h-4 w-4" />,
  gpay: <Smartphone className="h-4 w-4" />,
  paytm: <Smartphone className="h-4 w-4" />,
  other: <Wallet className="h-4 w-4" />,
};

export default function OtherPlatformPaymentsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const [payments, setPayments] = useState<OtherPlatformPayment[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<OtherPlatformPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [selectedPayment, setSelectedPayment] = useState<OtherPlatformPayment | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');
  const [reviewNotes, setReviewNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Image lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState('');

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/other-platform-payments');
      if (!res.ok) throw new Error('Failed to fetch payments');
      const data = await res.json();
      setPayments(data.payments || []);
    } catch {
      toast.error('Failed to fetch payments');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPaymentsQuiet = useCallback(async () => {
    try {
      const res = await fetch('/api/other-platform-payments');
      if (!res.ok) return;
      const data = await res.json();
      setPayments(data.payments || []);
    } catch {
      // ignore
    }
  }, []);

  useRealtime({
    onMessage: (event) => {
      if (event.type === 'other_platform_payment_updated') {
        fetchPaymentsQuiet();
      }
    },
  });

  useEffect(() => {
    if (sessionStatus === 'loading') return;

    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      router.push('/dashboard');
      return;
    }

    fetchPayments();
  }, [session, sessionStatus, router, fetchPayments]);

  useEffect(() => {
    let filtered = [...payments];

    // Filter by tab
    if (activeTab !== 'all') {
      filtered = filtered.filter(p => p.status === activeTab);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.client?.firstName?.toLowerCase().includes(term) ||
        p.client?.lastName?.toLowerCase().includes(term) ||
        p.client?.email?.toLowerCase().includes(term) ||
        p.transactionId?.toLowerCase().includes(term) ||
        p.planName?.toLowerCase().includes(term) ||
        p.paymentLink?.planName?.toLowerCase().includes(term)
      );
    }

    setFilteredPayments(filtered);
  }, [payments, activeTab, searchTerm]);

  const handleAction = async () => {
    if (!selectedPayment) return;

    try {
      setActionLoading(true);
      const res = await fetch(`/api/other-platform-payments/${selectedPayment._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: actionType === 'approve' ? 'approved' : 'rejected',
          reviewNotes,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update payment');
      }

      toast.success(actionType === 'approve' ? 'Payment approved successfully' : 'Payment rejected');
      setActionDialogOpen(false);
      setReviewNotes('');
      fetchPayments();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update payment');
    } finally {
      setActionLoading(false);
    }
  };

  const openActionDialog = (payment: OtherPlatformPayment, type: 'approve' | 'reject') => {
    setSelectedPayment(payment);
    setActionType(type);
    setReviewNotes('');
    setActionDialogOpen(true);
  };

  const openImageLightbox = (imageSrc: string) => {
    setLightboxImage(imageSrc);
    setLightboxOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle className="h-3 w-3 mr-1" /> Approved</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><XCircle className="h-3 w-3 mr-1" /> Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPlatformDisplay = (payment: OtherPlatformPayment) => {
    if (payment.platform === 'other' && payment.customPlatform) {
      return payment.customPlatform;
    }
    return platformLabels[payment.platform] || payment.platform;
  };

  const getCounts = () => {
    return {
      all: payments.length,
      pending: payments.filter(p => p.status === 'pending').length,
      approved: payments.filter(p => p.status === 'approved').length,
      rejected: payments.filter(p => p.status === 'rejected').length,
    };
  };

  const counts = getCounts();

  if (sessionStatus === 'loading' || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto py-6 px-4 max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Other Platform Payments</h1>
          <p className="text-muted-foreground">
            Review and approve payments made through external platforms
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-blue-100 rounded-full">
                  <Wallet className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{counts.all}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-yellow-100 rounded-full">
                  <Clock className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold">{counts.pending}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-green-100 rounded-full">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Approved</p>
                  <p className="text-2xl font-bold">{counts.approved}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-red-100 rounded-full">
                  <XCircle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Rejected</p>
                  <p className="text-2xl font-bold">{counts.rejected}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content - Table Format */}
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle>Payment Requests</CardTitle>
                <CardDescription>
                  Verify payment receipts and transaction IDs before approving
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search payments..."
                    className="pl-8 w-62.5"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="icon" onClick={fetchPayments}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
                <TabsTrigger value="pending">Pending ({counts.pending})</TabsTrigger>
                <TabsTrigger value="approved">Approved ({counts.approved})</TabsTrigger>
                <TabsTrigger value="rejected">Rejected ({counts.rejected})</TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab} className="mt-0">
                {filteredPayments.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Wallet className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No payments found</p>
                  </div>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Client</TableHead>
                          <TableHead>Plan Details</TableHead>
                          <TableHead>Platform</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Transaction ID</TableHead>
                          <TableHead>Payment Date</TableHead>
                          <TableHead>Receipt</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPayments.map((payment) => (
                          <TableRow key={payment._id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="relative h-8 w-8 rounded-full bg-muted overflow-hidden">
                                  {payment.client?.profilePicture ? (
                                    <Image
                                      src={payment.client.profilePicture}
                                      alt={payment.client.firstName}
                                      fill
                                      className="object-cover"
                                    />
                                  ) : (
                                    <div className="flex items-center justify-center h-full w-full">
                                      <User className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <p className="font-medium text-sm">
                                    {payment.client?.firstName} {payment.client?.lastName}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {payment.client?.email}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">
                                  {payment.planName || payment.paymentLink?.planName || 'N/A'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {payment.planCategory || payment.paymentLink?.planCategory || 'N/A'}
                                  {(payment.durationDays || payment.paymentLink?.durationDays) && (
                                    <span> • {payment.durationDays || payment.paymentLink?.durationDays} days</span>
                                  )}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                {platformIcons[payment.platform]}
                                <span className="text-sm">{getPlatformDisplay(payment)}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="font-medium">₹{payment.amount?.toLocaleString()}</span>
                            </TableCell>
                            <TableCell>
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                {payment.transactionId}
                              </code>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">
                                {format(new Date(payment.paymentDate), 'dd MMM yyyy')}
                              </span>
                            </TableCell>
                            <TableCell>
                              {payment.receiptImageUrl ? (
                                <button
                                  onClick={() => openImageLightbox(payment.receiptImageUrl!)}
                                  className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm hover:underline"
                                >
                                  <ImageIcon className="h-4 w-4" />
                                  View
                                </button>
                              ) : (
                                <span className="text-xs text-muted-foreground">No receipt</span>
                              )}
                            </TableCell>
                            <TableCell>{getStatusBadge(payment.status)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {payment.status === 'pending' && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                      onClick={() => openActionDialog(payment, 'approve')}
                                    >
                                      <CheckCircle className="h-4 w-4 mr-1" />
                                      Approve
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                      onClick={() => openActionDialog(payment, 'reject')}
                                    >
                                      <XCircle className="h-4 w-4 mr-1" />
                                      Reject
                                    </Button>
                                  </>
                                )}
                                {payment.status !== 'pending' && payment.reviewedBy && (
                                  <span className="text-xs text-muted-foreground">
                                    by {payment.reviewedBy.firstName}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Image Lightbox with Blur Background */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}
        >
          {/* Blur Background */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Image Container */}
          <div
            className="relative z-10 max-w-4xl max-h-[90vh] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute -top-2 -right-2 z-20 p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Download Button */}
            <a
              href={lightboxImage}
              download="receipt"
              target="_blank"
              rel="noopener noreferrer"
              className="absolute -top-2 right-10 z-20 p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <Download className="h-5 w-5" />
            </a>

            {/* Image */}
            <div className="bg-white rounded-lg overflow-hidden shadow-2xl">
              <img
                src={lightboxImage}
                alt="Payment Receipt"
                className="max-w-full max-h-[80vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Action Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'Approve Payment' : 'Reject Payment'}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'approve'
                ? 'This will mark the payment as completed and activate the client\'s plan.'
                : 'This will reject the payment request. The client will need to submit again.'}
            </DialogDescription>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Client:</span>
                  <span className="font-medium">
                    {selectedPayment.client?.firstName} {selectedPayment.client?.lastName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan:</span>
                  <span className="font-medium">
                    {selectedPayment.planName || selectedPayment.paymentLink?.planName || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-medium">₹{selectedPayment.amount?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Transaction ID:</span>
                  <code className="text-sm">{selectedPayment.transactionId}</code>
                </div>
                {selectedPayment.receiptImageUrl && (
                  <div className="pt-2">
                    <button
                      onClick={() => openImageLightbox(selectedPayment.receiptImageUrl!)}
                      className="text-blue-600 hover:underline text-sm flex items-center gap-1"
                    >
                      <ImageIcon className="h-4 w-4" />
                      View Receipt Image
                    </button>
                  </div>
                )}
              </div>

              {actionType === 'reject' && (
                <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-800">
                    Please provide a reason for rejection so the client knows what went wrong.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {actionType === 'approve' ? 'Notes (optional)' : 'Rejection Reason'}
                </label>
                <Textarea
                  placeholder={
                    actionType === 'approve'
                      ? 'Add any notes about this approval...'
                      : 'Explain why this payment is being rejected...'
                  }
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialogOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button
              onClick={handleAction}
              disabled={actionLoading || (actionType === 'reject' && !reviewNotes.trim())}
              className={actionType === 'approve' ? 'bg-green-600 hover:bg-green-700' : ''}
              variant={actionType === 'reject' ? 'destructive' : 'default'}
            >
              {actionLoading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : actionType === 'approve' ? (
                <CheckCircle className="h-4 w-4 mr-2" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              {actionType === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
