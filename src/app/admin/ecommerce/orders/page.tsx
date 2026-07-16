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
import { Eye, Pencil, Trash2, RefreshCw, Plus, Package } from 'lucide-react';

interface EcommerceOrder {
  _id: string;
  orderId: string;
  status: string;
  paymentStatus: string;
  orderDate?: string;
  currency: string;
  totalAmount: number;
  customer?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
}

export default function AdminEcommerceOrdersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [orders, setOrders] = useState<EcommerceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
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
    fetchOrders(1);
  }, [session, status, router]);

  const fetchOrders = useCallback(async (pageToFetch: number = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (paymentFilter !== 'all') params.set('paymentStatus', paymentFilter);
      params.set('page', String(pageToFetch));
      params.set('limit', String(pageSize));

      const res = await fetch(`/api/admin/ecommerce/orders?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch orders');
      const data = await res.json();
      setOrders(data.orders || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || Math.max(1, Math.ceil((data.total || 0) / pageSize)));
      setPage(data.page || pageToFetch);
    } catch (error) {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, paymentFilter, page, pageSize]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/ecommerce/orders/sync', { method: 'POST' });
      if (!res.ok) throw new Error('Sync failed');
      const data = await res.json();
      toast.success(`Synced ${data.count || 0} orders`);
      fetchOrders();
    } catch (error) {
      toast.error('Failed to sync orders');
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (orderId: string) => {
    if (!confirm('Delete this order?')) return;
    try {
      const res = await fetch(`/api/admin/ecommerce/orders/${orderId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Order deleted');
      fetchOrders();
    } catch (error) {
      toast.error('Failed to delete order');
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
            <Package className="h-6 w-6 text-emerald-600" />
            <h1 className="text-2xl font-semibold">Ecommerce Orders</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleSync} disabled={syncing}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {syncing ? 'Syncing...' : 'Sync'}
            </Button>
            <Button asChild>
              <Link href="/admin/ecommerce/orders/new">
                <Plus className="h-4 w-4 mr-2" />
                Add Order
              </Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input placeholder="Search by order ID or email" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Order Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger><SelectValue placeholder="Payment Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Payments</SelectItem>
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
                fetchOrders(1);
              }}
            >
              Apply
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Orders</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-gray-500">Loading...</div>
            ) : orders.length === 0 ? (
              <div className="text-sm text-gray-500">No orders found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-4">Order ID</th>
                      <th className="py-2 pr-4">Date</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Payment</th>
                      <th className="py-2 pr-4">Total</th>
                      <th className="py-2 pr-4">Customer</th>
                      <th className="py-2 pr-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(order => {
                      const displayStatus = order.paymentStatus || order.status;
                      return (
                      <tr key={order.orderId} className="border-b">
                        <td className="py-2 pr-4 font-medium">{order.orderId}</td>
                        <td className="py-2 pr-4">{order.orderDate ? format(new Date(order.orderDate), 'dd MMM yyyy HH:mm') : '-'}</td>
                        <td className="py-2 pr-4 capitalize">{displayStatus}</td>
                        <td className="py-2 pr-4 capitalize">{order.paymentStatus}</td>
                        <td className="py-2 pr-4">{order.currency} {order.totalAmount.toFixed(2)}</td>
                        <td className="py-2 pr-4">{order.customer?.email || '-'}</td>
                        <td className="py-2 pr-4 flex gap-2">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/admin/ecommerce/orders/${order.orderId}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/admin/ecommerce/orders/${order.orderId}/edit`}>
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(order.orderId)}>
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="flex items-center justify-between pt-4 text-sm text-gray-600">
                  <div>Showing page {page} of {totalPages} ({total} total)</div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => fetchOrders(page - 1)}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => fetchOrders(page + 1)}>
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
