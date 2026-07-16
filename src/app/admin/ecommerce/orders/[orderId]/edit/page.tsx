'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type OrderItem = {
  name: string;
  quantity: number;
  price: number;
  total: number;
};

export default function AdminEcommerceOrderEditPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const orderId = params?.orderId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [statusValue, setStatusValue] = useState('pending');
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [orderDate, setOrderDate] = useState('');
  const [totalAmount, setTotalAmount] = useState('0');
  const [currency, setCurrency] = useState('INR');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OrderItem[]>([]);

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
      const order = data.order;
      setStatusValue(order.status || 'pending');
      setPaymentStatus(order.paymentStatus || 'pending');
      setOrderDate(order.orderDate ? new Date(order.orderDate).toISOString().slice(0, 16) : '');
      setTotalAmount(String(order.totalAmount || 0));
      setCurrency(order.currency || 'INR');
      setCustomerEmail(order.customer?.email || '');
      setCustomerPhone(order.customer?.phone || '');
      setNotes(order.notes || '');
      setItems((order.items || []).map((item: any) => ({
        name: item.name || '',
        quantity: Number(item.quantity || 1),
        price: Number(item.price || 0),
        total: Number(item.total || 0)
      })));
    } catch {
      toast.error('Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const cleanedItems = items
      .filter(item => item.name.trim())
      .map(item => ({
        ...item,
        total: Number(item.total || item.quantity * item.price)
      }));

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/ecommerce/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: statusValue,
          paymentStatus,
          orderDate: orderDate ? new Date(orderDate) : null,
          totalAmount: Number(totalAmount || 0),
          currency,
          customer: { email: customerEmail, phone: customerPhone },
          items: cleanedItems,
          notes
        })
      });
      if (!res.ok) throw new Error('Failed to update order');
      toast.success('Order updated');
      router.push(`/admin/ecommerce/orders/${orderId}`);
    } catch {
      toast.error('Failed to update order');
    } finally {
      setSaving(false);
    }
  };

  if (!session?.user || (session.user as any).role !== 'admin') {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" asChild>
            <Link href={`/admin/ecommerce/orders/${orderId}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />Back
            </Link>
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Edit Ecommerce Order</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="text-sm text-gray-500">Loading...</div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Order ID</Label>
                    <Input value={orderId} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Input value={statusValue} onChange={(e) => setStatusValue(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Payment Status</Label>
                    <Input value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Order Date</Label>
                    <Input type="datetime-local" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Amount</Label>
                    <Input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Customer Email</Label>
                    <Input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Customer Phone</Label>
                    <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Notes</Label>
                    <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Items</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setItems(prev => ([...prev, { name: '', quantity: 1, price: 0, total: 0 }]))}
                    >
                      <Plus className="h-4 w-4 mr-2" />Add Item
                    </Button>
                  </div>
                  {items.map((item, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end border rounded-md p-3">
                      <div className="space-y-2 md:col-span-2">
                        <Label>Item Name</Label>
                        <Input
                          value={item.name}
                          onChange={(e) => {
                            const name = e.target.value;
                            setItems(prev => prev.map((it, i) => i === index ? { ...it, name } : it));
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Qty</Label>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => {
                            const quantity = Number(e.target.value || 0);
                            setItems(prev => prev.map((it, i) => i === index ? { ...it, quantity, total: quantity * it.price } : it));
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Price</Label>
                        <Input
                          type="number"
                          value={item.price}
                          onChange={(e) => {
                            const price = Number(e.target.value || 0);
                            setItems(prev => prev.map((it, i) => i === index ? { ...it, price, total: it.quantity * price } : it));
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Total</Label>
                        <Input
                          type="number"
                          value={item.total}
                          onChange={(e) => {
                            const total = Number(e.target.value || 0);
                            setItems(prev => prev.map((it, i) => i === index ? { ...it, total } : it));
                          }}
                        />
                      </div>
                      <div className="md:col-span-5 flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setItems(prev => prev.filter((_, i) => i !== index))}
                          disabled={items.length === 1}
                        >
                          <Trash2 className="h-4 w-4 mr-2 text-red-600" />Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div className="text-sm text-gray-500">No items added.</div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
