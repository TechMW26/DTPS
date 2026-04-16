"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { UserRole, UserStatus } from "@/types";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getClientId, getDietitianId, getHealthCounselorId } from "@/lib/utils";
import { validateEmail } from "@/lib/validations/auth";

interface Client {
  _id: string;
  clientId?: string; // Sequential client ID (C-1, C-2, etc.)
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  gender?: string;
  dateOfBirth?: string;
  onboardingCompleted?: boolean;
  assignedDietitian?: string | {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  assignedDietitians?: Array<{
    _id: string;
    firstName: string;
    lastName: string;
    email?: string;
  }>;
  assignedHealthCounselor?: string | {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  assignedHealthCounselors?: Array<{
    _id: string;
    firstName: string;
    lastName: string;
    email?: string;
  }>;
  status: string;
}

export default function AdminClientsPage() {
  const [data, setData] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);
  const [dietitians, setDietitians] = useState<{ _id: string; firstName: string; lastName: string; }[]>([]);
  const [healthCounselors, setHealthCounselors] = useState<{ _id: string; firstName: string; lastName: string; }[]>([]);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assigningClient, setAssigningClient] = useState<Client | null>(null);
  const [selectedDietitianId, setSelectedDietitianId] = useState("");
  const [selectedHealthCounselorId, setSelectedHealthCounselorId] = useState("");
  const [assignType, setAssignType] = useState<'dietitian' | 'healthCounselor'>('dietitian');
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalClients, setTotalClients] = useState(0);
  const itemsPerPage = 20;

  const [form, setForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    gender: "",
    dateOfBirth: "",
    assignedDietitian: "",
  });

  const filtered = data; // No client-side filtering, use API search instead

  async function fetchClients(page = 1, searchQuery = '', status = statusFilter) {
    try {
      setLoading(true);
      setError(null);
      const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : '';
      const statusParam = status ? `&status=${encodeURIComponent(status)}` : '';
      const res = await fetch(`/api/users/clients?limit=${itemsPerPage}&page=${page}${searchParam}${statusParam}`);
      if (!res.ok) throw new Error(await res.text());
      const body = await res.json();
      setData(body.clients || []);
      setTotalClients(body.pagination?.total || 0);
      setTotalPages(body.pagination?.pages || 1);
      setCurrentPage(page);
    } catch (e: any) {
      setError(e?.message || "Failed to load clients");
    } finally {
      setLoading(false);
    }
  }

  async function fetchDietitians() {
    try {
      const res = await fetch(`/api/users/dietitians`);
      if (!res.ok) return;
      const body = await res.json();
      setDietitians((body.dietitians || []).map((d: any) => ({ _id: d._id, firstName: d.firstName, lastName: d.lastName })));
    } catch { }
  }

  async function fetchHealthCounselors() {
    try {
      const res = await fetch(`/api/users?role=health-counselor`);
      if (!res.ok) return;
      const body = await res.json();
      setHealthCounselors((body.users || []).map((u: any) => ({ _id: u._id, firstName: u.firstName, lastName: u.lastName })));
    } catch { }
  }

  useEffect(() => { fetchClients(); fetchDietitians(); fetchHealthCounselors(); }, []);

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchClients(1, search, statusFilter);
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [search, statusFilter]);

  function openCreate() {
    setEditing(null);
    setForm({ email: "", firstName: "", lastName: "", phone: "", gender: "", dateOfBirth: "", assignedDietitian: "" });
    setOpen(true);
  }

  function openEdit(u: Client) {
    setEditing(u);
    const dietitianId = typeof u.assignedDietitian === 'string'
      ? u.assignedDietitian
      : u.assignedDietitian?._id || "";
    setForm({
      email: u.email || "",
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone || "",
      gender: u.gender || "",
      dateOfBirth: u.dateOfBirth ? u.dateOfBirth.substring(0, 10) : "",
      assignedDietitian: dietitianId,
    });
    setOpen(true);
  }

  async function handleSave() {
    // Validate email only if provided
    if (form.email) {
      const emailValidation = validateEmail(form.email);
      if (!emailValidation.isValid) {
        setError(emailValidation.error || 'Invalid email');
        return;
      }
    }

    if (!form.firstName || !form.lastName || !form.phone) {
      setError("Please fill required fields: first name, last name, and phone number");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      let res: Response;
      const payload: any = {
        email: form.email || undefined,
        firstName: form.firstName,
        lastName: form.lastName,
        role: UserRole.CLIENT,
        phone: form.phone,
        gender: form.gender || undefined,
        dateOfBirth: form.dateOfBirth ? new Date(form.dateOfBirth) : undefined,
        assignedDietitian: form.assignedDietitian || undefined,
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
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      setOpen(false);
      await fetchClients();
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusToggle(id: string, currentStatus: string) {
    const action = currentStatus === 'active' ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} this client?`)) return;

    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Status update failed");
      await fetchClients();
    } catch (e: any) {
      setError(e?.message || "Status update failed");
    }
  }

  function openAssignDialog(client: Client, type: 'dietitian' | 'healthCounselor' = 'dietitian') {
    setAssigningClient(client);
    setAssignType(type);

    if (type === 'dietitian') {
      const dietitianId = typeof client.assignedDietitian === 'string'
        ? client.assignedDietitian
        : client.assignedDietitian?._id || "none";
      setSelectedDietitianId(dietitianId || "none");
    } else {
      const hcId = typeof client.assignedHealthCounselor === 'string'
        ? client.assignedHealthCounselor
        : client.assignedHealthCounselor?._id || "none";
      setSelectedHealthCounselorId(hcId || "none");
    }
    setAssignDialogOpen(true);
  }

  async function handleQuickAssign() {
    if (!assigningClient) return;

    try {
      setSaving(true);
      setError(null);

      // Use proper assignment API that handles primary/secondary correctly
      const payload = assignType === 'dietitian'
        ? { dietitianId: selectedDietitianId === "none" ? "" : selectedDietitianId }
        : { healthCounselorId: selectedHealthCounselorId === "none" ? "" : selectedHealthCounselorId };

      const res = await fetch(`/api/admin/clients/${assigningClient._id}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error((await res.json()).error || "Assignment failed");
      setAssignDialogOpen(false);
      await fetchClients();
    } catch (e: any) {
      setError(e?.message || "Assignment failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Manage Clients</h1>
          <div className="flex gap-2 items-center">
            <Input
              placeholder="Search by name, email, phone, client ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-72"
            />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={openCreate}>New Client</Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Clients</CardTitle>
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
                      <th className="text-left p-3">Phone</th>
                      <th className="text-left p-3">Gender</th>
                      <th className="text-left p-3">Onboarding</th>
                      <th className="text-left p-3">Dietitians (Primary + Secondary)</th>
                      <th className="text-left p-3">Health Counselors (Primary + Secondary)</th>
                      <th className="text-left p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(u => (
                      <tr key={u._id} className="border-b hover:bg-gray-50">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span>{u.firstName} {u.lastName}</span>
                            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                              {u.clientId || getClientId(u._id)}
                            </span>
                          </div>
                        </td>
                        <td className="p-3">{u.email}</td>
                        <td className="p-3">{u.phone || '-'}</td>
                        <td className="p-3 capitalize">{u.gender || '-'}</td>
                        <td className="p-3">
                          {u.onboardingCompleted ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Done
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="space-y-1">
                            {/* Primary Dietitian */}
                            {u.assignedDietitian ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs bg-teal-600 text-white px-1.5 py-0.5 rounded font-medium">Primary</span>
                                <span className="text-sm font-medium text-gray-900">
                                  {typeof u.assignedDietitian === 'string'
                                    ? (dietitians.find(d => d._id === u.assignedDietitian)?.firstName + ' ' + (dietitians.find(d => d._id === u.assignedDietitian)?.lastName || ''))
                                    : `${u.assignedDietitian.firstName} ${u.assignedDietitian.lastName}`
                                  }
                                </span>
                                <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded font-medium">
                                  {getDietitianId(typeof u.assignedDietitian === 'string' ? u.assignedDietitian : u.assignedDietitian._id)}
                                </span>
                                <Button variant="ghost" size="sm" onClick={() => openAssignDialog(u, 'dietitian')} className="h-6 px-2 text-xs">
                                  Change
                                </Button>
                              </div>
                            ) : (
                              <Button variant="outline" size="sm" onClick={() => openAssignDialog(u, 'dietitian')} className="h-7 px-3 text-xs">
                                Assign Dietitian
                              </Button>
                            )}
                            {/* Secondary Dietitians */}
                            {u.assignedDietitians && u.assignedDietitians.length > 0 && (
                              <div className="flex items-center gap-2 flex-wrap ml-2">
                                <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded font-medium">Secondary</span>
                                {u.assignedDietitians.map((d) => (
                                  <span key={d._id} className="text-sm text-gray-700">
                                    {d.firstName} {d.lastName}
                                    <span className="text-xs bg-gray-100 text-gray-600 px-1 py-0.5 rounded ml-1">
                                      {getDietitianId(d._id)}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="space-y-1">
                            {/* Primary Health Counselor */}
                            {u.assignedHealthCounselor ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs bg-orange-600 text-white px-1.5 py-0.5 rounded font-medium">Primary</span>
                                <span className="text-sm font-medium text-gray-900">
                                  {typeof u.assignedHealthCounselor === 'string'
                                    ? (healthCounselors.find(hc => hc._id === u.assignedHealthCounselor)?.firstName + ' ' + (healthCounselors.find(hc => hc._id === u.assignedHealthCounselor)?.lastName || ''))
                                    : `${u.assignedHealthCounselor.firstName} ${u.assignedHealthCounselor.lastName}`
                                  }
                                </span>
                                <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">
                                  {getHealthCounselorId(typeof u.assignedHealthCounselor === 'string' ? u.assignedHealthCounselor : u.assignedHealthCounselor._id)}
                                </span>
                                <Button variant="ghost" size="sm" onClick={() => openAssignDialog(u, 'healthCounselor')} className="h-6 px-2 text-xs">
                                  Change
                                </Button>
                              </div>
                            ) : (
                              <Button variant="outline" size="sm" onClick={() => openAssignDialog(u, 'healthCounselor')} className="h-7 px-3 text-xs">
                                Assign HC
                              </Button>
                            )}
                            {/* Secondary Health Counselors */}
                            {u.assignedHealthCounselors && u.assignedHealthCounselors.length > 0 && (
                              <div className="flex items-center gap-2 flex-wrap ml-2">
                                <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">Secondary</span>
                                {u.assignedHealthCounselors.map((hc) => (
                                  <span key={hc._id} className="text-sm text-gray-700">
                                    {hc.firstName} {hc.lastName}
                                    <span className="text-xs bg-gray-100 text-gray-600 px-1 py-0.5 rounded ml-1">
                                      {getHealthCounselorId(hc._id)}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-3 flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(u)}>Edit</Button>
                          <Button
                            variant={u.status === 'active' ? 'outline' : 'outline'}
                            size="sm"
                            onClick={() => handleStatusToggle(u._id, u.status)}
                            className={u.status === 'inactive'
                              ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                              : 'border-gray-300 text-gray-700 hover:bg-gray-50'}
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

            {/* Pagination */}
            {!loading && totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-gray-600">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalClients)} of {totalClients} clients
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchClients(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => fetchClients(pageNum)}
                          className="w-10"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchClients(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Client" : "Create Client"}</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-600">First Name <span className="text-red-500">*</span></label>
                <Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm text-gray-600">Last Name <span className="text-red-500">*</span></label>
                <Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-sm text-gray-600">Phone / WhatsApp <span className="text-red-500">*</span></label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91XXXXXXXXXX" />
              </div>
              <div className="col-span-2">
                <label className="text-sm text-gray-600">Email (Optional)</label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={e => {
                    setForm(f => ({ ...f, email: e.target.value }));
                    // Clear error when user starts typing
                    if (error && error.includes('email')) setError(null);
                  }}
                  placeholder="client@example.com"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Gender</label>
                <Select value={form.gender} onValueChange={(v) => setForm(f => ({ ...f, gender: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-gray-600">Date of Birth</label>
                <Input type="date" value={form.dateOfBirth} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm text-gray-600">Assigned Dietitian</label>
                <Select value={form.assignedDietitian} onValueChange={(v) => setForm(f => ({ ...f, assignedDietitian: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select dietitian (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {dietitians.map(d => (
                      <SelectItem key={d._id} value={d._id}>{d.firstName} {d.lastName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && <div className="text-sm text-red-600 mt-2">{error}</div>}

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Quick Assign Dietitian/Health Counselor Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Assign {assignType === 'dietitian' ? 'Dietitian' : 'Health Counselor'} to {assigningClient?.firstName} {assigningClient?.lastName}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Select {assignType === 'dietitian' ? 'Dietitian' : 'Health Counselor'}
                </label>
                {assignType === 'dietitian' ? (
                  <Select value={selectedDietitianId} onValueChange={setSelectedDietitianId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a dietitian" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (Unassign)</SelectItem>
                      {dietitians.map(d => (
                        <SelectItem key={d._id} value={d._id}>
                          {d.firstName} {d.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={selectedHealthCounselorId} onValueChange={setSelectedHealthCounselorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a health counselor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (Unassign)</SelectItem>
                      {healthCounselors.map(hc => (
                        <SelectItem key={hc._id} value={hc._id}>
                          {hc.firstName} {hc.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {assignType === 'dietitian' && selectedDietitianId && selectedDietitianId !== "none" && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-sm text-slate-700">
                    <strong>{assigningClient?.firstName}</strong> will be assigned to{' '}
                    <strong>{dietitians.find(d => d._id === selectedDietitianId)?.firstName} {dietitians.find(d => d._id === selectedDietitianId)?.lastName}</strong>
                  </p>
                </div>
              )}

              {assignType === 'healthCounselor' && selectedHealthCounselorId && selectedHealthCounselorId !== "none" && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-sm text-slate-700">
                    <strong>{assigningClient?.firstName}</strong> will be assigned to{' '}
                    <strong>{healthCounselors.find(hc => hc._id === selectedHealthCounselorId)?.firstName} {healthCounselors.find(hc => hc._id === selectedHealthCounselorId)?.lastName}</strong>
                  </p>
                </div>
              )}

              {((assignType === 'dietitian' && selectedDietitianId === "none" && assigningClient?.assignedDietitian) ||
                (assignType === 'healthCounselor' && selectedHealthCounselorId === "none" && assigningClient?.assignedHealthCounselor)) && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                    <p className="text-sm text-orange-700">
                      This will unassign the current {assignType === 'dietitian' ? 'dietitian' : 'health counselor'} from <strong>{assigningClient?.firstName}</strong>
                    </p>
                  </div>
                )}
            </div>

            {error && <div className="text-sm text-red-600 mt-2">{error}</div>}

            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleQuickAssign} disabled={saving}>
                {saving ? 'Assigning...' : 'Assign'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

