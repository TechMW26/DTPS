'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
import { ExternalLink, RefreshCw, Search, Users, Plus, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, UserPlus, Filter, X, ChevronDown, ChevronUp } from 'lucide-react';
import { validateEmail } from '@/lib/validations/auth';
import Link from 'next/link';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { getClientId } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';

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

interface TagOption {
  _id: string;
  name: string;
  color?: string;
}

interface Filters {
  primaryDietitian: string;
  secondaryDietitian: string;
  tagId: string;
  dtAssignedFrom: string;
  dtAssignedTo: string;
  hcAssignedFrom: string;
  hcAssignedTo: string;
  planName: string;
  planDuration: string; // '' | 'ongoing' | 'dateRange'
  planDurationFrom: string;
  planDurationTo: string;
  planStatus: string;
  planShared: string; // '' | 'yes' | 'no'
  lastActivityHCFrom: string;
  lastActivityHCTo: string;
  lastActivityDTFrom: string;
  lastActivityDTTo: string;
}

const emptyFilters: Filters = {
  primaryDietitian: '',
  secondaryDietitian: '',
  tagId: '',
  dtAssignedFrom: '',
  dtAssignedTo: '',
  hcAssignedFrom: '',
  hcAssignedTo: '',
  planName: '',
  planDuration: '',
  planDurationFrom: '',
  planDurationTo: '',
  planStatus: '',
  planShared: '',
  lastActivityHCFrom: '',
  lastActivityHCTo: '',
  lastActivityDTFrom: '',
  lastActivityDTTo: '',
};

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
  tags?: Array<{
    _id: string;
    name: string;
    color?: string;
    icon?: string;
  }>;
  programStart?: string;
  programEnd?: string;
  // Active meal plan dates (used for status computation)
  mealPlanStartDate?: string;
  mealPlanEndDate?: string;
  activePlanName?: string;
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
      firstName: string;
      lastName: string;
      role: string;
    };
    role: string;
  };
}

// Client status colors (3-state system: lead / active / inactive)
const clientStatusColors: Record<string, { bg: string; text: string }> = {
  lead: { bg: 'bg-blue-100', text: 'text-blue-800' },
  active: { bg: 'bg-green-100', text: 'text-green-800' },
  inactive: { bg: 'bg-gray-100', text: 'text-gray-800' },
};

