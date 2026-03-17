'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { ExternalLink, RefreshCw, Search, Users, Plus, UserPlus } from 'lucide-react';
import { validateEmail } from '@/lib/validations/auth';
import Link from 'next/link';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { getClientId } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';

interface Tag {
  _id: string;
  name: string;
  color?: string;
  icon?: string;
}

interface Dietitian {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string;
}

interface HealthCounselor {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string;
}

interface Client {
  _id: string;
  clientId?: string; // Sequential client ID (C-1, C-2, etc.)
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string;
  phone?: string;
  status: string;
  clientStatus?: 'lead' | 'active' | 'inactive';
  createdAt: string;
  healthGoals?: string[];
  tags?: Tag[];
  programStart?: string;
  programEnd?: string;
  lastDiet?: string;
  assignedDietitian?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  assignedDietitians?: Array<{
    _id: string;
    firstName: string;
    lastName: string;
  }>;
  createdBy?: {
    userId?: {
      _id: string;
      firstName?: string;
      lastName?: string;
    };
    role?: 'self' | 'dietitian' | 'health_counselor' | 'admin' | '';
  };
}

// Client status colors
const clientStatusColors: Record<string, { bg: string; text: string }> = {
  lead: { bg: 'bg-blue-100', text: 'text-blue-800' },
  active: { bg: 'bg-green-100', text: 'text-green-800' },
  inactive: { bg: 'bg-gray-100', text: 'text-gray-800' },
};

