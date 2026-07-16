'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

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
  payer?: { name?: string; email?: string; phone?: string };
  raw?: any;
}

export default function AdminEcommercePaymentDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const paymentId = params?.paymentId as string;
  const [payment, setPayment] = useState<EcommercePayment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.user || (session.user as any).role !== 'admin') {
      router.push('/auth/signin');
      return;
    }
    fetchPayment();
  }, [session, status, router, paymentId]);

  const fetchPayment = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/ecommerce/payments/${paymentId}`);
      if (!res.ok) throw new Error('Failed to load payment');
      const data = await res.json();
      setPayment(data.payment);
    } catch {
      toast.error('Failed to load payment');
    } finally {
      setLoading(false);
    }
  };

  if (!session?.user || (session.user as any).role !== 'admin') {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/admin/ecommerce/payments">
            <ArrowLeft className="h-4 w-4 mr-2" />Back
          </Link>
        </Button>

        {loading || !payment ? (
          <div className="text-sm text-gray-500">Loading...</div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payment Summary</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-xs text-gray-500">Payment ID</div>
                  <div className="font-medium">{payment.paymentId}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Order ID</div>
                  <div className="font-medium">{payment.orderId || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Status</div>
                  <div className="font-medium capitalize">{payment.status}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Type</div>
                  <div className="font-medium">{payment.paymentType || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Method</div>
                  <div className="font-medium">{payment.paymentMethod || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Amount</div>
                  <div className="font-medium">{payment.currency} {payment.amount}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Payment Date</div>
                  <div className="font-medium">{payment.paymentDate ? format(new Date(payment.paymentDate), 'dd MMM yyyy HH:mm') : '-'}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payer</CardTitle>
              </CardHeader>
              <CardContent className="text-sm grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>Name: {payment.payer?.name || '-'}</div>
                <div>Email: {payment.payer?.email || '-'}</div>
                <div>Phone: {payment.payer?.phone || '-'}</div>
                <div>Transaction ID: {payment.transactionId || '-'}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Raw Payload</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-gray-50 p-3 rounded border overflow-auto">
{JSON.stringify(payment.raw || {}, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
