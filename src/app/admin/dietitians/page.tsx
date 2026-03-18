"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { UserRole, UserStatus } from "@/types";
import { useDataRefresh, emitDataChange, DataEventTypes } from "@/lib/events/useDataRefresh";

interface Dietitian {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  bio?: string;
  experience?: number;
  consultationFee?: number;
  specializations?: string[];
  credentials?: string[];
  status: string;
}

export default function AdminDietitiansPage() {
  const router = useRouter();
  const [data, setData] = useState<Dietitian[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Dietitian | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    bio: "",
    experience: 0,
    consultationFee: 0,
    specializations: "",
    credentials: "",
    role: UserRole.DIETITIAN as string,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(u =>
      u.email.toLowerCase().includes(q) ||
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q)
    );
  }, [data, search]);

  async function fetchDietitians() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/users/dietitians`);
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      setData(body.dietitians || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load dietitians");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchDietitians(); }, []);

  // Subscribe to real-time dietitians updates
  useDataRefresh(DataEventTypes.DIETITIANS_UPDATED, fetchDietitians, [fetchDietitians]);

  function openCreate() {
    setEditing(null);
    setForm({ email: "", password: "", firstName: "", lastName: "", bio: "", experience: 0, consultationFee: 0, specializations: "", credentials: "", role: UserRole.DIETITIAN });
    setOpen(true);
  }

  function openEdit(u: Dietitian) {
    setEditing(u);
    setForm({
      email: u.email,
      password: "",
      firstName: u.firstName,
      lastName: u.lastName,
      bio: u.bio || "",
      experience: u.experience || 0,
      consultationFee: u.consultationFee || 0,
      specializations: (u.specializations || []).join(", "),
      credentials: (u.credentials || []).join(", "),
      role: (u as any).role || UserRole.DIETITIAN,
    });
    setOpen(true);
  }

  async function handleSave() {
    if (!form.email || !form.firstName || !form.lastName) {
      setError("Please fill required fields: email, first name, last name");
      return;
    }
    if (!editing && !form.password) {
      setError("Password is required when creating a new dietitian");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      let res: Response;
      const payload: any = {
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
        role: form.role || UserRole.DIETITIAN,
        bio: form.bio || undefined,
        experience: Number(form.experience) || 0,
        consultationFee: Number(form.consultationFee) || 0,
        specializations: form.specializations ? form.specializations.split(/\s*,\s*/) : [],
        credentials: form.credentials ? form.credentials.split(/\s*,\s*/) : [],
      };

      if (editing) {
        res = await fetch(`/api/users/${editing._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, password: form.password }),
        });
      }

      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      setOpen(false);
      await fetchDietitians();
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusToggle(id: string, currentStatus: string) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const action = newStatus === 'active' ? 'activate' : 'deactivate';

    if (!confirm(`Are you sure you want to ${action} this dietitian?`)) return;

    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Status update failed');
      }

      const updatedDietitian = await res.json();

      // Update local state immediately
      setData(prev => prev.map(d => d._id === id ? updatedDietitian.user : d));

      toast?.success?.(`Dietitian ${action}d successfully`) || console.log(`Dietitian ${action}d`);

      // Emit event for real-time updates
      emitDataChange(DataEventTypes.DIETITIANS_UPDATED);

      // Refresh full list to ensure consistency
      await fetchDietitians();
    } catch (e: any) {
      setError(e?.message || 'Status update failed');
      toast?.error?.(e?.message || 'Status update failed') || console.error(e?.message);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Manage Dietitians</h1>
          <div className="flex gap-2">
            <Input placeholder="Search dietitians..." value={search} onChange={e => setSearch(e.target.value)} />
            <Button onClick={openCreate}>New Dietitian</Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Dietitians</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 flex items-center justify-center"><LoadingSpinner /></div>
            ) : error ? (
              <div className="text-red-600 text-sm">{error}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-3">Name</th>
                      <th className="text-left p-3">Email</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-left p-3">Experience</th>
                      <th className="text-left p-3">Fee</th>
                      <th className="text-left p-3">Specializations</th>
                      <th className="text-left p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(u => (
                      <tr
                        key={u._id}
                        className="border-b hover:bg-gray-50 cursor-pointer"
                        onClick={() => router.push(`/admin/dietitians/${u._id}`)}
                      >
                        <td className="p-3">{u.firstName} {u.lastName}</td>
                        <td className="p-3">{u.email}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${u.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                            }`}>
                            {u.status || 'active'}
                          </span>
                        </td>
                        <td className="p-3">{u.experience || 0} yrs</td>
                        <td className="p-3">{u.consultationFee ? `₹${u.consultationFee}` : '-'}</td>
                        <td className="p-3 truncate max-w-xs">{(u.specializations || []).join(', ')}</td>
                        <td className="p-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button variant="outline" size="sm" onClick={() => router.push(`/admin/dietitians/${u._id}`)}>View</Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200"
                            onClick={() => router.push(`/dashboard/dietitian?viewAs=${u._id}`)}
                          >
                            Dashboard
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openEdit(u)}>Edit</Button>
                          <Button
                            variant={u.status === 'active' ? 'destructive' : 'default'}
                            size="sm"
                            onClick={() => handleStatusToggle(u._id, u.status)}
                            className={u.status === 'inactive' ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
                          >
                            {u.status === 'active' ? 'Deactivate' : 'Activate'}
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

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Dietitian" : "Create Dietitian"}</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-sm text-gray-600">Role</label>
                <Select value={form.role} onValueChange={(v) => setForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UserRole.DIETITIAN}>Dietitian</SelectItem>
                    <SelectItem value={UserRole.HEALTH_COUNSELOR}>Health Counselor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <label className="text-sm text-gray-600">Email</label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              {!editing && (
                <div className="col-span-2">
                  <label className="text-sm text-gray-600">Password</label>
                  <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                </div>
              )}
              <div>
                <label className="text-sm text-gray-600">First Name</label>
                <Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm text-gray-600">Last Name</label>
                <Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">Bio</label>
                <Textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm text-gray-600">Experience (years)</label>
                <Input type="number" value={form.experience} onChange={e => setForm(f => ({ ...f, experience: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="text-sm text-gray-600">Consultation Fee</label>
                <Input type="number" value={form.consultationFee} onChange={e => setForm(f => ({ ...f, consultationFee: Number(e.target.value) }))} />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">Specializations (comma separated)</label>
                <Input value={form.specializations} onChange={e => setForm(f => ({ ...f, specializations: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">Credentials (comma separated)</label>
                <Input value={form.credentials} onChange={e => setForm(f => ({ ...f, credentials: e.target.value }))} />
              </div>
            </div>

            {error && <div className="text-sm text-red-600 mt-2">{error}</div>}

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

