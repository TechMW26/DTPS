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
import { Eye, Pencil, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Lead {
  _id: string;
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
  source?: string;
  createdAt?: string;
}

export default function AdminLeadsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 30;

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.user || (session.user as any).role !== 'admin') {
      router.push('/auth/signin');
      return;
    }
    fetchLeads(1);
  }, [session, status, router]);

  const fetchLeads = useCallback(async (pageToFetch: number = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('page', String(pageToFetch));
      params.set('limit', String(pageSize));

      const res = await fetch(`/api/admin/leads?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch leads');
      const data = await res.json();
      setLeads(data.leads || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || Math.max(1, Math.ceil((data.total || 0) / pageSize)));
      setPage(data.page || pageToFetch);
    } catch {
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page, pageSize]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this lead?')) return;
    const res = await fetch(`/api/admin/leads/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Lead deleted');
      fetchLeads();
    } else {
      toast.error('Failed to delete lead');
    }
  };

  if (!session?.user || (session.user as any).role !== 'admin') {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Leads</h1>
          <Button asChild>
            <Link href="/admin/leads/new">
              <Plus className="h-4 w-4 mr-2" />Add Lead
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input placeholder="Search by name/email/phone" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => {
                setPage(1);
                fetchLeads(1);
              }}
            >
              Apply
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leads</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-gray-500">Loading...</div>
            ) : leads.length === 0 ? (
              <div className="text-sm text-gray-500">No leads found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Email</th>
                      <th className="py-2 pr-4">Phone</th>
                      <th className="py-2 pr-4">Source</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Created</th>
                      <th className="py-2 pr-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map(lead => (
                      <tr key={lead._id} className="border-b">
                        <td className="py-2 pr-4 font-medium">{lead.name || '-'}</td>
                        <td className="py-2 pr-4">{lead.email || '-'}</td>
                        <td className="py-2 pr-4">{lead.phone || '-'}</td>
                        <td className="py-2 pr-4">{lead.source || '-'}</td>
                        <td className="py-2 pr-4 capitalize">{lead.status || '-'}</td>
                        <td className="py-2 pr-4">{lead.createdAt ? format(new Date(lead.createdAt), 'dd MMM yyyy') : '-'}</td>
                        <td className="py-2 pr-4 flex gap-2">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/admin/leads/${lead._id}`}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/admin/leads/${lead._id}/edit`}>
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(lead._id)}>
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-between pt-4 text-sm text-gray-600">
                  <div>Showing page {page} of {totalPages} ({total} total)</div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => fetchLeads(page - 1)}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => fetchLeads(page + 1)}>
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
