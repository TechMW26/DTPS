"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { formatDateIST, formatDateTimeIST } from '@/lib/utils/formatDateIST';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { UserRole, UserStatus } from "@/types";
import { Copy, Eye, AlertCircle, CheckCircle, Clock, User, Briefcase, Settings, Key, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatUserId } from "@/lib/utils";
import { COUNTRY_CODES } from "@/lib/constants/countries";
import { validateOptionalEmail, validatePhoneNumber } from "@/lib/validations/contact";

interface AdminUser {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  clientStatus?: string; // 'lead', 'active', 'inactive' for clients
  clientId?: string; // Sequential client ID (C-1, C-2, etc.)
  phone?: string;
  avatar?: string;
  password?: string;
  createdAt?: string;
  updatedAt?: string;
  // Additional fields for comprehensive editing
  bio?: string;
  dateOfBirth?: string;
  gender?: string;
  // Professional fields
  credentials?: string[];
  specializations?: string[];
  experience?: number;
  consultationFee?: number;
  timezone?: string;
  // Expected service dates (admin-editable)
  expectedStartDate?: string;
  expectedEndDate?: string;
  // Assignment fields for P/S badges
  assignedDietitian?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  assignedDietitians?: {
    _id: string;
    firstName: string;
    lastName: string;
  }[];
  assignedHealthCounselor?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  assignedHealthCounselors?: {
    _id: string;
    firstName: string;
    lastName: string;
  }[];
  // Payment info for dynamic status calculation
  hasSuccessfulPayment?: boolean;
}