export default function HealthCounselorClientsPage() {
  const { data: session, status } = useSession();
  const urlSearchParams = useSearchParams();
  const viewAs = urlSearchParams.get('viewAs') || '';
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterFreeze, setFilterFreeze] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [selectedClients, setSelectedClients] = useState<string[]>([]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalClients, setTotalClients] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Create client dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
    gender: '',
    dateOfBirth: '',
  });

  // Tag management state
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [selectedClientForTag, setSelectedClientForTag] = useState<string | null>(null);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

  // Permission-based assignment state
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const canAssignDietitians = hasPermission('assign_clients_to_dietitians');
  const canAssignHealthCounselors = hasPermission('assign_clients_to_health_counselors');
  const canAssign = canAssignDietitians || canAssignHealthCounselors;

  // Assignment dialog state
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedClientForAssign, setSelectedClientForAssign] = useState<Client | null>(null);
  const [availableDietitians, setAvailableDietitians] = useState<Dietitian[]>([]);
  const [availableHealthCounselors, setAvailableHealthCounselors] = useState<HealthCounselor[]>([]);
  const [selectedDietitianId, setSelectedDietitianId] = useState('');
  const [selectedHealthCounselorId, setSelectedHealthCounselorId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignMode, setAssignMode] = useState<'add' | 'replace'>('add');

  // Fetch available staff for assignment
  const fetchAvailableStaff = useCallback(async (clientId: string) => {
    try {
      const response = await fetch(`/api/clients/${clientId}/assign`);
      if (response.ok) {
        const data = await response.json();
        if (data.dietitians) setAvailableDietitians(data.dietitians);
        if (data.healthCounselors) setAvailableHealthCounselors(data.healthCounselors);
      }
    } catch (error) {
      console.error('Error fetching staff:', error);
    }
  }, []);

  // Open assignment dialog
  const openAssignDialog = async (client: Client) => {
    setSelectedClientForAssign(client);
    setSelectedDietitianId('');
    setSelectedHealthCounselorId('');
    setAssignMode('add');
    setAssignDialogOpen(true);
    await fetchAvailableStaff(client._id);
  };

  // Handle assignment
  const handleAssign = async () => {
    if (!selectedClientForAssign) return;

    try {
      setAssigning(true);
      const payload: any = { mode: assignMode };

      if (selectedDietitianId && canAssignDietitians) {
        payload.dietitianId = selectedDietitianId;
      }
      if (selectedHealthCounselorId && canAssignHealthCounselors) {
        payload.healthCounselorId = selectedHealthCounselorId;
      }

      const response = await fetch(`/api/clients/${selectedClientForAssign._id}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(data.message || 'Assignment updated successfully');

        // Update local state
        if (data.client) {
          setClients(prev => prev.map(c =>
            c._id === data.client._id ? { ...c, ...data.client } : c
          ));
        }

        setAssignDialogOpen(false);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to update assignment');
      }
    } catch (error) {
      console.error('Error assigning:', error);
      toast.error('Failed to update assignment');
    } finally {
      setAssigning(false);
    }
  };

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Only fetch when session is authenticated and user ID is available
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      fetchMyClients(currentPage, pageSize, debouncedSearch);
    } else if (status === 'unauthenticated') {
      setLoading(false);
    }
    // While loading session, keep loading state true
  }, [status, session?.user?.id, currentPage, pageSize, debouncedSearch, viewAs]);

  const fetchMyClients = async (page = 1, limit = 50, search = '') => {
    try {
      setLoading(true);
      // Fetch clients with pagination and server-side search
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search.trim()) params.set('search', search.trim());
      if (viewAs) params.set('viewAs', viewAs);
      const response = await fetch(`/api/users/clients?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setClients(data.clients || []);
        setTotalClients(data.pagination?.total || 0);
        setTotalPages(data.pagination?.pages || 1);
        // Also fetch available tags
        fetchAvailableTags();
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableTags = async () => {
    try {
      const response = await fetch('/api/admin/tags');
      if (response.ok) {
        const data = await response.json();
        // Filter tags to only show those created by health counselor
        const hcTags = data.tags?.filter((tag: Tag) =>
          tag._id && typeof tag.name === 'string'
        ) || [];
        setAvailableTags(hcTags);
      }
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  };

  const handleAssignTag = async () => {
    if (!selectedClientForTag || !selectedTagId) {
      toast.error('Please select both client and tag');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`/api/users/${selectedClientForTag}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tags: [selectedTagId], // Only one tag allowed
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to assign tag');
      }

      toast.success('Tag assigned successfully');
      setTagDialogOpen(false);
      setSelectedClientForTag(null);
      setSelectedTagId(null);
      await fetchMyClients();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to assign tag');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateClient = async () => {
    // Validate email first
    const emailValidation = validateEmail(createForm.email);
    if (!emailValidation.isValid) {
      setEmailError(emailValidation.error || 'Invalid email');
      return;
    }
    setEmailError('');

    if (!createForm.email || !createForm.firstName || !createForm.lastName || !createForm.password) {
      toast.error('Please fill required fields: email, first name, last name, and password');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        email: createForm.email,
        password: createForm.password,
        firstName: createForm.firstName,
        lastName: createForm.lastName,
        phone: createForm.phone || undefined,
        gender: createForm.gender || undefined,
        dateOfBirth: createForm.dateOfBirth ? new Date(createForm.dateOfBirth) : undefined,
        role: 'client',
        // Auto-assign to the current health counselor
        assignedHealthCounselor: (session?.user as any)?.id || (session?.user as any)?._id || undefined,
      };

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to create client');
      }

      toast.success('Client created successfully');
      setCreateDialogOpen(false);
      setCreateForm({
        email: '',
        password: '',
        firstName: '',
        lastName: '',
        phone: '',
        gender: '',
        dateOfBirth: '',
      });
      setCurrentPage(1);
      await fetchMyClients(1, pageSize, debouncedSearch);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create client');
    } finally {
      setSaving(false);
    }
  };

  const handleClientStatusChange = async (clientId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/users/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientStatus: newStatus }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to update status');
      }

      // Update local state
      setClients(prev => prev.map(client =>
        client._id === clientId
          ? { ...client, clientStatus: newStatus as Client['clientStatus'] }
          : client
      ));

      toast.success(`Client status updated to ${newStatus}`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update client status');
    }
  };

  const filteredClients = clients.filter(client => {
    // Filter by client status only (search is now server-side)
    const matchesStatus = filterType === 'all' ||
      (client.clientStatus || 'lead') === filterType;

    return matchesStatus;
  });

  const toggleClientSelection = (clientId: string) => {
    setSelectedClients(prev =>
      prev.includes(clientId)
        ? prev.filter(id => id !== clientId)
        : [...prev, clientId]
    );
  };

  const toggleAllClients = () => {
    setSelectedClients(prev =>
      prev.length === clients.length
        ? []
        : clients.map(c => c._id)
    );
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'N/A';
      return format(date, 'MMM d, yyyy');
    } catch (error) {
      return 'N/A';
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Clients</h1>
            <p className="text-gray-600 mt-1">
              Manage your assigned clients
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Create Client
            </Button>
            <div className="flex items-center space-x-2 px-4 py-2 bg-blue-50 rounded-lg border border-blue-200">
              <Users className="h-5 w-5 text-blue-600" />
              <span className="text-blue-900 font-semibold">{totalClients} Clients</span>
            </div>
          </div>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="p-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search clients by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>
        {/* Header with Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
              Bulk Action
            </Button>
            <Select value={filterFreeze} onValueChange={setFilterFreeze}>
              <SelectTrigger className="w-45 h-9">
                <SelectValue placeholder="Filter Freeze" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="freeze">Freeze</SelectItem>
                <SelectItem value="active">Active</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-45 h-9">
                <SelectValue placeholder="Client Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button size="sm" variant="ghost" onClick={() => fetchMyClients(currentPage, pageSize, debouncedSearch)}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <LoadingSpinner />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="w-10 px-3">
                          <Checkbox
                            checked={selectedClients.length === clients.length && clients.length > 0}
                            onCheckedChange={toggleAllClients}
                          />
                        </TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">C-Id</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Name</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Phone</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Email</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Created By</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Assigned Dietitian</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Tags</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Status</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Start</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">End</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Last Diet</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Joined</TableHead>
                        {canAssign && (
                          <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Actions</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clients.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={canAssign ? 14 : 13} className="text-center py-12 text-gray-500">
                            No clients found
                          </TableCell>
                        </TableRow>
                      ) : (
                        clients.map((client) => (
                          <TableRow key={client._id} className="hover:bg-gray-50">
                            <TableCell className="px-3">
                              <Checkbox
                                checked={selectedClients.includes(client._id)}
                                onCheckedChange={() => toggleClientSelection(client._id)}
                              />
                            </TableCell>
                            <TableCell className="px-3">
                              <Link
                                href={`/health-counselor/clients/${client._id}`}
                                className="text-blue-600 hover:underline font-medium text-sm"
                              >
                                {client.clientId || getClientId(client._id)}
                              </Link>
                            </TableCell>
                            <TableCell className="px-3">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-sm whitespace-nowrap">{client.firstName} {client.lastName}</span>
                                <span className="text-xs bg-blue-100 text-blue-700 px-1 py-0.5 rounded font-medium">
                                  {client.clientId || getClientId(client._id)}
                                </span>
                                <Link href={`/health-counselor/clients/${client._id}`}>
                                  <ExternalLink className="h-3 w-3 text-gray-400 hover:text-gray-600" />
                                </Link>
                              </div>
                            </TableCell>
                            <TableCell className="px-3 text-sm whitespace-nowrap">{client.phone || '-'}</TableCell>
                            <TableCell className="px-3 max-w-37.5 truncate text-sm">{client.email}</TableCell>
                            <TableCell className="px-3">
                              {client.createdBy?.role ? (
                                <div className="flex flex-col gap-0.5">
                                  {client.createdBy.role === 'self' ? (
                                    <Badge variant="outline" className="text-xs bg-gray-50 text-gray-700">
                                      Self Registered
                                    </Badge>
                                  ) : client.createdBy.role === 'dietitian' ? (
                                    <>
                                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">
                                        By Dietitian
                                      </Badge>
                                      {client.createdBy.userId && (
                                        <span className="text-xs text-gray-500">
                                          {client.createdBy.userId.firstName} {client.createdBy.userId.lastName}
                                        </span>
                                      )}
                                    </>
                                  ) : client.createdBy.role === 'health_counselor' ? (
                                    <>
                                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                                        By Health Counselor
                                      </Badge>
                                      {client.createdBy.userId && (
                                        <span className="text-xs text-gray-500">
                                          {client.createdBy.userId.firstName} {client.createdBy.userId.lastName}
                                        </span>
                                      )}
                                    </>
                                  ) : client.createdBy.role === 'admin' ? (
                                    <>
                                      <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700">
                                        By Admin
                                      </Badge>
                                      {client.createdBy.userId && (
                                        <span className="text-xs text-gray-500">
                                          {client.createdBy.userId.firstName} {client.createdBy.userId.lastName}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-xs text-gray-400">-</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </TableCell>
                            <TableCell className="px-3">
                              {(() => {
                                // Check singular first
                                if (client.assignedDietitian?.firstName || client.assignedDietitian?.lastName) {
                                  return (
                                    <div className="flex flex-col gap-1">
                                      <span className="text-sm font-medium text-gray-900">
                                        Dt. {client.assignedDietitian.firstName} {client.assignedDietitian.lastName}
                                      </span>
                                    </div>
                                  );
                                }
                                // Check plural array
                                if (client.assignedDietitians && client.assignedDietitians.length > 0) {
                                  const dietitians = client.assignedDietitians.filter(d => d?.firstName || d?.lastName);
                                  if (dietitians.length > 0) {
                                    return (
                                      <div className="flex flex-col gap-1">
                                        <span className="text-sm font-medium text-gray-900">
                                          Dt. {dietitians[0].firstName} {dietitians[0].lastName}
                                          {dietitians.length > 1 && <span className="text-xs text-gray-500"> +{dietitians.length - 1}</span>}
                                        </span>
                                      </div>
                                    );
                                  }
                                }
                                return <span className="text-sm text-gray-500">Not Assigned</span>;
                              })()}
                            </TableCell>
                            <TableCell className="px-3">
                              {client.tags && client.tags.length > 0 ? (
                                <div className="flex gap-1">
                                  {client.tags.slice(0, 2).map((tag) => (
                                    <Badge
                                      key={tag._id}
                                      variant="outline"
                                      className="text-xs px-1.5 py-0"
                                      style={tag.color ? { borderColor: tag.color, color: tag.color } : undefined}
                                    >
                                      {tag.name}
                                    </Badge>
                                  ))}
                                </div>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="px-3">
                              {/* Status is automatically computed: LEAD / ACTIVE / INACTIVE */}
                              <Badge
                                variant="outline"
                                className={`text-xs px-2 py-0.5 ${client.clientStatus === 'active' ? 'bg-green-100 text-green-700 border-green-300' :
                                  client.clientStatus === 'inactive' ? 'bg-gray-100 text-gray-700 border-gray-300' :
                                    'bg-blue-100 text-blue-700 border-blue-300'
                                  }`}
                              >
                                <span className="flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full ${client.clientStatus === 'active' ? 'bg-green-500' :
                                    client.clientStatus === 'inactive' ? 'bg-gray-500' :
                                      'bg-blue-500'
                                    }`}></span>
                                  {client.clientStatus === 'active' ? 'Active' : client.clientStatus === 'inactive' ? 'Inactive' : 'Lead'}
                                </span>
                              </Badge>
                            </TableCell>
                            <TableCell className="px-3 text-sm whitespace-nowrap">{client.programStart ? formatDate(client.programStart) : '-'}</TableCell>
                            <TableCell className="px-3 text-sm whitespace-nowrap">{client.programEnd ? formatDate(client.programEnd) : '-'}</TableCell>
                            <TableCell className="px-3 text-sm whitespace-nowrap">{client.lastDiet || '-'}</TableCell>
                            <TableCell className="px-3 text-sm whitespace-nowrap">{formatDate(client.createdAt)}</TableCell>
                            {canAssign && (
                              <TableCell className="px-3">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openAssignDialog(client)}
                                  className="text-xs"
                                >
                                  <UserPlus className="h-3 w-3 mr-1" />
                                  Assign
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t flex items-center justify-between text-sm text-gray-600">
                  <div>
                    Showing {clients.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, totalClients)} of {totalClients} rows
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-xs px-2">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Client Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        setCreateDialogOpen(open);
        if (!open) setEmailError('');
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Client</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-sm text-gray-600">Email <span className="text-red-500">*</span></label>
              <Input
                type="email"
                value={createForm.email}
                onChange={e => {
                  setCreateForm(f => ({ ...f, email: e.target.value }));
                  if (emailError) {
                    const validation = validateEmail(e.target.value);
                    setEmailError(validation.isValid ? '' : validation.error || '');
                  }
                }}
                placeholder="client@example.com"
                className={emailError ? 'border-red-500' : ''}
                autoComplete="off"
              />
              {emailError && <p className="text-sm text-red-500 mt-1">{emailError}</p>}
            </div>
            <div className="col-span-2">
              <label className="text-sm text-gray-600">Password <span className="text-red-500">*</span></label>
              <Input
                type="password"
                value={createForm.password}
                onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Enter password"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600">First Name <span className="text-red-500">*</span></label>
              <Input
                value={createForm.firstName}
                onChange={e => setCreateForm(f => ({ ...f, firstName: e.target.value }))}
                placeholder="First name"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600">Last Name <span className="text-red-500">*</span></label>
              <Input
                value={createForm.lastName}
                onChange={e => setCreateForm(f => ({ ...f, lastName: e.target.value }))}
                placeholder="Last name"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600">Phone</label>
              <Input
                value={createForm.phone}
                onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="Phone number"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600">Gender</label>
              <Select value={createForm.gender} onValueChange={(v) => setCreateForm(f => ({ ...f, gender: v }))}>
                <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-sm text-gray-600">Date of Birth</label>
              <Input
                type="date"
                value={createForm.dateOfBirth}
                onChange={e => setCreateForm(f => ({ ...f, dateOfBirth: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateClient} disabled={saving}>
              {saving ? 'Creating...' : 'Create Client'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assignment Dialog - Permission Based */}
      {canAssign && (
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Assign Staff to Client
              </DialogTitle>
              <DialogDescription>
                {selectedClientForAssign && (
                  <>Assign staff to {selectedClientForAssign.firstName} {selectedClientForAssign.lastName}</>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Assignment Mode */}
              <div>
                <label className="text-sm font-medium text-gray-700">Assignment Mode</label>
                <Select value={assignMode} onValueChange={(v: 'add' | 'replace') => setAssignMode(v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">Add to existing</SelectItem>
                    <SelectItem value="replace">Replace existing</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Dietitian Selection - Only if has permission */}
              {canAssignDietitians && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Assign Dietitian</label>
                  <Select value={selectedDietitianId} onValueChange={setSelectedDietitianId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select a dietitian" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {availableDietitians.map((d) => (
                        <SelectItem key={d._id} value={d._id}>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              {d.avatar && <AvatarImage src={d.avatar} />}
                              <AvatarFallback className="text-xs">
                                {d.firstName?.[0]}{d.lastName?.[0]}
                              </AvatarFallback>
                            </Avatar>
                            <span>Dt. {d.firstName} {d.lastName}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {availableDietitians.length === 0 && (
                    <p className="text-xs text-gray-500 mt-1">No dietitians available</p>
                  )}
                </div>
              )}

              {/* Health Counselor Selection - Only if has permission */}
              {canAssignHealthCounselors && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Assign Health Counselor</label>
                  <Select value={selectedHealthCounselorId} onValueChange={setSelectedHealthCounselorId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select a health counselor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {availableHealthCounselors.map((hc) => (
                        <SelectItem key={hc._id} value={hc._id}>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              {hc.avatar && <AvatarImage src={hc.avatar} />}
                              <AvatarFallback className="text-xs">
                                {hc.firstName?.[0]}{hc.lastName?.[0]}
                              </AvatarFallback>
                            </Avatar>
                            <span>{hc.firstName} {hc.lastName}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {availableHealthCounselors.length === 0 && (
                    <p className="text-xs text-gray-500 mt-1">No health counselors available</p>
                  )}
                </div>
              )}

              {/* Current Assignments Info */}
              {selectedClientForAssign && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs font-medium text-gray-600 mb-2">Current Assignments:</p>
                  <div className="space-y-1 text-xs text-gray-500">
                    <p>
                      Dietitian: {
                        selectedClientForAssign.assignedDietitian?.firstName
                          ? `Dt. ${selectedClientForAssign.assignedDietitian.firstName} ${selectedClientForAssign.assignedDietitian.lastName}`
                          : selectedClientForAssign.assignedDietitians?.[0]?.firstName
                            ? `Dt. ${selectedClientForAssign.assignedDietitians[0].firstName} ${selectedClientForAssign.assignedDietitians[0].lastName}`
                            : 'Not assigned'
                      }
                    </p>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAssign}
                disabled={assigning || (!selectedDietitianId && !selectedHealthCounselorId)}
              >
                {assigning ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Assigning...
                  </>
                ) : (
                  'Assign'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </DashboardLayout>
  );
}
