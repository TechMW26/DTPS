'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  RefreshCw,
  Search,
  Filter,
  Download,
  CheckCircle,
  XCircle,
  Clock,
  CreditCard,
  User,
  Calendar,
  IndianRupee,
  Eye,
  ExternalLink,
  Loader2,
  Package,
  AlertCircle,
  TrendingUp,
  Users,
  Receipt
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useRealtime } from '@/hooks/useRealtime';

interface Payment {
  _id: string;
  client: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  } | null;
  dietitian?: {
    _id: string;
    firstName: string;
    lastName: string;
  } | null;
  type: string;
  amount: number;
  currency: string;
  status: string;
  paymentStatus?: string;
  paymentMethod: string;
  planName?: string;
  planCategory?: string;
  durationDays?: number;
  durationLabel?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayPaymentLinkUrl?: string;
  transactionId?: string;
  payerEmail?: string;
  payerPhone?: string;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface PaymentStats {
  totalPayments: number;
  totalRevenue: number;
  completedPayments: number;
  pendingPayments: number;
  failedPayments: number;
}

export default function AdminPaymentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stats, setStats] = useState<PaymentStats>({
    totalPayments: 0,
    totalRevenue: 0,
    completedPayments: 0,
    pendingPayments: 0,
    failedPayments: 0
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.user || (session.user as any).role !== 'admin') {
      router.push('/auth/signin');
      return;
    }
    fetchPayments();
  }, [session, status, router]);

  const fetchPaymentsQuiet = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/payments');
      if (!response.ok) return;
      const data = await response.json();
      setPayments(data.payments || []);
      setStats(data.stats || {
        totalPayments: 0,
        totalRevenue: 0,
        completedPayments: 0,
        pendingPayments: 0,
        failedPayments: 0,
      });
    } catch {
      // ignore
    }
  }, []);

  useRealtime({
    onMessage: (event) => {
      if (event.type === 'payment_updated' || event.type === 'payment_link_updated') {
        fetchPaymentsQuiet();
      }
    },
  });

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/payments');
      if (response.ok) {
        const data = await response.json();
        setPayments(data.payments || []);
        setStats(data.stats || {
          totalPayments: 0,
          totalRevenue: 0,
          completedPayments: 0,
          pendingPayments: 0,
          failedPayments: 0
        });
      } else {
        toast.error('Failed to fetch payments');
      }
    } catch (error) {
      console.error('Error fetching payments:', error);
      toast.error('Error loading payments');
    } finally {
      setLoading(false);
    }
  };

  const syncWithRazorpay = async () => {
    try {
      setSyncing(true);
      const response = await fetch('/api/admin/payments/sync', {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(`Synced ${data.synced} payments with Razorpay`);
        fetchPayments(); // Refresh data
      } else {
        toast.error('Failed to sync with Razorpay');
      }
    } catch (error) {
      console.error('Error syncing:', error);
      toast.error('Error syncing with Razorpay');
    } finally {
      setSyncing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; icon: any }> = {
      completed: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle },
      paid: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle },
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Clock },
      failed: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
      cancelled: { bg: 'bg-gray-100', text: 'text-gray-700', icon: XCircle },
      refunded: { bg: 'bg-purple-100', text: 'text-purple-700', icon: RefreshCw }
    };
    const style = styles[status] || styles.pending;
    const Icon = style.icon;

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
        <Icon className="h-3.5 w-3.5" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getCategoryLabel = (category?: string) => {
    if (!category) return 'General';
    const labels: Record<string, string> = {
      'weight-loss': 'Weight Loss',
      'weight-gain': 'Weight Gain',
      'muscle-gain': 'Muscle Gain',
      'diabetes': 'Diabetes',
      'pcos': 'PCOS',
      'thyroid': 'Thyroid',
      'general-wellness': 'General Wellness',
      'detox': 'Detox',
      'sports-nutrition': 'Sports Nutrition',
      'custom': 'Custom'
    };
    return labels[category] || category;
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'service_plan': 'Service Plan',
      'subscription': 'Subscription',
      'consultation': 'Consultation',
      'one_time': 'One Time',
      'other': 'Other'
    };
    return labels[type] || type;
  };

  const filteredPayments = payments.filter(payment => {
    // Search filter
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      payment.client?.firstName?.toLowerCase().includes(searchLower) ||
      payment.client?.lastName?.toLowerCase().includes(searchLower) ||
      payment.client?.email?.toLowerCase().includes(searchLower) ||
      payment.planName?.toLowerCase().includes(searchLower) ||
      payment.razorpayPaymentId?.toLowerCase().includes(searchLower) ||
      payment.transactionId?.toLowerCase().includes(searchLower);

    // Status filter
    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter;

    // Type filter
    const matchesType = typeFilter === 'all' || payment.type === typeFilter;

    // Date filter
    let matchesDate = true;
    if (dateFilter !== 'all') {
      const paymentDate = new Date(payment.createdAt);
      const now = new Date();
      switch (dateFilter) {
        case 'today':
          matchesDate = paymentDate.toDateString() === now.toDateString();
          break;
        case 'week':
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          matchesDate = paymentDate >= weekAgo;
          break;
        case 'month':
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          matchesDate = paymentDate >= monthAgo;
          break;
      }
    }

    return matchesSearch && matchesStatus && matchesType && matchesDate;
  });

  const exportToCSV = () => {
    // Define clean field mappings for CSV export
    const fieldMappings = [
      { field: 'createdAt', header: 'Date', formatter: (v: any) => v ? format(new Date(v), 'dd/MM/yyyy HH:mm') : '' },
      { field: 'client.firstName', header: 'First Name' },
      { field: 'client.lastName', header: 'Last Name' },
      { field: 'client.email', header: 'Email' },
      { field: 'planName', header: 'Plan Name' },
      { field: 'planCategory', header: 'Category', formatter: (v: any) => getCategoryLabel(v) },
      { field: 'amount', header: 'Amount (₹)', formatter: (v: any) => v ? String(v) : '0' },
      { field: 'status', header: 'Status' },
      { field: 'razorpayPaymentId', header: 'Razorpay Payment ID' },
      { field: 'transactionId', header: 'Transaction ID' },
    ];

    // Build CSV with proper headers
    const headers = fieldMappings.map(f => f.header);
    const rows = filteredPayments.map(p => {
      return fieldMappings.map(mapping => {
        const keys = mapping.field.split('.');
        let value: any = p;
        for (const key of keys) {
          value = value?.[key];
        }
        if (mapping.formatter) {
          return mapping.formatter(value);
        }
        return value ?? '';
      });
    });

    // Escape values for CSV
    const escapeCSV = (val: any) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csv = '\ufeff' + [headers, ...rows].map(row => row.map(escapeCSV).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (status === 'loading' || loading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="h-12 w-12 border-4 border-[#E06A26] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading payments...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
                <p className="text-sm text-gray-500">Manage all user payments and subscriptions</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={syncWithRazorpay}
                  disabled={syncing}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#3AB1A0] text-white rounded-lg hover:bg-[#2d9488] transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing...' : 'Sync Razorpay'}
                </button>
                <button
                  onClick={exportToCSV}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Export
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white rounded-xl p-4 shadow-sm border">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total Payments</p>
                  <p className="text-xl font-bold text-gray-900">{stats.totalPayments}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total Revenue</p>
                  <p className="text-xl font-bold text-gray-900">₹{stats.totalRevenue.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Completed</p>
                  <p className="text-xl font-bold text-gray-900">{stats.completedPayments}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Pending</p>
                  <p className="text-xl font-bold text-gray-900">{stats.pendingPayments}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 shadow-sm border">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                  <XCircle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Failed</p>
                  <p className="text-xl font-bold text-gray-900">{stats.failedPayments}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl p-4 shadow-sm border mb-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, email, plan, or transaction ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E06A26]/20 focus:border-[#E06A26]"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E06A26]/20 focus:border-[#E06A26]"
              >
                <option value="all">All Status</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
                <option value="refunded">Refunded</option>
              </select>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E06A26]/20 focus:border-[#E06A26]"
              >
                <option value="all">All Types</option>
                <option value="service_plan">Service Plan</option>
                <option value="subscription">Subscription</option>
                <option value="consultation">Consultation</option>
              </select>

              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E06A26]/20 focus:border-[#E06A26]"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">Last 7 Days</option>
                <option value="month">Last 30 Days</option>
              </select>
            </div>
          </div>

          {/* Payments Table */}
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Client</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Plan</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Transaction</th>
                    <th className="text-right px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPayments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center">
                          <CreditCard className="h-12 w-12 text-gray-300 mb-3" />
                          <p className="text-gray-500 font-medium">No payments found</p>
                          <p className="text-gray-400 text-sm">Try adjusting your filters</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredPayments.map((payment) => (
                      <tr key={payment._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-[#E06A26]/10 flex items-center justify-center">
                              <User className="h-5 w-5 text-[#E06A26]" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">
                                {payment.client?.firstName} {payment.client?.lastName}
                              </p>
                              <p className="text-xs text-gray-500">{payment.client?.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-gray-900">{payment.planName || 'N/A'}</p>
                            <p className="text-xs text-gray-500">
                              {getCategoryLabel(payment.planCategory)} • {payment.durationLabel || `${payment.durationDays} days`}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-semibold text-gray-900">₹{(payment.amount || 0).toLocaleString()}</p>
                          <p className="text-xs text-gray-500">{getTypeLabel(payment.type)}</p>
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(payment.paymentStatus || payment.status)}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900">{format(new Date(payment.createdAt), 'dd MMM yyyy')}</p>
                          <p className="text-xs text-gray-500">{format(new Date(payment.createdAt), 'HH:mm')}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-mono text-xs text-gray-600">
                            {payment.razorpayPaymentId || payment.transactionId || '-'}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedPayment(payment);
                                setShowModal(true);
                              }}
                              className="p-2 text-gray-500 hover:text-[#E06A26] hover:bg-[#E06A26]/5 rounded-lg transition-colors"
                              title="View Details"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            {payment.razorpayPaymentLinkUrl && (
                              <a
                                href={payment.razorpayPaymentLinkUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 text-gray-500 hover:text-[#3AB1A0] hover:bg-[#3AB1A0]/5 rounded-lg transition-colors"
                                title="Open Payment Link"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Payment Detail Modal */}
        {showModal && selectedPayment && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
            <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="bg-linear-to-r from-[#E06A26] to-[#DB9C6E] p-6 text-white rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold">Payment Details</h3>
                    <p className="text-white/80 text-sm">Transaction #{selectedPayment._id.slice(-8).toUpperCase()}</p>
                  </div>
                  <Receipt className="h-8 w-8 text-white/80" />
                </div>
              </div>

              <div className="p-6 space-y-4">
                {/* Client Info */}
                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                  <div className="h-12 w-12 rounded-full bg-[#E06A26]/10 flex items-center justify-center">
                    <User className="h-6 w-6 text-[#E06A26]" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">
                      {selectedPayment.client?.firstName} {selectedPayment.client?.lastName}
                    </p>
                    <p className="text-sm text-gray-500">{selectedPayment.client?.email}</p>
                    {selectedPayment.client?.phone && (
                      <p className="text-sm text-gray-500">{selectedPayment.client.phone}</p>
                    )}
                  </div>
                </div>

                {/* Plan Info */}
                <div className="p-4 bg-[#3AB1A0]/5 rounded-xl space-y-3">
                  <div className="flex items-center gap-3">
                    <Package className="h-5 w-5 text-[#3AB1A0]" />
                    <div>
                      <p className="font-semibold text-gray-900">{selectedPayment.planName || 'Service Plan'}</p>
                      <p className="text-sm text-gray-500">{getCategoryLabel(selectedPayment.planCategory)}</p>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Duration</span>
                    <span className="font-medium">{selectedPayment.durationLabel || `${selectedPayment.durationDays} days`}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Type</span>
                    <span className="font-medium">{getTypeLabel(selectedPayment.type)}</span>
                  </div>
                </div>

                {/* Payment Info */}
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-500">Amount</span>
                    <span className="font-bold text-[#E06A26]">₹{(selectedPayment.amount || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-500">Status</span>
                    {getStatusBadge(selectedPayment.paymentStatus || selectedPayment.status)}
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-500">Payment Method</span>
                    <span className="font-medium capitalize">{selectedPayment.paymentMethod}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-500">Created</span>
                    <span className="font-medium">{format(new Date(selectedPayment.createdAt), 'dd MMM yyyy, HH:mm')}</span>
                  </div>
                  {selectedPayment.paidAt && (
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-gray-500">Paid At</span>
                      <span className="font-medium">{format(new Date(selectedPayment.paidAt), 'dd MMM yyyy, HH:mm')}</span>
                    </div>
                  )}
                  {selectedPayment.razorpayOrderId && (
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-gray-500">Order ID</span>
                      <span className="font-mono text-sm">{selectedPayment.razorpayOrderId}</span>
                    </div>
                  )}
                  {selectedPayment.razorpayPaymentId && (
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-gray-500">Payment ID</span>
                      <span className="font-mono text-sm">{selectedPayment.razorpayPaymentId}</span>
                    </div>
                  )}
                </div>

                {/* Dietitian Info */}
                {selectedPayment.dietitian && (
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <p className="text-sm text-gray-500 mb-1">Assigned Dietitian</p>
                    <p className="font-medium text-gray-900">
                      Dt. {selectedPayment.dietitian.firstName} {selectedPayment.dietitian.lastName}
                    </p>
                  </div>
                )}

                <button
                  onClick={() => setShowModal(false)}
                  className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
