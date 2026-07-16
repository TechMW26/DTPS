'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Eye, RefreshCw, Wallet } from 'lucide-react';

interface EcommercePayment {
  paymentId: string;
  orderId?: string;
  status: string;
  paymentType?: string;
  paymentMethod?: string;
  transactionId?: string;
  amount: number;
  currency: string;
  paymentDate?: string;
}

export default function AdminEcommercePaymentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [payments, setPayments] = useState<EcommercePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.user || (session.user as any).role !== 'admin') {
      router.push('/auth/signin');
      return;
    }
    fetchPayments(1);
  }, [session, status, router]);

  const fetchPayments = useCallback(async (pageToFetch: number = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('page', String(pageToFetch));
      params.set('limit', String(pageSize));

      const res = await fetch(`/api/admin/ecommerce/payments?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch payments');
      const data = await res.json();
      setPayments(data.payments || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || Math.max(1, Math.ceil((data.total || 0) / pageSize)));
      setPage(data.page || pageToFetch);
    } catch {
      toast.error('Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page, pageSize]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/ecommerce/payments/sync', { method: 'POST' });
      if (!res.ok) throw new Error('Sync failed');
      const data = await res.json();
      toast.success(`Synced ${data.count || 0} payments`);
      fetchPayments();
    } catch {
      toast.error('Failed to sync payments');
    } finally {
      setSyncing(false);
    }
  };

  if (!session?.user || (session.user as any).role !== 'admin') {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-6 w-6 text-emerald-600" />
            <h1 className="text-2xl font-semibold">Ecommerce Payments</h1>
          </div>
          <Button variant="outline" onClick={handleSync} disabled={syncing}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {syncing ? 'Syncing...' : 'Sync'}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input placeholder="Search by payment/order ID" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => {
                setPage(1);
                fetchPayments(1);
              }}
            >
              Apply
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payments</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-gray-500">Loading...</div>
            ) : payments.length === 0 ? (
              <div className="text-sm text-gray-500">No payments found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-4">Payment ID</th>
                      <th className="py-2 pr-4">Order ID</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Method</th>
                      <th className="py-2 pr-4">Amount</th>
                      <th className="py-2 pr-4">Date</th>
                      <th className="py-2 pr-4">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(payment => (
                      <tr key={payment.paymentId} className="border-b">
                        <td className="py-2 pr-4 font-medium">{payment.paymentId}</td>
                        <td className="py-2 pr-4">{payment.orderId || '-'}</td>
                        <td className="py-2 pr-4 capitalize">{payment.status}</td>
                        <td className="py-2 pr-4">{payment.paymentMethod || payment.paymentType || '-'}</td>
                        <td className="py-2 pr-4">{payment.currency} {payment.amount}</td>
                        <td className="py-2 pr-4">{payment.paymentDate ? format(new Date(payment.paymentDate), 'dd MMM yyyy HH:mm') : '-'}</td>
                        <td className="py-2 pr-4">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/admin/ecommerce/payments/${payment.paymentId}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-between pt-4 text-sm text-gray-600">
                  <div>Showing page {page} of {totalPages} ({total} total)</div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => fetchPayments(page - 1)}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => fetchPayments(page + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