// Helper function to get status display info - unified for all users
function getStatusDisplay(status: UserStatus, clientStatus?: string, role?: UserRole, expectedStartDate?: string, expectedEndDate?: string, hasSuccessfulPayment?: boolean) {
  // Status configuration for all users - unified client-like status
  const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
    'lead': {
      label: 'Lead',
      color: 'text-yellow-700',
      bgColor: 'bg-yellow-100',
      icon: <Clock className="h-4 w-4" />
    },
    'active': {
      label: 'Active',
      color: 'text-emerald-700',
      bgColor: 'bg-emerald-100',
      icon: <CheckCircle className="h-4 w-4" />
    },
    'inactive': {
      label: 'Inactive',
      color: 'text-orange-700',
      bgColor: 'bg-orange-100',
      icon: <AlertCircle className="h-4 w-4" />
    },
    'suspended': {
      label: 'Suspended',
      color: 'text-red-700',
      bgColor: 'bg-red-100',
      icon: <AlertCircle className="h-4 w-4" />
    }
  };

  // For clients, use clientStatus if available, otherwise fall back to account status
  if (role === UserRole.CLIENT) {
    if (clientStatus && statusConfig[clientStatus]) {
      return { status: statusConfig[clientStatus] };
    }
    // Fallback: map account status to client-like status for clients
    const fallback = status === 'suspended' ? 'suspended' : status === 'inactive' ? 'inactive' : 'lead';
    return { status: statusConfig[fallback] };
  }

  // For non-clients (dietitians, health counselors, admins), show account status
  const accountStatus = statusConfig[status] || statusConfig['active'];
  return { status: accountStatus };
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [saving, setSaving] = useState(false);

  // Pagination and counts
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ admins: 0, dietitians: 0, healthCounselors: 0, clients: 0 });

  // Activity dialog state
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityFor, setActivityFor] = useState<AdminUser | null>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Password change dialog state
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Create/Edit form state
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
    role: UserRole.CLIENT as UserRole,
    status: UserStatus.ACTIVE as UserStatus,
    clientStatus: "lead" as string,
    phone: "",
    countryCode: "+91",
    // Additional fields
    bio: "",
    dateOfBirth: "",
    gender: "",
    // Professional fields
    credentials: "",
    specializations: "",
    experience: "",
    consultationFee: "",
    timezone: "Asia/Kolkata",
    // Expected service dates (admin-editable)
    expectedStartDate: "",
    expectedEndDate: "",
  });

  const filtered = useMemo(() => users, [users]);

  async function fetchUsers() {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set('limit', '50');
      params.set('page', String(page));
      if (search.trim()) params.set('search', search.trim());
      if (roleFilter !== 'all') params.set('role', roleFilter);
      const res = await fetch(`/api/users?${params.toString()}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setUsers(data.users || []);
      setPages(data.pagination?.pages || 1);
      setTotal(data.pagination?.total || 0);
      setCounts({
        admins: data.roleCounts?.admin || 0,
        dietitians: data.roleCounts?.dietitian || 0,
        healthCounselors: data.roleCounts?.healthCounselor || 0,
        clients: data.roleCounts?.client || 0,
      });
    } catch (e: any) {
      setError(e?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, [page, search, roleFilter]);



  function openCreate() {
    setEditing(null);
    setForm({
      email: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
      clientStatus: "lead",
      phone: "",
      countryCode: "+91",
      bio: "",
      dateOfBirth: "",
      gender: "",
      credentials: "",
      specializations: "",
      experience: "",
      consultationFee: "",
      timezone: "Asia/Kolkata",
      expectedStartDate: "",
      expectedEndDate: "",
    });
    setOpen(true);
  }

  function openEdit(u: AdminUser) {
    setEditing(u);
    // Extract country code from phone if exists
    let countryCode = "+91";
    let phoneNumber = u.phone || "";
    if (phoneNumber.startsWith("+")) {
      // Try to find matching country code
      const matchedCountry = COUNTRY_CODES.find(c => phoneNumber.startsWith(c.code));
      if (matchedCountry) {
        countryCode = matchedCountry.code;
        phoneNumber = phoneNumber.substring(matchedCountry.code.length);
      }
    }
    setForm({
      email: u.email,
      password: "",
      confirmPassword: "",
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      status: u.status,
      clientStatus: u.clientStatus || "lead",
      phone: phoneNumber,
      countryCode: countryCode,
      bio: u.bio || "",
      dateOfBirth: u.dateOfBirth ? u.dateOfBirth.split('T')[0] : "",
      gender: u.gender || "",
      credentials: u.credentials?.join(', ') || "",
      specializations: u.specializations?.join(', ') || "",
      experience: u.experience?.toString() || "",
      consultationFee: u.consultationFee?.toString() || "",
      timezone: u.timezone || "Asia/Kolkata",
      expectedStartDate: u.expectedStartDate ? u.expectedStartDate.split('T')[0] : "",
      expectedEndDate: u.expectedEndDate ? u.expectedEndDate.split('T')[0] : "",
    });
    setOpen(true);
  }


  async function openActivity(u: AdminUser) {
    setActivityFor(u);
    setActivity([]);
    setActivityLoading(true);
    setActivityOpen(true);
    try {
      const res = await fetch(`/api/admin/users/${u._id}/activity`);
      if (!res.ok) throw new Error((await res.json())?.error || 'Failed to load activity');
      const body = await res.json();
      setActivity(body.activity || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load activity');
    } finally {
      setActivityLoading(false);
    }
  }

  // Password change functions
  function openPasswordDialog(u: AdminUser) {
    setPasswordUser(u);
    setNewPassword("");
    setConfirmNewPassword("");
    setShowPassword(false);
    setPasswordOpen(true);
  }

  async function handleChangePassword() {
    if (!passwordUser) return;

    if (!newPassword || newPassword.length < 4) {
      toast.error("Password must be at least 4 characters");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      toast.error("Passwords do not match");
      return;
    }

    try {
      setPasswordSaving(true);
      const res = await fetch(`/api/admin/users/${passwordUser._id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change password');

      toast.success(data.message || 'Password changed successfully');
      setPasswordOpen(false);
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (e: any) {
      toast.error(e?.message || 'Failed to change password');
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleSave() {
    // Basic validation
    const isClientRole = form.role === UserRole.CLIENT;

    // For clients: email is optional, phone is required
    // For non-clients: email and phone are required
    if (!isClientRole && !form.email) {
      setError("Please fill required fields: email, first name, last name");
      return;
    }
    if (!form.firstName || !form.lastName) {
      setError("Please fill required fields: first name, last name");
      return;
    }
    if (!form.phone) {
      setError("Phone number is required");
      return;
    }

    const emailValidation = validateOptionalEmail(form.email);
    if (!emailValidation.isValid) {
      setError(emailValidation.error || "Please enter a valid email address");
      return;
    }

    const phoneValidation = validatePhoneNumber(`${form.countryCode}${form.phone}`, form.countryCode || '+91');
    if (!phoneValidation.isValid || !phoneValidation.normalized) {
      setError(phoneValidation.error || "Please enter a valid phone number");
      return;
    }

    // Password required only for non-client users when creating new
    if (!editing && !isClientRole && !form.password) {
      setError("Password is required when creating a new staff user");
      return;
    }
    if (!editing && !isClientRole && form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    // Use normalized phone with country code
    const fullPhone = phoneValidation.normalized;

    try {
      setSaving(true);
      setError(null);
      let res: Response;


      if (editing) {
        const body: any = {
          email: emailValidation.normalized,
          firstName: form.firstName,
          lastName: form.lastName,
          role: form.role,
          status: form.status,
          phone: fullPhone,
          // Additional fields
          bio: form.bio || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          gender: form.gender || undefined,
          timezone: form.timezone || undefined,
        };

        // Add client status for clients
        if (form.role === UserRole.CLIENT && form.clientStatus) {
          body.clientStatus = form.clientStatus;
        }

        // Add expected dates for clients (admin-editable)
        if (form.role === UserRole.CLIENT) {
          if (form.expectedStartDate) {
            body.expectedStartDate = form.expectedStartDate;
          }
          if (form.expectedEndDate) {
            body.expectedEndDate = form.expectedEndDate;
          }
        }

        // Add professional fields for dietitians and health counselors
        if (form.role === UserRole.DIETITIAN || form.role === UserRole.HEALTH_COUNSELOR) {
          if (form.credentials) {
            body.credentials = form.credentials.split(',').map((c: string) => c.trim()).filter(Boolean);
          }
          if (form.specializations) {
            body.specializations = form.specializations.split(',').map((s: string) => s.trim()).filter(Boolean);
          }
          if (form.experience) {
            body.experience = parseInt(form.experience);
          }
          if (form.consultationFee) {
            body.consultationFee = parseFloat(form.consultationFee);
          }
        }

        res = await fetch(`/api/users/${editing._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        // For clients: add createdByStaff flag, send email only if provided
        const createBody: any = {
          ...form,
          email: emailValidation.normalized,
          phone: fullPhone,
          createdByStaff: true, // Flag to indicate admin is creating the user
        };
        // Remove email if empty for client users
        if (form.role === UserRole.CLIENT && !form.email) {
          delete createBody.email;
        }
        res = await fetch(`/api/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createBody),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success(editing ? "User updated successfully" : "User created successfully");
      setOpen(false);
      await fetchUsers();
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusToggle(id: string, currentStatus: string) {
    const action = currentStatus === 'active' ? 'deactivate' : 'activate';
    const confirmMsg = currentStatus === 'active'
      ? 'Are you sure you want to deactivate this user?\n\n⚠️ They will be logged out immediately and unable to log in until reactivated.'
      : 'Are you sure you want to reactivate this user?\n\n✓ They will be able to log in again.';

    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Status update failed");
      }

      // Show detailed success message
      const message = data.message || `User ${action}d successfully`;
      toast.success(message);

      // Log detailed action
      console.log(`[Admin Action] User ${action}d:`, {
        userEmail: data.userEmail,
        userName: data.userName,
        userRole: data.userRole,
        newStatus: data.status,
        message: data.message
      });

      await fetchUsers();
    } catch (e: any) {
      const errorMsg = e?.message || "Status update failed";

      // Show detailed error message
      if (currentStatus === 'active') {
        toast.error(`Failed to deactivate: ${errorMsg}`);
      } else {
        toast.error(`Failed to reactivate: ${errorMsg}`);
      }

      setError(errorMsg);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Manage Users</h1>


          <div className="flex gap-2">
            <Input placeholder="Search users..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
            <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">Admins</SelectItem>
                <SelectItem value="dietitian">Dietitians</SelectItem>
                <SelectItem value="health_counselor">Health Counselors</SelectItem>
                <SelectItem value="client">Clients</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={openCreate}>New User</Button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <div className="text-red-600 font-semibold">⚠️ Error</div>
            <div className="flex-1">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
            <button onClick={() => setError('')} className="text-red-600 hover:text-red-800">✕</button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">Dietitians</CardTitle></CardHeader>
            <CardContent className="pt-0"><div className="text-2xl font-semibold">{counts.dietitians}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">Health Counselors</CardTitle></CardHeader>
            <CardContent className="pt-0"><div className="text-2xl font-semibold">{counts.healthCounselors}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">Clients</CardTitle></CardHeader>
            <CardContent className="pt-0"><div className="text-2xl font-semibold">{counts.clients}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">Admins</CardTitle></CardHeader>
            <CardContent className="pt-0"><div className="text-2xl font-semibold">{counts.admins}</div></CardContent>
          </Card>
        </div>

        <div className="text-sm text-gray-600">Page {page} of {pages} · {total} users total</div>


        <Card>
          <CardHeader>
            <CardTitle>All Users</CardTitle>
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
                      <th className="text-left p-3">ID</th>
                      <th className="text-left p-3">Name</th>
                      <th className="text-left p-3">Email</th>
                      <th className="text-left p-3">Role</th>
                      <th className="text-left p-3">Dietitian</th>
                      <th className="text-left p-3">Health Counselor</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-left p-3">Created</th>
                      <th className="text-left p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(u => {
                      const statusDisplay = getStatusDisplay(u.status, u.clientStatus, u.role as UserRole);
                      const roleNames: Record<string, string> = {
                        'admin': 'Admin',
                        'dietitian': 'Dietitian',
                        'health_counselor': 'Health Counselor',
                        'client': 'Client'
                      };

                      // Build dietitian list with P/S badges
                      const primaryDietitian = u.assignedDietitian && typeof u.assignedDietitian === 'object' && u.assignedDietitian.firstName
                        ? u.assignedDietitian
                        : null;
                      const secondaryDietitians = u.assignedDietitians?.filter(d =>
                        d && typeof d === 'object' && d.firstName && d._id !== primaryDietitian?._id
                      ) || [];

                      // Build health counselor list with P/S badges
                      const primaryCounselor = u.assignedHealthCounselor && typeof u.assignedHealthCounselor === 'object' && u.assignedHealthCounselor.firstName
                        ? u.assignedHealthCounselor
                        : null;
                      const secondaryCounselors = u.assignedHealthCounselors?.filter(hc =>
                        hc && typeof hc === 'object' && hc.firstName && hc._id !== primaryCounselor?._id
                      ) || [];

                      return (
                        <tr key={u._id} className="border-b hover:bg-gray-50">
                          <td className="p-3">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${u.role === 'dietitian' ? 'bg-teal-100 text-teal-700' :
                              u.role === 'client' ? 'bg-blue-100 text-blue-700' :
                                u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                                  'bg-orange-100 text-orange-700'
                              }`}>
                              {u.role === 'client' && u.clientId ? u.clientId : formatUserId(u._id, u.role)}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="font-medium">{u.firstName} {u.lastName}</div>
                            <div className="text-xs text-gray-500">{u.phone || '-'}</div>
                          </td>
                          <td className="p-3 text-sm">{u.email}</td>
                          <td className="p-3">
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${u.role === 'dietitian' ? 'bg-teal-100 text-teal-700' :
                              u.role === 'client' ? 'bg-blue-100 text-blue-700' :
                                u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                                  'bg-orange-100 text-orange-700'
                              }`}>
                              {roleNames[u.role] || u.role}
                            </span>
                          </td>
                          {/* Dietitian Column with P/S badges */}
                          <td className="p-3">
                            {u.role === 'client' ? (
                              <div className="space-y-1">
                                {primaryDietitian ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="px-1.5 py-0.5 text-xs font-semibold rounded bg-blue-500 text-white">P</span>
                                    <span className="text-xs text-gray-700">{primaryDietitian.firstName} {primaryDietitian.lastName}</span>
                                  </div>
                                ) : null}
                                {secondaryDietitians.map(d => (
                                  <div key={d._id} className="flex items-center gap-1.5">
                                    <span className="px-1.5 py-0.5 text-xs font-semibold rounded bg-gray-400 text-white">S</span>
                                    <span className="text-xs text-gray-600">{d.firstName} {d.lastName}</span>
                                  </div>
                                ))}
                                {!primaryDietitian && secondaryDietitians.length === 0 && (
                                  <span className="text-xs text-orange-500 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">Unassigned</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          {/* Health Counselor Column with P/S badges */}
                          <td className="p-3">
                            {u.role === 'client' ? (
                              <div className="space-y-1">
                                {primaryCounselor ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="px-1.5 py-0.5 text-xs font-semibold rounded bg-blue-500 text-white">P</span>
                                    <span className="text-xs text-gray-700">{primaryCounselor.firstName} {primaryCounselor.lastName}</span>
                                  </div>
                                ) : null}
                                {secondaryCounselors.map(hc => (
                                  <div key={hc._id} className="flex items-center gap-1.5">
                                    <span className="px-1.5 py-0.5 text-xs font-semibold rounded bg-gray-400 text-white">S</span>
                                    <span className="text-xs text-gray-600">{hc.firstName} {hc.lastName}</span>
                                  </div>
                                ))}
                                {!primaryCounselor && secondaryCounselors.length === 0 && (
                                  <span className="text-xs text-orange-500 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">Unassigned</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="p-3">
                            <Badge className={`flex items-center gap-1 w-fit ${statusDisplay.status.bgColor} ${statusDisplay.status.color} border-0`}>
                              {statusDisplay.status.icon}
                              <span className="text-xs">{statusDisplay.status.label}</span>
                            </Badge>
                          </td>
                          <td className="p-3 text-sm">{u.createdAt ? formatDateIST(u.createdAt) : '-'}</td>
                          <td className="p-3 flex gap-2 flex-wrap">
                            {u.role === 'client' && (
                              <Button
                                variant="outline"
                                size="sm"
                                title="View client dashboard"
                                onClick={() => router.push(`/dietician/clients/${u._id}`)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={() => openEdit(u)}>Edit</Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openPasswordDialog(u)}
                              title="Change Password"
                            >
                              <Key className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openActivity(u)}>Activity</Button>
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-600">
            Showing {(page - 1) * 50 + 1}-{Math.min(page * 50, total)} of {total} users
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={page <= 1 || loading}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, pages) }, (_, i) => {
                const start = Math.max(1, Math.min(pages - 4, page - 2));
                const n = start + i;
                if (n > pages) return null;
                return (
                  <Button
                    key={n}
                    variant={n === page ? "default" : "outline"}
                    size="sm"
                    className="w-8 h-8 p-0 rounded-full"
                    disabled={loading}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              disabled={page >= pages || loading}
              onClick={() => setPage(p => Math.min(pages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {editing ? (
                  <>
                    <Settings className="h-5 w-5" />
                    Edit User: {editing.firstName} {editing.lastName}
                  </>
                ) : (
                  <>
                    <User className="h-5 w-5" />
                    Create New User
                  </>
                )}
              </DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic" className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  Basic Info
                </TabsTrigger>
                <TabsTrigger value="account" className="flex items-center gap-1">
                  <Settings className="h-4 w-4" />
                  Account
                </TabsTrigger>
                <TabsTrigger value="professional" className="flex items-center gap-1">
                  <Briefcase className="h-4 w-4" />
                  Professional
                </TabsTrigger>
              </TabsList>

              {/* Basic Info Tab */}
              <TabsContent value="basic" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">First Name <span className="text-red-500">*</span></label>
                    <Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} placeholder="Enter first name" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Last Name <span className="text-red-500">*</span></label>
                    <Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Enter last name" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-gray-700">
                      Email {form.role !== UserRole.CLIENT && <span className="text-red-500">*</span>}
                      {form.role === UserRole.CLIENT && <span className="text-gray-500 text-xs ml-1">(Optional)</span>}
                    </label>
                    <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="user@example.com" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-gray-700">Phone <span className="text-red-500">*</span></label>
                    <div className="flex gap-2">
                      <Select value={form.countryCode} onValueChange={(v) => setForm(f => ({ ...f, countryCode: v }))}>
                        <SelectTrigger className="w-28">
                          <SelectValue placeholder="Code" />
                        </SelectTrigger>
                        <SelectContent>
                          {COUNTRY_CODES.map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              {c.code} {c.country}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="tel"
                        placeholder="Phone number"
                        value={form.phone}
                        onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 15) }))}
                        className="flex-1"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Date of Birth</label>
                    <Input type="date" value={form.dateOfBirth} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Gender</label>
                    <Select value={form.gender} onValueChange={(v) => setForm(f => ({ ...f, gender: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-gray-700">Bio</label>
                    <Textarea
                      value={form.bio}
                      onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                      placeholder="Enter bio or description..."
                      rows={3}
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Account Tab */}
              <TabsContent value="account" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Password fields: only show for non-client roles when creating new user */}
                  {!editing && form.role !== UserRole.CLIENT && (
                    <>
                      <div className="md:col-span-2">
                        <label className="text-sm font-medium text-gray-700">Password <span className="text-red-500">*</span></label>
                        <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Enter password" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-sm font-medium text-gray-700">Confirm Password <span className="text-red-500">*</span></label>
                        <Input type="password" value={form.confirmPassword} onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))} placeholder="Confirm password" />
                      </div>
                    </>
                  )}
                  {/* Info message for client creation */}
                  {!editing && form.role === UserRole.CLIENT && (
                    <div className="md:col-span-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-sm text-blue-700">
                        <strong>Note:</strong> Password will be auto-generated. Client can log in using WhatsApp OTP with their phone number.
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium text-gray-700">Role <span className="text-red-500">*</span></label>
                    <Select value={form.role} onValueChange={(v) => setForm(f => ({ ...f, role: v as UserRole }))}>
                      <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UserRole.ADMIN}>Admin</SelectItem>
                        <SelectItem value={UserRole.DIETITIAN}>Dietitian</SelectItem>
                        <SelectItem value={UserRole.HEALTH_COUNSELOR}>Health Counselor</SelectItem>
                        <SelectItem value={UserRole.CLIENT}>Client</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Account Status <span className="text-red-500">*</span></label>
                    <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v as UserStatus }))}>
                      <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UserStatus.ACTIVE}>
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-green-500"></span>
                            Active
                          </div>
                        </SelectItem>
                        <SelectItem value={UserStatus.INACTIVE}>
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-orange-500"></span>
                            Inactive (Cannot Login)
                          </div>
                        </SelectItem>
                        <SelectItem value={UserStatus.SUSPENDED}>
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-red-500"></span>
                            Suspended
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-1">
                      {form.status === 'inactive' && "⚠️ User won't be able to log in"}
                      {form.status === 'suspended' && "⚠️ User account is suspended"}
                    </p>
                  </div>
                  {form.role === UserRole.CLIENT && (
                    <div className="md:col-span-2">
                      <label className="text-sm font-medium text-gray-700">Client Status</label>
                      <Select value={form.clientStatus} onValueChange={(v) => setForm(f => ({ ...f, clientStatus: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select client status" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="lead">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-yellow-500"></span>
                              Lead (No Payment Yet)
                            </div>
                          </SelectItem>
                          <SelectItem value="active">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                              Active (Has Active Plan)
                            </div>
                          </SelectItem>
                          <SelectItem value="inactive">
                            <div className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-orange-500"></span>
                              Inactive (Plans Expired)
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500 mt-1">
                        This tracks client engagement status (payment/plan status)
                      </p>
                    </div>
                  )}
                  {/* Expected Service Dates - Only for clients */}
                  {form.role === UserRole.CLIENT && (
                    <>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Expected Start Date</label>
                        <Input
                          type="date"
                          value={form.expectedStartDate}
                          onChange={e => setForm(f => ({ ...f, expectedStartDate: e.target.value }))}
                        />
                        <p className="text-xs text-gray-500 mt-1">Service period start date</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700">Expected End Date</label>
                        <Input
                          type="date"
                          value={form.expectedEndDate}
                          onChange={e => setForm(f => ({ ...f, expectedEndDate: e.target.value }))}
                        />
                        <p className="text-xs text-gray-500 mt-1">Service period end date</p>
                      </div>
                      <div className="md:col-span-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-xs text-blue-700">
                          <strong>Note:</strong> Client status is calculated dynamically: <strong>Active</strong> if payment is made AND dates are set AND today is on or before end date. Otherwise shows as <strong>Inactive</strong> or <strong>Lead</strong> (no payment).
                        </p>
                      </div>
                    </>
                  )}
                  <div>
                    <label className="text-sm font-medium text-gray-700">Timezone</label>
                    <Select value={form.timezone} onValueChange={(v) => setForm(f => ({ ...f, timezone: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select timezone" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
                        <SelectItem value="UTC">UTC</SelectItem>
                        <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                        <SelectItem value="America/Los_Angeles">America/Los_Angeles (PST)</SelectItem>
                        <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                        <SelectItem value="Europe/Paris">Europe/Paris (CET)</SelectItem>
                        <SelectItem value="Asia/Dubai">Asia/Dubai (GST)</SelectItem>
                        <SelectItem value="Asia/Singapore">Asia/Singapore (SGT)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {editing && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Account Information</h4>
                    <div className="text-xs text-gray-500 space-y-1">
                      <p>ID: {editing._id}</p>
                      <p>Created: {editing.createdAt ? formatDateTimeIST(editing.createdAt) : 'N/A'}</p>
                      <p>Updated: {editing.updatedAt ? formatDateTimeIST(editing.updatedAt) : 'N/A'}</p>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Professional Tab */}
              <TabsContent value="professional" className="space-y-4 mt-4">
                {form.role === UserRole.CLIENT ? (
                  <div className="text-center py-8 text-gray-500">
                    <Briefcase className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Professional fields are not applicable for clients.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="text-sm font-medium text-gray-700">Credentials</label>
                      <Input
                        value={form.credentials}
                        onChange={e => setForm(f => ({ ...f, credentials: e.target.value }))}
                        placeholder="e.g., RD, CDE, CNS (comma-separated)"
                      />
                      <p className="text-xs text-gray-500 mt-1">Enter credentials separated by commas</p>
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-sm font-medium text-gray-700">Specializations</label>
                      <Input
                        value={form.specializations}
                        onChange={e => setForm(f => ({ ...f, specializations: e.target.value }))}
                        placeholder="e.g., Weight Loss, Diabetes Management, Sports Nutrition (comma-separated)"
                      />
                      <p className="text-xs text-gray-500 mt-1">Enter specializations separated by commas</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Experience (Years)</label>
                      <Input
                        type="number"
                        min="0"
                        value={form.experience}
                        onChange={e => setForm(f => ({ ...f, experience: e.target.value }))}
                        placeholder="Years of experience"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Consultation Fee (₹)</label>
                      <Input
                        type="number"
                        min="0"
                        value={form.consultationFee}
                        onChange={e => setForm(f => ({ ...f, consultationFee: e.target.value }))}
                        placeholder="Consultation fee"
                      />
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <DialogFooter className="mt-6">
              <Button variant="outline" onClick={() => { setOpen(false); setError(null); }}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <LoadingSpinner className="h-4 w-4 mr-2" />
                    Saving...
                  </>
                ) : (
                  editing ? 'Update User' : 'Create User'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={activityOpen} onOpenChange={setActivityOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>User Activity{activityFor ? ` — ${activityFor.firstName} ${activityFor.lastName}` : ''}</DialogTitle>
            </DialogHeader>
            {activityLoading ? (
              <div className="py-8 flex items-center justify-center"><LoadingSpinner /></div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto">
                {activity.length === 0 ? (
                  <div className="text-sm text-gray-500">No recent activity</div>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {activity.map((a, idx) => (
                      <li key={idx} className="p-2 border rounded">
                        <div className="font-medium capitalize">{a.kind.replace('_', ' ')}</div>
                        <div className="text-xs text-gray-500">{formatDateTimeIST(a.at)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setActivityOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Password Change Dialog */}
        <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Change Password
              </DialogTitle>
            </DialogHeader>

            {passwordUser && (
              <div className="space-y-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">
                    Changing password for: <span className="font-medium text-gray-900">{passwordUser.firstName} {passwordUser.lastName}</span>
                  </p>
                  <p className="text-xs text-gray-500">{passwordUser.email}</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700">New Password</label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password (min 4 characters)"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700">Confirm Password</label>
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Confirm new password"
                    />
                  </div>

                  {newPassword && confirmNewPassword && newPassword !== confirmNewPassword && (
                    <p className="text-sm text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      Passwords do not match
                    </p>
                  )}

                  {newPassword && newPassword.length < 4 && (
                    <p className="text-sm text-amber-500 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      Password must be at least 4 characters
                    </p>
                  )}
                </div>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setPasswordOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleChangePassword}
                disabled={passwordSaving || !newPassword || newPassword.length < 4 || newPassword !== confirmNewPassword}
              >
                {passwordSaving ? (
                  <>
                    <LoadingSpinner className="h-4 w-4 mr-2" />
                    Saving...
                  </>
                ) : (
                  'Change Password'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
}

