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
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminLeadEditPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [statusValue, setStatusValue] = useState('new');
  const [source, setSource] = useState('');
  const [message, setMessage] = useState('');
  const [notes, setNotes] = useState('');

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
      const lead = data.lead;
      setName(lead.name || '');
      setEmail(lead.email || '');
      setPhone(lead.phone || '');
      setStatusValue(lead.status || 'new');
      setSource(lead.source || '');
      setMessage(lead.message || '');
      setNotes(lead.notes || '');
    } catch {
      toast.error('Failed to load lead');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          status: statusValue,
          source,
          message,
          notes
        })
      });
      if (!res.ok) throw new Error('Failed to update lead');
      toast.success('Lead updated');
      router.push(`/admin/leads/${id}`);
    } catch {
      toast.error('Failed to update lead');
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
            <Link href={`/admin/leads/${id}`}>
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
            <CardTitle className="text-base">Edit Lead</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="text-sm text-gray-500">Loading...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <select className="border rounded-md h-9 px-2 text-sm" value={statusValue} onChange={(e) => setStatusValue(e.target.value)}>
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="converted">Converted</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Source</Label>
                  <Input value={source} onChange={(e) => setSource(e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Message</Label>
                  <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Notes</Label>
                  <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
