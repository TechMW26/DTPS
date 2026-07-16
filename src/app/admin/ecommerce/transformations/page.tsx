'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Edit2, Eye, EyeOff, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface EcommerceTransformation {
  _id: string;
  name: string;
  isActive: boolean;
}

export default function AdminEcommerceTransformationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<EcommerceTransformation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.user || (session.user as any).role !== 'admin') {
      router.push('/auth/signin');
      return;
    }
    fetchItems();
  }, [session, status, router]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/admin/ecommerce/transformations?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch transformations');
      const data = await res.json();
      setItems(data.transformations || []);
    } catch {
      toast.error('Failed to load transformations');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this transformation?')) return;
    const res = await fetch(`/api/admin/ecommerce/transformations/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Transformation deleted');
      fetchItems();
    } else {
      toast.error('Failed to delete transformation');
    }
  };

  const handleToggle = async (item: EcommerceTransformation) => {
    const res = await fetch(`/api/admin/ecommerce/transformations/${item._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !item.isActive })
    });
    if (res.ok) {
      fetchItems();
    } else {
      toast.error('Failed to update status');
    }
  };

  if (!session?.user || (session.user as any).role !== 'admin') {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Ecommerce Transformations</h1>
          <Button asChild>
            <Link href="/admin/ecommerce/transformations/new">
              <Plus className="h-4 w-4 mr-2" />Add Transformation
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input className="pl-9" placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={fetchItems}>Apply</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transformations</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-gray-500">Loading...</div>
            ) : items.length === 0 ? (
              <div className="text-sm text-gray-500">No transformations found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => (
                      <tr key={item._id} className="border-b">
                        <td className="py-2 pr-4 font-medium">{item.name}</td>
                        <td className="py-2 pr-4">
                          <Badge variant={item.isActive ? 'default' : 'secondary'}>
                            {item.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => handleToggle(item)} title="Toggle status">
                              {item.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                            </Button>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/admin/ecommerce/transformations/${item._id}/edit`}>
                                <Edit2 className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(item._id)}>
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
