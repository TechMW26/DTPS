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
import { ExternalLink, RefreshCw, Search, Users, Plus, UserPlus, XCircle } from 'lucide-react';
import { validateEmail } from '@/lib/validations/auth';
import { validatePhoneNumber } from '@/lib/validations/contact';
import { COUNTRY_CODE_OPTIONS } from '@/lib/constants/countries';
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
  isPrimary?: boolean;
  isSecondary?: boolean;
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
  assignedHealthCounselor?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  assignedHealthCounselors?: Array<{
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
    firstName: '',
    lastName: '',
    phone: '',
    gender: '',
    dateOfBirth: '',
  });
  const [createCountryCode, setCreateCountryCode] = useState('+91');

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
  const [primaryDietitianOnly, setPrimaryDietitianOnly] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState('');

  // Primary/Secondary dietitian selection state (like admin)
  const [primaryDietitianId, setPrimaryDietitianId] = useState('');
  const [secondaryDietitianIds, setSecondaryDietitianIds] = useState<string[]>([]);
  const [dietitianSearchTerm, setDietitianSearchTerm] = useState('');
  const [primaryDietitianSearchTerm, setPrimaryDietitianSearchTerm] = useState('');

  // Auto-remove primary from secondary list when primary changes
  useEffect(() => {
    if (primaryDietitianId) {
      setSecondaryDietitianIds(prev => prev.filter(id => id !== primaryDietitianId));
    }
  }, [primaryDietitianId]);

  // Fetch available staff for assignment
  const fetchAvailableStaff = useCallback(async (clientId: string) => {
    try {
      const response = await fetch(`/api/clients/${clientId}/assign`);
      if (response.ok) {
        const data = await response.json();
        if (data.dietitians) {
          // Show all dietitians - we now support full primary/secondary assignment
          setAvailableDietitians(data.dietitians);
        }
        if (data.healthCounselors) setAvailableHealthCounselors(data.healthCounselors);
        setPrimaryDietitianOnly(!!data.primaryDietitianOnly);
        setAssignmentMessage(data.assignmentMessage || '');
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
    setAssignMode('replace');
    setDietitianSearchTerm('');
    setPrimaryDietitianSearchTerm('');

    // Initialize Primary/Secondary from existing assignments
    // Ensure we compare as strings for consistent comparison
    const existingPrimaryDietitian = client.assignedDietitian && typeof client.assignedDietitian === 'object'
      ? String(client.assignedDietitian._id || '') : '';
    setPrimaryDietitianId(existingPrimaryDietitian);

    // Secondary Dietitians (from array, excluding primary) - compare as strings
    const existingSecondaryDietitians = (client.assignedDietitians || [])
      .filter(d => d && typeof d === 'object' && d._id)
      .map(d => String(d._id))
      .filter(id => id !== existingPrimaryDietitian); // Exclude primary from secondary
    setSecondaryDietitianIds(existingSecondaryDietitians);

    setAssignDialogOpen(true);
    await fetchAvailableStaff(client._id);
  };

  // Handle assignment - now supports primary/secondary like admin
  const handleAssign = async () => {
    if (!selectedClientForAssign) return;

    try {
      setAssigning(true);

      // Filter out primary from secondary list before sending (ensure no overlap)
      const filteredSecondaryIds = secondaryDietitianIds.filter(id => id !== primaryDietitianId);

      // Build payload with primary/secondary assignments (same as admin)
      const payload: any = {
        primaryDietitianId: primaryDietitianId || null,
        secondaryDietitianIds: filteredSecondaryIds.length > 0 ? filteredSecondaryIds : [],
        mode: 'primary_secondary'
      };

      // Add health counselor if selected
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
    // Validate email only if provided
    if (createForm.email) {
      const emailValidation = validateEmail(createForm.email);
      if (!emailValidation.isValid) {
        setEmailError(emailValidation.error || 'Invalid email');
        return;
      }
    }
    setEmailError('');

    if (!createForm.firstName || !createForm.lastName || !createForm.phone) {
      toast.error('Please fill required fields: first name, last name, and phone number');
      return;
    }

    const phoneValidation = validatePhoneNumber(`${createCountryCode}${String(createForm.phone).replace(/\D/g, '')}`, createCountryCode);
    if (!phoneValidation.isValid) {
      toast.error(phoneValidation.error || 'Please enter a valid phone number');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        email: createForm.email || undefined,
        firstName: createForm.firstName,
        lastName: createForm.lastName,
        phone: phoneValidation.normalized,
        gender: createForm.gender || undefined,
        dateOfBirth: createForm.dateOfBirth ? new Date(createForm.dateOfBirth) : undefined,
        role: 'client',
        // Backend will auto-assign to the current health counselor based on session
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
        firstName: '',
        lastName: '',
        phone: '',
        gender: '',
        dateOfBirth: '',
      });
      setCreateCountryCode('+91');
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
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Dietitians</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Health Counselors</TableHead>
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
                          <TableCell colSpan={canAssign ? 15 : 14} className="text-center py-12 text-gray-500">
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
                              <div className="space-y-0.5">
                                {/* Primary Dietitian */}
                                {client.assignedDietitian?.firstName || client.assignedDietitian?.lastName ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs bg-teal-600 text-white px-1 py-0.5 rounded font-medium">P</span>
                                    <span className="text-sm font-medium text-gray-900">
                                      {client.assignedDietitian.firstName} {client.assignedDietitian.lastName}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-xs">No primary</span>
                                )}
                                {/* Secondary Dietitians - EXCLUDE primary from this list */}
                                {(() => {
                                  const primaryId = client.assignedDietitian?._id;
                                  const secondaryDietitians = (client.assignedDietitians || [])
                                    .filter(d => d && (d.firstName || d.lastName))
                                    .filter(d => !primaryId || String(d._id) !== String(primaryId));

                                  return secondaryDietitians.length > 0 ? (
                                    <div className="flex items-center gap-1 flex-wrap">
                                      <span className="text-xs bg-teal-100 text-teal-700 px-1 py-0.5 rounded font-medium">S</span>
                                      {secondaryDietitians.map((d, idx, arr) => (
                                        <span key={d._id} className="text-xs text-gray-600">
                                          {d.firstName} {d.lastName}{idx < arr.length - 1 ? ',' : ''}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null;
                                })()}
                              </div>
                            </TableCell>
                            <TableCell className="px-3">
                              <div className="space-y-0.5">
                                {/* Primary Health Counselor */}
                                {client.assignedHealthCounselor?.firstName || client.assignedHealthCounselor?.lastName ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs bg-orange-600 text-white px-1 py-0.5 rounded font-medium">P</span>
                                    <span className="text-sm font-medium text-gray-900">
                                      {client.assignedHealthCounselor.firstName} {client.assignedHealthCounselor.lastName}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-xs">No primary</span>
                                )}
                                {/* Secondary Health Counselors */}
                                {client.assignedHealthCounselors && client.assignedHealthCounselors.length > 0 && (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <span className="text-xs bg-orange-100 text-orange-700 px-1 py-0.5 rounded font-medium">S</span>
                                    {client.assignedHealthCounselors.filter(hc => hc?.firstName || hc?.lastName).map((hc, idx, arr) => (
                                      <span key={hc._id} className="text-xs text-gray-600">
                                        {hc.firstName} {hc.lastName}{idx < arr.length - 1 ? ',' : ''}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
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
            <div className="col-span-2">
              <label className="text-sm text-gray-600">Phone / WhatsApp <span className="text-red-500">*</span></label>
              <div className="flex items-center gap-2">
                <Select value={createCountryCode} onValueChange={setCreateCountryCode}>
                  <SelectTrigger className="w-24">
                    <SelectValue placeholder="Code" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {COUNTRY_CODE_OPTIONS.map((country) => (
                      <SelectItem key={`${country.code}-${country.country}`} value={country.code}>
                        {country.flag} {country.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={createForm.phone}
                  onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 15) }))}
                  placeholder="Phone number"
                />
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-sm text-gray-600">Email (Optional)</label>
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

      {/* Assignment Dialog - Primary/Secondary Selection like Admin */}
      {canAssign && (
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Assign Staff to Client
              </DialogTitle>
              <DialogDescription>
                {selectedClientForAssign && (
                  <>Assign dietitians to {selectedClientForAssign.firstName} {selectedClientForAssign.lastName}</>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Dietitian Assignment Section */}
              {canAssignDietitians && (
                <div className="border rounded-lg p-4 bg-green-50/50">
                  <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-bold">D</span>
                    Dietitian Assignment
                  </h4>

                  {availableDietitians.length === 0 ? (
                    <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                      <p className="text-sm text-yellow-700">No dietitians available.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Primary Dietitian */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-2">
                          <span className="px-2 py-0.5 text-xs font-bold rounded bg-blue-500 text-white">PRIMARY</span>
                          Select Primary Dietitian
                          <span className="text-gray-400 font-normal">(saved to assignedDietitian)</span>
                        </label>
                        <div className="relative mb-2">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input
                            placeholder="Search primary dietitian..."
                            value={primaryDietitianSearchTerm}
                            onChange={(e) => setPrimaryDietitianSearchTerm(e.target.value)}
                            className="pl-9 bg-white"
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto border rounded-lg bg-white">
                          {/* No primary option */}
                          <div
                            className={`flex items-center gap-2 p-2 cursor-pointer transition-colors border-b ${!primaryDietitianId ? 'bg-green-100' : 'hover:bg-gray-50'}`}
                            onClick={() => setPrimaryDietitianId('')}
                          >
                            <input type="radio" checked={!primaryDietitianId} onChange={() => { }} className="h-4 w-4 text-green-600" />
                            <span className="text-gray-400">No primary dietitian</span>
                          </div>
                          {availableDietitians
                            .filter(d => {
                              if (!primaryDietitianSearchTerm.trim()) return true;
                              const searchLower = primaryDietitianSearchTerm.toLowerCase();
                              const fullName = `${d.firstName} ${d.lastName}`.toLowerCase();
                              return fullName.includes(searchLower) || d.email?.toLowerCase().includes(searchLower);
                            })
                            .map((dietitian) => (
                              <div
                                key={dietitian._id}
                                className={`flex items-center gap-2 p-2 cursor-pointer transition-colors ${primaryDietitianId === dietitian._id ? 'bg-green-100 border-l-4 border-l-green-500' : 'hover:bg-gray-50'}`}
                                onClick={() => {
                                  setPrimaryDietitianId(dietitian._id);
                                  // Auto-remove from secondary if being selected as primary
                                  setSecondaryDietitianIds(prev => prev.filter(id => id !== dietitian._id));
                                }}
                              >
                                <input type="radio" checked={primaryDietitianId === dietitian._id} onChange={() => { }} className="h-4 w-4 text-green-600" />
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={dietitian.avatar} />
                                  <AvatarFallback className="bg-green-200 text-green-800 text-xs">
                                    {dietitian.firstName?.[0]}{dietitian.lastName?.[0]}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                  <p className="text-sm font-medium">Dt. {dietitian.firstName} {dietitian.lastName}</p>
                                  <p className="text-xs text-gray-500">{dietitian.email}</p>
                                </div>
                                {dietitian.isPrimary && (
                                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
                                    Current
                                  </Badge>
                                )}
                              </div>
                            ))}
                        </div>
                        {primaryDietitianId && (
                          <div className="flex items-center gap-2 p-2 bg-green-100 rounded-lg border border-green-300">
                            <span className="px-1.5 py-0.5 text-xs font-bold rounded bg-blue-500 text-white">P</span>
                            {(() => {
                              const d = availableDietitians.find(dt => dt._id === primaryDietitianId);
                              return d ? (
                                <>
                                  <Avatar className="h-6 w-6">
                                    <AvatarImage src={d.avatar} />
                                    <AvatarFallback className="bg-green-200 text-green-800 text-xs">
                                      {d.firstName?.[0]}{d.lastName?.[0]}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-sm font-medium">Dt. {d.firstName} {d.lastName}</span>
                                  <span className="text-xs text-gray-500">{d.email}</span>
                                </>
                              ) : null;
                            })()}
                          </div>
                        )}
                      </div>

                      {/* Secondary Dietitians */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-2">
                          <span className="px-2 py-0.5 text-xs font-bold rounded bg-gray-400 text-white">SECONDARY</span>
                          Select Secondary Dietitians
                          <span className="text-gray-400 font-normal">(saved to assignedDietitians array)</span>
                        </label>
                        <div className="relative mb-2">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input
                            placeholder="Search dietitians..."
                            value={dietitianSearchTerm}
                            onChange={(e) => setDietitianSearchTerm(e.target.value)}
                            className="pl-9 bg-white"
                          />
                        </div>
                        <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1 bg-white">
                          {availableDietitians
                            .filter(d => {
                              // Exclude primary dietitian from secondary list (compare as strings)
                              const dietitianId = d._id?.toString() || d._id;
                              return !primaryDietitianId || dietitianId !== primaryDietitianId;
                            })
                            .filter(d => {
                              if (!dietitianSearchTerm.trim()) return true;
                              const searchLower = dietitianSearchTerm.toLowerCase();
                              const fullName = `${d.firstName} ${d.lastName}`.toLowerCase();
                              return fullName.includes(searchLower) || d.email?.toLowerCase().includes(searchLower);
                            })
                            .map((dietitian) => (
                              <div
                                key={dietitian._id}
                                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${secondaryDietitianIds.includes(dietitian._id)
                                  ? 'bg-green-100 border border-green-300'
                                  : 'hover:bg-gray-50 border border-transparent'
                                  }`}
                                onClick={() => {
                                  setSecondaryDietitianIds(prev =>
                                    prev.includes(dietitian._id)
                                      ? prev.filter(id => id !== dietitian._id)
                                      : [...prev, dietitian._id]
                                  );
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={secondaryDietitianIds.includes(dietitian._id)}
                                    onChange={() => { }}
                                    className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                                  />
                                  <Avatar className="h-6 w-6">
                                    <AvatarImage src={dietitian.avatar} />
                                    <AvatarFallback className="bg-green-200 text-green-800 text-xs">
                                      {dietitian.firstName?.[0]}{dietitian.lastName?.[0]}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <p className="text-sm font-medium">Dt. {dietitian.firstName} {dietitian.lastName}</p>
                                    <p className="text-xs text-gray-500">{dietitian.email}</p>
                                  </div>
                                </div>
                                {(dietitian as any).clientCount !== undefined && (
                                  <Badge variant="outline" className="text-xs">
                                    {(dietitian as any).clientCount} clients
                                  </Badge>
                                )}
                              </div>
                            ))}
                          {/* Show message when no secondary dietitians available */}
                          {availableDietitians.filter(d => d._id !== primaryDietitianId).length === 0 && (
                            <p className="text-sm text-gray-500 text-center py-4">
                              {primaryDietitianId
                                ? 'No other dietitians available for secondary assignment'
                                : 'No dietitians available'}
                            </p>
                          )}
                          {!primaryDietitianId && availableDietitians.length > 0 && (
                            <p className="text-sm text-amber-600 text-center py-2 bg-amber-50 rounded">
                              💡 Select a primary dietitian first to see available secondary options
                            </p>
                          )}
                        </div>
                        {secondaryDietitianIds.filter(id => id !== primaryDietitianId).length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {secondaryDietitianIds
                              .filter(id => id !== primaryDietitianId) // Don't show primary in secondary badges
                              .map(id => {
                                const d = availableDietitians.find(dt => dt._id === id);
                                if (!d) return null;
                                return (
                                  <Badge
                                    key={id}
                                    variant="secondary"
                                    className="flex items-center gap-1 bg-gray-100 text-gray-800"
                                  >
                                    <span className="px-1 py-0.5 text-[10px] font-bold rounded bg-gray-400 text-white">S</span>
                                    {d.firstName} {d.lastName}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSecondaryDietitianIds(prev => prev.filter(i => i !== id));
                                      }}
                                      className="ml-1 hover:text-gray-900"
                                    >
                                      <XCircle className="h-3 w-3" />
                                    </button>
                                  </Badge>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Health Counselor Selection - Only if has permission */}
              {canAssignHealthCounselors && (
                <div className="border rounded-lg p-4 bg-purple-50/50">
                  <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold">H</span>
                    Health Counselor Assignment
                  </h4>
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

              {/* Assignment Summary */}
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold text-gray-900 mb-3">Assignment Summary</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600 mb-1">Dietitians:</p>
                    <p className="font-medium">
                      {primaryDietitianId ? '1 Primary' : 'No Primary'}
                      {secondaryDietitianIds.filter(id => id !== primaryDietitianId).length > 0 ? ` + ${secondaryDietitianIds.filter(id => id !== primaryDietitianId).length} Secondary` : ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600 mb-1">Health Counselor:</p>
                    <p className="font-medium">
                      {selectedHealthCounselorId ? 'Selected' : 'Not changed'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAssign}
                disabled={assigning}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {assigning ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Saving...
                  </>
                ) : (
                  'Save Assignments'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </DashboardLayout>
  );
}
