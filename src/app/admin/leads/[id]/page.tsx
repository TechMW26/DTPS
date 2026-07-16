'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Lead {
  _id: string;
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
  source?: string;
  message?: string;
  notes?: string;
  metadata?: any;
  createdAt?: string;
}

export default function AdminLeadDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.user || (session.user as any).role !== 'admin') {
      router.push('/auth/signin');
      return;
    }
    fetchLead();
  }, [session, status, router, id]);

  const fetchLead = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/leads/${id}`);
      if (!res.ok) throw new Error('Failed to load lead');
      const data = await res.json();
      setLead(data.lead);
    } catch {
      toast.error('Failed to load lead');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this lead?')) return;
    const res = await fetch(`/api/admin/leads/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Lead deleted');
      router.push('/admin/leads');
    } else {
      toast.error('Failed to delete lead');
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
            <Link href="/admin/leads">
              <ArrowLeft className="h-4 w-4 mr-2" />Back
            </Link>
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/admin/leads/${id}/edit`}>
                <Pencil className="h-4 w-4 mr-2" />Edit
              </Link>
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" />Delete
            </Button>
          </div>
        </div>

        {loading || !lead ? (
          <div className="text-sm text-gray-500">Loading...</div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lead Details</CardTitle>
            </CardHeader>
            <CardContent className="text-sm grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>Name: {lead.name || '-'}</div>
              <div>Email: {lead.email || '-'}</div>
              <div>Phone: {lead.phone || '-'}</div>
              <div>Status: {lead.status || '-'}</div>
              <div>Source: {lead.source || '-'}</div>
              <div>Created: {lead.createdAt ? format(new Date(lead.createdAt), 'dd MMM yyyy HH:mm') : '-'}</div>
              <div className="md:col-span-2">Message: {lead.message || '-'}</div>
              <div className="md:col-span-2">Notes: {lead.notes || '-'}</div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
