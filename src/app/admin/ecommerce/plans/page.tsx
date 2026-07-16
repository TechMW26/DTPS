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

interface EcommercePlan {
  _id: string;
  name: string;
  price: number;
  currency: string;
  isActive: boolean;
}

export default function AdminEcommercePlansPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [plans, setPlans] = useState<EcommercePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.user || (session.user as any).role !== 'admin') {
      router.push('/auth/signin');
      return;
    }
    fetchPlans();
  }, [session, status, router]);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/admin/ecommerce/plans?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch plans');
      const data = await res.json();
      setPlans(data.plans || []);
    } catch {
      toast.error('Failed to load plans');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this plan?')) return;
    const res = await fetch(`/api/admin/ecommerce/plans/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Plan deleted');
      fetchPlans();
    } else {
      toast.error('Failed to delete plan');
    }
  };

  const handleToggle = async (plan: EcommercePlan) => {
    const res = await fetch(`/api/admin/ecommerce/plans/${plan._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !plan.isActive })
    });
    if (res.ok) {
      fetchPlans();
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
          <h1 className="text-2xl font-semibold">Ecommerce Plans</h1>
          <Button asChild>
            <Link href="/admin/ecommerce/plans/new">
              <Plus className="h-4 w-4 mr-2" />Add Plan
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
            <Button variant="outline" onClick={fetchPlans}>Apply</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plans</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-gray-500">Loading...</div>
            ) : plans.length === 0 ? (
              <div className="text-sm text-gray-500">No plans found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Price</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map(plan => (
                      <tr key={plan._id} className="border-b">
                        <td className="py-2 pr-4 font-medium">{plan.name}</td>
                        <td className="py-2 pr-4">{plan.currency} {plan.price}</td>
                        <td className="py-2 pr-4">
                          <Badge variant={plan.isActive ? 'default' : 'secondary'}>
                            {plan.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => handleToggle(plan)} title="Toggle status">
                              {plan.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                            </Button>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/admin/ecommerce/plans/${plan._id}/edit`}>
                                <Edit2 className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(plan._id)}>
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
