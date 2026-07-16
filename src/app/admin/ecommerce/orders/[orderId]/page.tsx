'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface EcommerceOrder {
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
  items?: Array<{ name: string; quantity: number; price: number; total: number }>;
  billingAddress?: any;
  shippingAddress?: any;
}

interface EcommercePayment {
  paymentId: string;
  status: string;
  paymentType?: string;
  paymentMethod?: string;
  transactionId?: string;
  amount: number;
  currency: string;
  paymentDate?: string;
}

export default function AdminEcommerceOrderDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const orderId = params?.orderId as string;
  const [order, setOrder] = useState<EcommerceOrder | null>(null);
  const [payments, setPayments] = useState<EcommercePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const displayStatus = order?.paymentStatus || order?.status || '';

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.user || (session.user as any).role !== 'admin') {
      router.push('/auth/signin');
      return;
    }
    fetchOrder();
  }, [session, status, router, orderId]);

  const fetchOrder = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/ecommerce/orders/${orderId}`);
      if (!res.ok) throw new Error('Failed to load order');
      const data = await res.json();
      setOrder(data.order);

      const paymentsRes = await fetch(`/api/admin/ecommerce/payments?orderId=${orderId}`);
      if (paymentsRes.ok) {
        const paymentsData = await paymentsRes.json();
        setPayments(paymentsData.payments || []);
      }
    } catch {
      toast.error('Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this order?')) return;
    const res = await fetch(`/api/admin/ecommerce/orders/${orderId}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Order deleted');
      router.push('/admin/ecommerce/orders');
    } else {
      toast.error('Failed to delete order');
    }
  };

  if (!session?.user || (session.user as any).role !== 'admin') {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" asChild>
            <Link href="/admin/ecommerce/orders">
              <ArrowLeft className="h-4 w-4 mr-2" />Back
            </Link>
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/admin/ecommerce/orders/${orderId}/edit`}>
                <Pencil className="h-4 w-4 mr-2" />Edit
              </Link>
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" />Delete
            </Button>
          </div>
        </div>

        {loading || !order ? (
          <div className="text-sm text-gray-500">Loading...</div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-xs text-gray-500">Order ID</div>
                  <div className="font-medium">{order.orderId}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Order Date</div>
                  <div className="font-medium">{order.orderDate ? format(new Date(order.orderDate), 'dd MMM yyyy HH:mm') : '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Order Status</div>
                  <div className="font-medium capitalize">{displayStatus}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Payment Status</div>
                  <div className="font-medium capitalize">{order.paymentStatus}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Customer</CardTitle>
              </CardHeader>
              <CardContent className="text-sm grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>Name: {`${order.customer?.firstName || ''} ${order.customer?.lastName || ''}`.trim() || '-'}</div>
                <div>Email: {order.customer?.email || '-'}</div>
                <div>Phone: {order.customer?.phone || '-'}</div>
                <div>Total: {order.currency} {order.totalAmount.toFixed(2)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Items</CardTitle>
              </CardHeader>
              <CardContent>
                {order.items && order.items.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left border-b">
                          <th className="py-2 pr-4">Item</th>
                          <th className="py-2 pr-4">Qty</th>
                          <th className="py-2 pr-4">Price</th>
                          <th className="py-2 pr-4">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.items.map((item, index) => (
                          <tr key={`${item.name}-${index}`} className="border-b">
                            <td className="py-2 pr-4">{item.name}</td>
                            <td className="py-2 pr-4">{item.quantity}</td>
                            <td className="py-2 pr-4">{order.currency} {item.price}</td>
                            <td className="py-2 pr-4">{order.currency} {item.total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">No items</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ecommerce Payment Details</CardTitle>
              </CardHeader>
              <CardContent>
                {payments.length === 0 ? (
                  <div className="text-sm text-gray-500">No payments linked to this order.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left border-b">
                          <th className="py-2 pr-4">Payment ID</th>
                          <th className="py-2 pr-4">Status</th>
                          <th className="py-2 pr-4">Type</th>
                          <th className="py-2 pr-4">Method</th>
                          <th className="py-2 pr-4">Amount</th>
                          <th className="py-2 pr-4">Date</th>
                          <th className="py-2 pr-4">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map(payment => (
                          <tr key={payment.paymentId} className="border-b">
                            <td className="py-2 pr-4">{payment.paymentId}</td>
                            <td className="py-2 pr-4 capitalize">{payment.status}</td>
                            <td className="py-2 pr-4">{payment.paymentType || '-'}</td>
                            <td className="py-2 pr-4">{payment.paymentMethod || '-'}</td>
                            <td className="py-2 pr-4">{payment.currency} {payment.amount}</td>
                            <td className="py-2 pr-4">{payment.paymentDate ? format(new Date(payment.paymentDate), 'dd MMM yyyy HH:mm') : '-'}</td>
                            <td className="py-2 pr-4">
                              <Button variant="ghost" size="sm" asChild>
                                <Link href={`/admin/ecommerce/payments/${payment.paymentId}`}>View</Link>
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