export default function DieticianClientsPage() {
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

  // Filter state
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(emptyFilters);
  const [filterDietitians, setFilterDietitians] = useState<Dietitian[]>([]);
  const [filterTags, setFilterTags] = useState<TagOption[]>([]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalClients, setTotalClients] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Debounce search input — wait 400ms after user stops typing, then trigger server-side search
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); // Reset to page 1 on new search
    }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchTerm]);

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

  // Fetch filter options (dietitians list & tags) on mount
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const [dtRes, tagRes] = await Promise.all([
          fetch('/api/users/dietitians?excludeHealthCounselors=true'),
          fetch('/api/tags'),
        ]);
        if (dtRes.ok) {
          const dtData = await dtRes.json();
          setFilterDietitians(dtData.dietitians || dtData || []);
        }
        if (tagRes.ok) {
          const tagData = await tagRes.json();
          setFilterTags(tagData.tags || tagData || []);
        }
      } catch (error) {
        console.error('Error fetching filter options:', error);
      }
    };
    fetchFilterOptions();
  }, []);

  // Count active filters
  const activeFilterCount = Object.entries(appliedFilters).filter(
    ([, value]) => value !== ''
  ).length;

  // Apply filters
  const applyFilters = () => {
    setAppliedFilters({ ...filters });
    setCurrentPage(1);
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setCurrentPage(1);
  };

  // Update a single filter
  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

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

  // Only fetch when session is authenticated and user ID is available
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) {
      fetchMyClients(currentPage, pageSize, debouncedSearch);
    } else if (status === 'unauthenticated') {
      setLoading(false);
    }
    // While loading session, keep loading state true
  }, [status, session?.user?.id, currentPage, pageSize, debouncedSearch, viewAs, appliedFilters]);

  const fetchMyClients = async (page = 1, limit = 50, search = '') => {
    try {
      setLoading(true);
      // Fetch clients with pagination and server-side search
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search.trim()) params.set('search', search.trim());
      if (viewAs) params.set('viewAs', viewAs);

      // Append active filters
      Object.entries(appliedFilters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });

      const response = await fetch(`/api/users/clients?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setClients(data.clients || []);
        setTotalClients(data.pagination?.total || 0);
        setTotalPages(data.pagination?.pages || 1);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
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

    try {
      setSaving(true);
      const payload = {
        email: createForm.email || undefined,
        firstName: createForm.firstName,
        lastName: createForm.lastName,
        phone: createForm.phone,
        gender: createForm.gender || undefined,
        dateOfBirth: createForm.dateOfBirth ? new Date(createForm.dateOfBirth) : undefined,
        role: 'client',
        // Backend will auto-assign to the current dietitian based on session
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
      setCurrentPage(1);
      await fetchMyClients(1, pageSize, debouncedSearch);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create client');
    } finally {
      setSaving(false);
    }
  };

  // Search is handled server-side; only apply local status filter
  const filteredClients = clients.filter(client => {
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
      prev.length === filteredClients.length
        ? []
        : filteredClients.map(c => c._id)
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

  const getStaffLines = (staff?: Array<{ firstName: string; lastName: string }>) => {
    if (!staff || staff.length === 0) return [];

    const names = staff
      .map((person) => `${person.firstName || ''} ${person.lastName || ''}`.trim())
      .filter(Boolean);

    const lines: string[] = [];
    for (let i = 0; i < names.length; i += 3) {
      lines.push(names.slice(i, i + 3).join(', '));
    }

    return lines;
  };

  return (
    <DashboardLayout>
      <div className="dietitian-clients-page p-6 space-y-4 max-w-full mx-auto">
        {/* Header */}
        <div className="dietitian-clients-header flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Clients</h1>
            <p className="text-gray-600 mt-1">
              Manage your assigned clients
            </p>
          </div>

          <div className="dietitian-clients-header-actions flex items-center gap-3">
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

        {/* Search + Filter Toggle */}
        <Card>
          <CardContent className="p-4">
            <div className="dietitian-clients-search-row flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search clients by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button
                size="sm"
                variant={filtersOpen ? 'default' : 'outline'}
                onClick={() => setFiltersOpen(!filtersOpen)}
                className="gap-1.5"
              >
                <Filter className="h-4 w-4" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full">
                    {activeFilterCount}
                  </Badge>
                )}
                {filtersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>
              {activeFilterCount > 0 && (
                <Button size="sm" variant="ghost" onClick={clearFilters} className="text-red-600 hover:text-red-700 gap-1">
                  <X className="h-3.5 w-3.5" /> Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Advanced Filters Panel */}
        {filtersOpen && (
          <Card>
            <CardContent className="p-4 space-y-4">
              {/* Row 1: Primary DT / Secondary DT / Tag */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Primary Dietitian</label>
                  <Select value={filters.primaryDietitian} onValueChange={(v) => updateFilter('primaryDietitian', v === '_all' ? '' : v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All Dietitians" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">All Dietitians</SelectItem>
                      {filterDietitians.map(dt => (
                        <SelectItem key={dt._id} value={dt._id}>
                          {dt.firstName} {dt.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Secondary Dietitian</label>
                  <Select value={filters.secondaryDietitian} onValueChange={(v) => updateFilter('secondaryDietitian', v === '_all' ? '' : v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All Dietitians" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">All Dietitians</SelectItem>
                      {filterDietitians.map(dt => (
                        <SelectItem key={dt._id} value={dt._id}>
                          {dt.firstName} {dt.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Tag</label>
                  <Select value={filters.tagId} onValueChange={(v) => updateFilter('tagId', v === '_all' ? '' : v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Any Tag" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">Any Tag</SelectItem>
                      {filterTags.map(tag => (
                        <SelectItem key={tag._id} value={tag._id}>
                          {tag.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 2: DT Assigned Date / HC Assigned Date */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">DT Assigned From</label>
                  <Input type="date" className="h-9" value={filters.dtAssignedFrom} onChange={(e) => updateFilter('dtAssignedFrom', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">DT Assigned To</label>
                  <Input type="date" className="h-9" value={filters.dtAssignedTo} onChange={(e) => updateFilter('dtAssignedTo', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">HC Assigned From</label>
                  <Input type="date" className="h-9" value={filters.hcAssignedFrom} onChange={(e) => updateFilter('hcAssignedFrom', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">HC Assigned To</label>
                  <Input type="date" className="h-9" value={filters.hcAssignedTo} onChange={(e) => updateFilter('hcAssignedTo', e.target.value)} />
                </div>
              </div>

              {/* Row 3: Plan Name / Plan Duration / Plan Status / Plan Shared */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Plan Name</label>
                  <Input className="h-9" placeholder="Search plan name..." value={filters.planName} onChange={(e) => updateFilter('planName', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Plan Duration</label>
                  <Select value={filters.planDuration} onValueChange={(v) => updateFilter('planDuration', v === '_all' ? '' : v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">Any</SelectItem>
                      <SelectItem value="ongoing">Ongoing Plans</SelectItem>
                      <SelectItem value="freeze">Freeze</SelectItem>
                      <SelectItem value="dateRange">Date Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Plan Status</label>
                  <Select value={filters.planStatus} onValueChange={(v) => updateFilter('planStatus', v === '_all' ? '' : v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Any Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">Any Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Plan Shared</label>
                  <Select value={filters.planShared} onValueChange={(v) => updateFilter('planShared', v === '_all' ? '' : v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">Any</SelectItem>
                      <SelectItem value="yes">Shared</SelectItem>
                      <SelectItem value="no">Not Shared</SelectItem>
                      <SelectItem value="general">General</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 4: Plan Duration Date Range (conditional) */}
              {filters.planDuration === 'dateRange' && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Plan Start From</label>
                    <Input type="date" className="h-9" value={filters.planDurationFrom} onChange={(e) => updateFilter('planDurationFrom', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Plan End To</label>
                    <Input type="date" className="h-9" value={filters.planDurationTo} onChange={(e) => updateFilter('planDurationTo', e.target.value)} />
                  </div>
                </div>
              )}

              {/* Row 5: Last Activity by HC / Last Activity by DT */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Last HC Activity From</label>
                  <Input type="date" className="h-9" value={filters.lastActivityHCFrom} onChange={(e) => updateFilter('lastActivityHCFrom', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Last HC Activity To</label>
                  <Input type="date" className="h-9" value={filters.lastActivityHCTo} onChange={(e) => updateFilter('lastActivityHCTo', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Last DT Activity From</label>
                  <Input type="date" className="h-9" value={filters.lastActivityDTFrom} onChange={(e) => updateFilter('lastActivityDTFrom', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Last DT Activity To</label>
                  <Input type="date" className="h-9" value={filters.lastActivityDTTo} onChange={(e) => updateFilter('lastActivityDTTo', e.target.value)} />
                </div>
              </div>

              {/* Apply / Reset */}
              <div className="flex items-center gap-3 pt-2 border-t">
                <Button size="sm" onClick={applyFilters} className="bg-blue-600 hover:bg-blue-700">
                  Apply Filters
                </Button>
                <Button size="sm" variant="outline" onClick={clearFilters}>
                  Reset All
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Header with Actions */}
        <div className="dietitian-clients-actions-row flex items-center justify-between gap-3">
          <div className="dietitian-clients-actions-left flex items-center gap-3">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
              Bulk Action
            </Button>
            <Select value={filterFreeze} onValueChange={setFilterFreeze}>
              <SelectTrigger className="dietitian-clients-mobile-select-trigger w-45 h-9">
                <SelectValue placeholder="Filter Freeze" />
              </SelectTrigger>
              <SelectContent className="dietitian-clients-mobile-select-content">
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="freeze">Freeze</SelectItem>
                <SelectItem value="active">Active</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="dietitian-clients-mobile-select-trigger w-45 h-9">
                <SelectValue placeholder="Client Status" />
              </SelectTrigger>
              <SelectContent className="dietitian-clients-mobile-select-content">
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
                <div className="dietitian-clients-table-wrap overflow-x-auto">
                  <Table className="dietitian-clients-table">
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="w-10 px-3">
                          <Checkbox
                            checked={selectedClients.length === filteredClients.length && filteredClients.length > 0}
                            onCheckedChange={toggleAllClients}
                          />
                        </TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">C-Id</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Name</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Phone</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Email</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Tags</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Status</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Plan Start</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Plan End</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Last Diet</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3 min-w-65">Dietitians</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3 min-w-65">Health Counselors</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Created By</TableHead>
                        <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Joined</TableHead>
                        {canAssign && (
                          <TableHead className="font-semibold text-xs whitespace-nowrap px-3">Actions</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredClients.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={canAssign ? 15 : 14} className="text-center py-12 text-gray-500">
                            No clients found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredClients.map((client) => (
                          <TableRow key={client._id} className="dietitian-clients-row hover:bg-gray-50">
                            <TableCell className="dietitian-clients-cell px-3" data-label="Select">
                              <Checkbox
                                checked={selectedClients.includes(client._id)}
                                onCheckedChange={() => toggleClientSelection(client._id)}
                              />
                            </TableCell>
                            <TableCell className="dietitian-clients-cell px-3" data-label="C-Id">
                              <Link
                                href={`/dietician/clients/${client._id}`}
                                className="text-blue-600 hover:underline font-medium text-sm"
                              >
                                {client.clientId || getClientId(client._id)}
                              </Link>
                            </TableCell>
                            <TableCell className="dietitian-clients-cell px-3" data-label="Name">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-sm whitespace-nowrap">{client.firstName} {client.lastName}</span>
                                <span className="text-xs bg-blue-100 text-blue-700 px-1 py-0.5 rounded font-medium">
                                  {client.clientId || getClientId(client._id)}
                                </span>
                                <Link href={`/dietician/clients/${client._id}`}>
                                  <ExternalLink className="h-3 w-3 text-gray-400 hover:text-gray-600" />
                                </Link>
                              </div>
                            </TableCell>
                            <TableCell className="dietitian-clients-cell px-3 text-sm whitespace-nowrap" data-label="Phone">{client.phone || '-'}</TableCell>
                            <TableCell className="dietitian-clients-cell px-3 max-w-37.5 truncate text-sm" data-label="Email">{client.email}</TableCell>
                            <TableCell className="dietitian-clients-cell px-3" data-label="Tags">
                              {client.tags && client.tags.length > 0 ? (
                                <div className="flex gap-1 flex-wrap">
                                  {client.tags.slice(0, 2).map((tag, idx) => (
                                    <Badge key={tag._id || idx} variant="outline" className="text-xs px-1.5 py-0">
                                      {tag.name || '-'}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-gray-400 text-xs">-</span>
                              )}
                            </TableCell>
                            <TableCell className="dietitian-clients-cell px-3" data-label="Status">
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
                            <TableCell className="dietitian-clients-cell px-3 text-sm whitespace-nowrap" data-label="Plan Start">
                              {client.mealPlanStartDate ? formatDate(client.mealPlanStartDate) : (client.programStart ? formatDate(client.programStart) : '-')}
                            </TableCell>
                            <TableCell className="dietitian-clients-cell px-3 text-sm whitespace-nowrap" data-label="Plan End">
                              {client.mealPlanEndDate ? formatDate(client.mealPlanEndDate) : (client.programEnd ? formatDate(client.programEnd) : '-')}
                            </TableCell>
                            <TableCell className="dietitian-clients-cell px-3 text-sm whitespace-nowrap" data-label="Last Diet">{client.lastDiet || '-'}</TableCell>
                            <TableCell className="dietitian-clients-cell px-3 text-sm min-w-65 align-top" data-label="Dietitians">
                              <div className="space-y-0.5">
                                {/* Primary Dietitian */}
                                {client.assignedDietitian ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs bg-teal-600 text-white px-1 py-0.5 rounded font-medium">P</span>
                                    <span className="text-blue-600 font-medium">
                                      {client.assignedDietitian.firstName} {client.assignedDietitian.lastName}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-xs">No primary</span>
                                )}
                                {/* Secondary Dietitians */}
                                {(() => {
                                  const secondaryDietitianLines = getStaffLines(client.assignedDietitians);
                                  if (secondaryDietitianLines.length === 0) return null;

                                  return (
                                    <div className="flex items-start gap-1">
                                      <span className="text-xs bg-teal-100 text-teal-700 px-1 py-0.5 rounded font-medium mt-0.5">S</span>
                                      <div className="text-xs text-gray-600 leading-4">
                                        {secondaryDietitianLines.map((line, idx) => (
                                          <div key={`dt-line-${client._id}-${idx}`}>{line}</div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            </TableCell>
                            <TableCell className="dietitian-clients-cell px-3 text-sm min-w-65 align-top" data-label="Health Counselors">
                              <div className="space-y-0.5">
                                {/* Primary Health Counselor */}
                                {client.assignedHealthCounselor ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs bg-orange-600 text-white px-1 py-0.5 rounded font-medium">P</span>
                                    <span className="text-orange-600 font-medium">
                                      {client.assignedHealthCounselor.firstName} {client.assignedHealthCounselor.lastName}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-xs">No primary</span>
                                )}
                                {/* Secondary Health Counselors */}
                                {(() => {
                                  const secondaryHealthCounselorLines = getStaffLines(client.assignedHealthCounselors);
                                  if (secondaryHealthCounselorLines.length === 0) return null;

                                  return (
                                    <div className="flex items-start gap-1">
                                      <span className="text-xs bg-orange-100 text-orange-700 px-1 py-0.5 rounded font-medium mt-0.5">S</span>
                                      <div className="text-xs text-gray-600 leading-4">
                                        {secondaryHealthCounselorLines.map((line, idx) => (
                                          <div key={`hc-line-${client._id}-${idx}`}>{line}</div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            </TableCell>
                            <TableCell className="dietitian-clients-cell px-3 text-sm" data-label="Created By">
                              {client.createdBy?.role ? (
                                <div className="space-y-0.5">
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
                                        <span className="text-xs text-gray-500 block">
                                          {client.createdBy.userId.firstName} {client.createdBy.userId.lastName}
                                        </span>
                                      )}
                                    </>
                                  ) : client.createdBy.role === 'health_counselor' ? (
                                    <>
                                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                                        By HC
                                      </Badge>
                                      {client.createdBy.userId && (
                                        <span className="text-xs text-gray-500 block">
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
                                        <span className="text-xs text-gray-500 block">
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
                            <TableCell className="dietitian-clients-cell px-3 text-sm whitespace-nowrap" data-label="Joined">{formatDate(client.createdAt)}</TableCell>
                            {canAssign && (
                              <TableCell className="dietitian-clients-cell px-3" data-label="Actions">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openAssignDialog(client)}
                                  className="h-7 px-2 text-xs"
                                >
                                  <UserPlus className="h-3.5 w-3.5 mr-1" />
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

                {/* Pagination Footer */}
                <div className="dietitian-clients-pagination px-4 py-3 border-t flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span>Rows per page:</span>
                    <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
                      <SelectTrigger className="w-17.5 h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="200">200</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="ml-2">
                      Showing {totalClients === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalClients)} of {totalClients} clients
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage <= 1}
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-1 mx-2">
                      {(() => {
                        const pages: number[] = [];
                        const start = Math.max(1, currentPage - 2);
                        const end = Math.min(totalPages, currentPage + 2);
                        for (let i = start; i <= end; i++) pages.push(i);
                        return pages.map(p => (
                          <Button
                            key={p}
                            variant={p === currentPage ? 'default' : 'outline'}
                            size="icon"
                            className={`h-8 w-8 text-xs ${p === currentPage ? 'bg-blue-600 text-white hover:bg-blue-700' : ''}`}
                            onClick={() => setCurrentPage(p)}
                          >
                            {p}
                          </Button>
                        ));
                      })()}
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage >= totalPages}
                    >
                      <ChevronsRight className="h-4 w-4" />
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
              <Input
                value={createForm.phone}
                onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+91XXXXXXXXXX"
              />
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

      {/* Assignment Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Staff</DialogTitle>
            <DialogDescription>
              Assign this client to a dietitian or health counselor
            </DialogDescription>
          </DialogHeader>

          {selectedClientForAssign && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium">
                  {selectedClientForAssign.firstName} {selectedClientForAssign.lastName}
                </p>
                <p className="text-xs text-gray-500">{selectedClientForAssign.email}</p>
              </div>

              <div>
                <label className="text-sm font-medium">Assignment Mode</label>
                <Select value={assignMode} onValueChange={(v: 'add' | 'replace') => setAssignMode(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">Add to existing assignments</SelectItem>
                    <SelectItem value="replace">Replace current assignments</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {canAssignDietitians && (
                <div>
                  <label className="text-sm font-medium">Assign Dietitian</label>
                  <Select value={selectedDietitianId} onValueChange={setSelectedDietitianId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a dietitian" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {availableDietitians.map(d => (
                        <SelectItem key={d._id} value={d._id}>
                          {d.firstName} {d.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {canAssignHealthCounselors && (
                <div>
                  <label className="text-sm font-medium">Assign Health Counselor</label>
                  <Select value={selectedHealthCounselorId} onValueChange={setSelectedHealthCounselorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a health counselor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {availableHealthCounselors.map(hc => (
                        <SelectItem key={hc._id} value={hc._id}>
                          {hc.firstName} {hc.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAssign}
              disabled={assigning || (!selectedDietitianId && !selectedHealthCounselorId)}
            >
              {assigning ? 'Assigning...' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        @media (max-width: 768px) {
          /* mobile only — max-width: 768px */
          .dietitian-clients-page {
            padding: 12px;
            overflow-x: hidden;
            space-y: 12px;
          }

          .dietitian-clients-page > * + * {
            margin-top: 12px;
          }

          .dietitian-clients-page .text-xs {
            font-size: 12px;
          }

          .dietitian-clients-page .text-sm {
            font-size: 13px;
          }

          .dietitian-clients-page .text-3xl {
            font-size: 22px;
          }

          .dietitian-clients-page button,
          .dietitian-clients-page input,
          .dietitian-clients-page [role='button'],
          .dietitian-clients-page [role='combobox'] {
            min-height: 44px;
          }

          /* Header Stack on Mobile */
          .dietitian-clients-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
            width: 100%;
          }

          .dietitian-clients-header > div:first-child {
            width: 100%;
          }

          .dietitian-clients-header > div:first-child h1 {
            font-size: 22px;
            line-height: 1.2;
          }

          .dietitian-clients-header > div:first-child p {
            font-size: 13px;
            margin-top: 4px;
          }

          .dietitian-clients-header-actions {
            width: 100%;
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }

          .dietitian-clients-header-actions button {
            width: 100%;
            font-size: 14px;
            padding: 10px 16px;
          }

          .dietitian-clients-header-actions > div {
            width: 100%;
            padding: 10px 12px;
          }

          /* Search and Filter Row */
          .dietitian-clients-search-row {
            flex-direction: column;
            gap: 10px;
            align-items: stretch;
          }

          .dietitian-clients-search-row > div {
            width: 100%;
          }

          .dietitian-clients-search-row input {
            width: 100%;
            font-size: 16px;
            padding: 10px 12px 10px 36px;
          }

          .dietitian-clients-search-row button {
            width: 100%;
            font-size: 14px;
            padding: 10px 12px;
          }

          /* Actions Row */
          .dietitian-clients-actions-row {
            flex-direction: column;
            gap: 10px;
            align-items: stretch;
            width: 100%;
          }

          .dietitian-clients-actions-row > div {
            display: flex;
            flex-direction: column;
            gap: 8px;
            align-items: stretch;
          }

          .dietitian-clients-actions-row select,
          .dietitian-clients-actions-row [role='button'] {
            width: 100%;
            min-height: 44px;
            font-size: 14px;
          }

          /* Dropdowns */
          .dietitian-clients-mobile-select-trigger {
            width: 100% !important;
            min-height: 44px !important;
            font-size: 14px;
          }

          .dietitian-clients-mobile-select-content {
            max-height: min(60vh, 280px);
            overflow-y: auto;
          }

          /* Filter Section */
          .dietitian-clients-page .grid.grid-cols-1 {
            gap: 10px;
          }

          .dietitian-clients-page .grid.grid-cols-1 > div {
            width: 100%;
          }

          .dietitian-clients-page .grid.grid-cols-1 input,
          .dietitian-clients-page .grid.grid-cols-1 [role='button'] {
            width: 100%;
            min-height: 44px;
            font-size: 14px;
          }

          .dietitian-clients-page label {
            font-size: 12px;
            margin-bottom: 6px !important;
          }

          /* Table Wrapper */
          .dietitian-clients-table-wrap {
            overflow-x: visible;
            padding: 0;
          }

          .dietitian-clients-table {
            width: 100%;
          }

          .dietitian-clients-table thead {
            display: none;
          }

          .dietitian-clients-table tbody {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .dietitian-clients-table tr {
            display: flex;
            flex-direction: column;
            gap: 8px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 12px;
            background: #ffffff;
            page-break-inside: avoid;
          }

          .dietitian-clients-table td {
            display: flex;
            flex-direction: column;
            gap: 4px;
            width: 100%;
            padding: 0 !important;
          }

          .dietitian-clients-table td[colspan] {
            text-align: center;
            padding: 16px 8px !important;
            font-size: 14px;
          }

          .dietitian-clients-cell {
            padding: 0 !important;
            white-space: normal;
            overflow: visible;
            word-break: break-word;
          }

          .dietitian-clients-cell[data-label]::before {
            content: attr(data-label);
            display: block;
            font-size: 12px;
            font-weight: 600;
            color: #6b7280;
            margin-bottom: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .dietitian-clients-cell button {
            min-height: 40px;
            font-size: 13px;
            width: 100%;
            padding: 8px 12px;
          }

          /* Pagination */
          .dietitian-clients-pagination {
            flex-direction: column;
            gap: 12px;
            padding: 12px !important;
            align-items: stretch;
          }

          .dietitian-clients-pagination > div {
            width: 100%;
            flex-direction: column;
            gap: 8px;
            font-size: 12px;
          }

          .dietitian-clients-pagination > div > span:last-child {
            word-break: break-word;
          }

          .dietitian-clients-pagination .flex.items-center {
            width: 100%;
            justify-content: center;
            gap: 4px;
            flex-wrap: wrap;
          }

          .dietitian-clients-pagination button {
            min-width: 40px;
            min-height: 40px;
            padding: 0;
            font-size: 12px;
          }
        }
      `}</style>
    </DashboardLayout>
  );
}