'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Search,
  Users,
  Eye,
  UserPlus,
  UserMinus,
  CheckCircle,
  XCircle,
  Calendar,
  ArrowRightLeft,
  Wifi,
  WifiOff,
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { getClientId } from '@/lib/utils';
import { ProfessionalSection } from '@/components/admin/ProfessionalGrid';

interface Client {
  _id: string;
  clientId?: string; // Sequential client ID (C-1, C-2, etc.)
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string;
  phone?: string;
  status: string;
  clientStatus?: string;
  createdAt: string;
  dateOfBirth?: string;
  gender?: string;
  height?: number;
  weight?: number;
  activityLevel?: string;
  healthGoals?: string[];
  medicalConditions?: string[];
  allergies?: string[];
  dietaryRestrictions?: string[];
  assignedDietitian?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar?: string;
  };
  assignedDietitians?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar?: string;
  }[];
  assignedHealthCounselor?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar?: string;
  };
  assignedHealthCounselors?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar?: string;
  }[];
  createdBy?: {
    userId?: {
      _id: string;
      firstName?: string;
      lastName?: string;
      role?: string;
    };
    role?: 'self' | 'dietitian' | 'health_counselor' | 'admin' | '';
    createdAt?: string;
  };
}

interface Dietitian {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string;
  phone?: string;
  specialization?: string;
  status: string;
  clientCount: number;
}

interface HealthCounselor {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string;
  phone?: string;
  status: string;
  clientCount: number;
}

export default function AdminAllClientsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [dietitians, setDietitians] = useState<Dietitian[]>([]);
  const [healthCounselors, setHealthCounselors] = useState<HealthCounselor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterAssigned, setFilterAssigned] = useState('all');
  const [stats, setStats] = useState({ total: 0, assigned: 0, unassigned: 0 });
  const [isSSEConnected, setIsSSEConnected] = useState(false);

  // Pagination state - server-side
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20); // Fixed page size
  const [totalPages, setTotalPages] = useState(0);
  const [totalResults, setTotalResults] = useState(0);

  // Debounce search term
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);



  // Assignment dialog state
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedDietitianId, setSelectedDietitianId] = useState('');
  const [selectedHealthCounselorIds, setSelectedHealthCounselorIds] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [assignMode, setAssignMode] = useState<'add' | 'replace' | 'remove'>('add');
  const [dietitianSearchTerm, setDietitianSearchTerm] = useState('');
  const [healthCounselorSearchTerm, setHealthCounselorSearchTerm] = useState('');

  // Transfer dialog state (bulk transfer)
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [transferDietitianId, setTransferDietitianId] = useState('');
  const [transferring, setTransferring] = useState(false);

  // Detail view dialog state
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailClient, setDetailClient] = useState<Client | null>(null);

  // Fetch clients with server-side pagination
  const fetchClients = useCallback(async (resetPage = false) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      // Use server-side search, filtering, and pagination
      if (debouncedSearchTerm) params.append('search', debouncedSearchTerm);
      if (filterStatus !== 'all') params.append('status', filterStatus);
      if (filterAssigned !== 'all') params.append('assigned', filterAssigned);
      params.append('page', resetPage ? '1' : String(currentPage));
      params.append('limit', String(pageSize));

      const response = await fetch(`/api/admin/clients?${params.toString()}`);

      if (response.ok) {
        const data = await response.json();
        setClients(data.clients || []);
        setStats(data.stats || { total: 0, assigned: 0, unassigned: 0 });
        setTotalResults(data.pagination?.total || 0);
        setTotalPages(data.pagination?.pages || 0);

        if (resetPage) {
          setCurrentPage(1);
        }
        setIsSSEConnected(true);
      } else {
        toast.error('Failed to fetch clients');
        setIsSSEConnected(false);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast.error('Failed to fetch clients');
      setIsSSEConnected(false);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchTerm, filterStatus, filterAssigned, currentPage, pageSize]);

  // Initial load
  useEffect(() => {
    if (status === 'authenticated') {
      fetchDietitians();
      fetchHealthCounselors();
    }
  }, [status]);

  // Fetch clients when dependencies change
  useEffect(() => {
    if (status === 'authenticated') {
      fetchClients();
    }
  }, [status, fetchClients]);

  // Debounce search term - only update every 300ms for faster response
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1); // Reset to first page when search changes
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  // Reset to page 1 when filters change
  useEffect(() => {
    if (status === 'authenticated') {
      setCurrentPage(1);
    }
  }, [filterStatus, filterAssigned, status]);

  const fetchDietitians = async () => {
    try {
      const response = await fetch('/api/admin/dietitians');
      if (response.ok) {
        const data = await response.json();
        console.log('Fetched dietitians:', data.dietitians?.length || 0);
        setDietitians(data.dietitians || []);
      } else {
        console.error('Failed to fetch dietitians:', response.status);
        toast.error('Failed to load dietitians');
      }
    } catch (error) {
      console.error('Error fetching dietitians:', error);
      toast.error('Error loading dietitians');
    }
  };

  const fetchHealthCounselors = async () => {
    try {
      const response = await fetch('/api/admin/health-counselors');
      if (response.ok) {
        const data = await response.json();
        console.log('Fetched health counselors:', data.healthCounselors?.length || 0);
        setHealthCounselors(data.healthCounselors || []);
      } else {
        console.error('Failed to fetch health counselors:', response.status);
        toast.error('Failed to load health counselors');
      }
    } catch (error) {
      console.error('Error fetching health counselors:', error);
      toast.error('Error loading health counselors');
    }
  };

  const openDetailDialog = (client: Client) => {
    setDetailClient(client);
    setDetailDialogOpen(true);
  };

  const openAssignDialog = (client: Client) => {
    console.log('Opening assign dialog for client:', client._id);
    console.log('Available dietitians:', dietitians.length);
    console.log('Available health counselors:', healthCounselors.length);
    setSelectedClient(client);
    setSelectedDietitianId('');
    setSelectedHealthCounselorIds([]);
    setAssignMode('add');
    setDietitianSearchTerm('');
    setHealthCounselorSearchTerm('');
    setAssignDialogOpen(true);
  };

  const handleAssignDietitian = async () => {
    if (!selectedClient) return;

    try {
      setAssigning(true);
      const payload = {
        dietitianId: selectedDietitianId || null,
        healthCounselorIds: selectedHealthCounselorIds.length > 0 ? selectedHealthCounselorIds : null,
        mode: assignMode
      };

      console.log('Sending assignment payload:', payload);

      const response = await fetch(`/api/admin/clients/${selectedClient._id}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Assignment response:', data);
        toast.success(data.message);

        // Update local table state immediately to avoid stale cache showing old assignments
        if (data?.client?._id) {
          setClients((prev) => prev.map((c) => (c._id === data.client._id ? data.client : c)));
        }

        // Refresh the client list to show updated assignments
        await fetchClients();

        // Re-apply latest updated client in case list fetch returned stale cached payload
        if (data?.client?._id) {
          setClients((prev) => prev.map((c) => (c._id === data.client._id ? data.client : c)));
        }

        setAssignDialogOpen(false);
      } else {
        const error = await response.json();
        console.error('Assignment error:', error);
        toast.error(error.error || 'Failed to assign professional');
      }
    } catch (error) {
      console.error('Error assigning professional:', error);
      toast.error('Failed to assign professional');
    } finally {
      setAssigning(false);
    }
  };

  // Remove a specific dietitian from a client
  const handleRemoveDietitian = async (clientId: string, dietitianId: string) => {
    try {
      setAssigning(true);
      const response = await fetch(`/api/admin/clients/${clientId}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dietitianId: dietitianId,
          mode: 'remove'
        })
      });

      if (response.ok) {
        const data = await response.json();
        toast.success('Dietitian removed successfully');

        // Update local table state immediately
        if (data?.client?._id) {
          setClients((prev) => prev.map((c) => (c._id === data.client._id ? data.client : c)));
        }

        // Refresh the list
        await fetchClients();

        // Re-apply latest updated client in case list fetch returned stale cached payload
        if (data?.client?._id) {
          setClients((prev) => prev.map((c) => (c._id === data.client._id ? data.client : c)));
        }

        // Update selected client if it's the same
        if (selectedClient?._id === clientId) {
          setSelectedClient(data.client);
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to remove dietitian');
      }
    } catch (error) {
      console.error('Error removing dietitian:', error);
      toast.error('Failed to remove dietitian');
    } finally {
      setAssigning(false);
    }
  };

  // Remove health counselor from a client
  const handleRemoveHealthCounselor = async (clientId: string, healthCounselorId?: string) => {
    try {
      setAssigning(true);
      const response = await fetch(`/api/admin/clients/${clientId}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          healthCounselorId: healthCounselorId || null,
          action: 'remove',
          mode: 'remove'
        })
      });

      if (response.ok) {
        const data = await response.json();
        toast.success('Health counselor removed successfully');

        // Update local table state immediately so deleted counselor disappears from list view
        if (data?.client?._id) {
          setClients((prev) => prev.map((c) => (c._id === data.client._id ? data.client : c)));
        }

        // Refresh the list
        await fetchClients();

        // Re-apply latest updated client in case list fetch returned stale cached payload
        if (data?.client?._id) {
          setClients((prev) => prev.map((c) => (c._id === data.client._id ? data.client : c)));
        }

        // Update selected client if it's the same
        if (selectedClient?._id === clientId) {
          setSelectedClient(data.client);
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to remove health counselor');
      }
    } catch (error) {
      console.error('Error removing health counselor:', error);
      toast.error('Failed to remove health counselor');
    } finally {
      setAssigning(false);
    }
  };

  // Toggle client selection for bulk transfer
  const toggleClientSelection = (clientId: string) => {
    setSelectedClients(prev =>
      prev.includes(clientId)
        ? prev.filter(id => id !== clientId)
        : [...prev, clientId]
    );
  };

  // Select all visible clients on current page
  const selectAllClients = () => {
    if (selectedClients.length === paginatedClients.length) {
      setSelectedClients([]);
    } else {
      setSelectedClients(paginatedClients.map(c => c._id));
    }
  };

  // Handle bulk transfer
  const handleBulkTransfer = async () => {
    if (selectedClients.length === 0) {
      toast.error('Please select at least one client');
      return;
    }
    if (!transferDietitianId) {
      toast.error('Please select a dietitian to transfer to');
      return;
    }

    try {
      setTransferring(true);

      // Transfer each client
      const results = await Promise.all(
        selectedClients.map(async (clientId) => {
          const response = await fetch(`/api/admin/clients/${clientId}/assign`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dietitianId: transferDietitianId })
          });
          return { clientId, success: response.ok };
        })
      );

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      if (successCount > 0) {
        toast.success(`Successfully transferred ${successCount} client(s)`);
      }
      if (failCount > 0) {
        toast.error(`Failed to transfer ${failCount} client(s)`);
      }

      setTransferDialogOpen(false);
      setSelectedClients([]);
      setTransferDietitianId('');
      // Refresh page data after bulk transfer
      await fetchClients();
    } catch (error) {
      console.error('Error transferring clients:', error);
      toast.error('Failed to transfer clients');
    } finally {
      setTransferring(false);
    }
  };

  // No client-side filtering needed - it's all server-side now!
  const paginatedClients = clients;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      case 'lead':
      case 'leading':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'N/A';
      return format(date, 'MMM d, yyyy');
    } catch {
      return 'N/A';
    }
  };

  const calculateAge = (dateOfBirth: string | undefined) => {
    if (!dateOfBirth) return null;
    try {
      const today = new Date();
      const birthDate = new Date(dateOfBirth);
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age;
    } catch {
      return null;
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">All Clients</h1>
              {/* Real-time connection indicator */}
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${isSSEConnected
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
                }`}>
                {isSSEConnected ? (
                  <>
                    <Wifi className="h-3 w-3" />
                    <span className="hidden sm:inline">Live</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3 w-3" />
                    <span className="hidden sm:inline">Reconnecting...</span>
                  </>
                )}
              </div>
            </div>
            <p className="text-gray-600 mt-1">
              Manage and assign clients to dietitians
            </p>
          </div>
          {selectedClients.length > 0 && (
            <Button
              onClick={() => setTransferDialogOpen(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Transfer {selectedClients.length} Client(s)
            </Button>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Clients</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <Users className="h-6 sm:h-8 w-6 sm:w-8 text-blue-600" />
                <span className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.total}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Assigned</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-6 sm:h-8 w-6 sm:w-8 text-green-600" />
                <span className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.assigned}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Unassigned</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <XCircle className="h-6 sm:h-8 w-6 sm:w-8 text-orange-600" />
                <span className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.unassigned}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search clients..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Status Filter */}
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>

              {/* Assignment Filter */}
              <Select value={filterAssigned} onValueChange={setFilterAssigned}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by assignment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  <SelectItem value="true">Assigned Only</SelectItem>
                  <SelectItem value="false">Unassigned Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Clients Table */}
        {loading ? (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-3 sm:px-6 py-3 text-left">
                        <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
                      </th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Client
                      </th>
                      <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Contact
                      </th>
                      <th className="hidden lg:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Health Info
                      </th>
                      <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Dietitian
                      </th>
                      <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Health Counselor
                      </th>
                      <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="hidden lg:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created By
                      </th>
                      <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Joined
                      </th>
                      <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {/* Skeleton rows */}
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                          <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="h-10 w-10 bg-gray-200 rounded-full animate-pulse" />
                            <div className="ml-4 space-y-2">
                              <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                              <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
                            </div>
                          </div>
                        </td>
                        <td className="hidden sm:table-cell px-6 py-4 whitespace-nowrap">
                          <div className="space-y-2">
                            <div className="h-4 w-40 bg-gray-200 rounded animate-pulse" />
                            <div className="h-3 w-28 bg-gray-100 rounded animate-pulse" />
                          </div>
                        </td>
                        <td className="hidden lg:table-cell px-6 py-4 whitespace-nowrap">
                          <div className="space-y-2">
                            <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                            <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                          <div className="h-6 w-28 bg-gray-200 rounded animate-pulse" />
                        </td>
                        <td className="hidden sm:table-cell px-6 py-4 whitespace-nowrap">
                          <div className="h-6 w-28 bg-gray-200 rounded animate-pulse" />
                        </td>
                        <td className="hidden sm:table-cell px-6 py-4 whitespace-nowrap">
                          <div className="h-6 w-16 bg-gray-200 rounded-full animate-pulse" />
                        </td>
                        <td className="hidden lg:table-cell px-6 py-4 whitespace-nowrap">
                          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                        </td>
                        <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap">
                          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                        </td>
                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-8 w-20 bg-gray-200 rounded animate-pulse" />
                            <div className="h-8 w-20 bg-gray-200 rounded animate-pulse" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>

            {/* Skeleton Pagination */}
            <div className="flex items-center justify-between border-t px-4 py-4">
              <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
              <div className="flex items-center gap-2">
                <div className="h-10 w-24 bg-gray-200 rounded animate-pulse" />
                <div className="h-10 w-10 bg-gray-200 rounded animate-pulse" />
                <div className="h-10 w-10 bg-gray-200 rounded animate-pulse" />
                <div className="h-10 w-10 bg-gray-200 rounded animate-pulse" />
                <div className="h-10 w-24 bg-gray-200 rounded animate-pulse" />
              </div>
            </div>
          </Card>
        ) : clients.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {debouncedSearchTerm ? 'No clients found' : 'No clients yet'}
              </h3>
              <p className="text-gray-600">
                {debouncedSearchTerm
                  ? 'Try adjusting your search terms or filters'
                  : 'Clients will appear here once they register'
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 sm:px-6 py-3 text-left">
                          <Checkbox
                            checked={selectedClients.length === paginatedClients.length && paginatedClients.length > 0}
                            onCheckedChange={selectAllClients}
                            aria-label="Select all"
                          />
                        </th>
                        <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Client
                        </th>
                        <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Contact
                        </th>
                        <th className="hidden lg:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Health Info
                        </th>
                        <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Dietitian
                        </th>
                        <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Health Counselor
                        </th>
                        <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="hidden lg:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Created By
                        </th>
                        <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Joined
                        </th>
                        <th className="px-3 sm:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {paginatedClients.map((client) => (
                        <tr key={client._id} className={`hover:bg-gray-50 ${selectedClients.includes(client._id) ? 'bg-blue-50' : ''}`}>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                            <Checkbox
                              checked={selectedClients.includes(client._id)}
                              onCheckedChange={() => toggleClientSelection(client._id)}
                              aria-label={`Select ${client.firstName} ${client.lastName}`}
                            />
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <Avatar className="h-8 sm:h-10 w-8 sm:w-10">
                                <AvatarImage src={client.avatar} />
                                <AvatarFallback className="bg-linear-to-br from-blue-500 to-purple-600 text-white text-xs sm:text-sm">
                                  {client.firstName?.[0] || 'U'}{client.lastName?.[0] || 'N'}
                                </AvatarFallback>
                              </Avatar>
                              <div className="ml-2 sm:ml-4">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm font-medium text-gray-900">
                                    {client.firstName} {client.lastName}
                                  </div>
                                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                                    {client.clientId || getClientId(client._id)}
                                  </span>
                                </div>
                                {/* Show email on mobile */}
                                <div className="text-xs text-gray-500 sm:hidden truncate max-w-30">
                                  {client.email}
                                </div>
                                {client.dateOfBirth && calculateAge(client.dateOfBirth) && (
                                  <div className="text-xs text-gray-500 hidden sm:block">
                                    {calculateAge(client.dateOfBirth)} years, {client.gender || 'N/A'}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="hidden sm:table-cell px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{client.email}</div>
                            {client.phone && (
                              <div className="text-xs text-gray-500">{client.phone}</div>
                            )}
                          </td>
                          <td className="hidden lg:table-cell px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {client.weight && <span>⚖️ {client.weight}kg</span>}
                              {client.height && <span className="ml-2">📏 {client.height}cm</span>}
                            </div>
                            {client.healthGoals && client.healthGoals.length > 0 && (
                              <div className="text-xs text-gray-500 capitalize">
                                🎯 {client.healthGoals[0]}
                                {client.healthGoals.length > 1 && ` +${client.healthGoals.length - 1}`}
                              </div>
                            )}
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                            {(() => {
                              // Combine assignedDietitian (singular) and assignedDietitians (array)
                              const allDietitians: { _id: string; firstName: string; lastName: string; email: string; avatar?: string }[] = [];
                              // Check if assignedDietitian is a populated object (has firstName)
                              if (client.assignedDietitian && typeof client.assignedDietitian === 'object' && client.assignedDietitian.firstName) {
                                allDietitians.push(client.assignedDietitian);
                              }
                              if (client.assignedDietitians && client.assignedDietitians.length > 0) {
                                client.assignedDietitians.forEach(d => {
                                  // Only add if it's a populated object with firstName
                                  if (d && typeof d === 'object' && d.firstName && !allDietitians.find(existing => existing._id === d._id)) {
                                    allDietitians.push(d);
                                  }
                                });
                              }

                              if (allDietitians.length > 0) {
                                return (
                                  <div className="space-y-1">
                                    {allDietitians.map((dietitian) => (
                                      <div key={dietitian._id} className="flex items-center gap-2 p-1.5 bg-green-50 rounded border border-green-200">
                                        <Avatar className="h-6 w-6">
                                          <AvatarImage src={dietitian.avatar} />
                                          <AvatarFallback className="bg-green-100 text-green-800 text-xs">
                                            {dietitian.firstName?.[0]}{dietitian.lastName?.[0]}
                                          </AvatarFallback>
                                        </Avatar>
                                        <div className="hidden sm:block min-w-0">
                                          <div className="text-xs font-medium text-gray-900 truncate">
                                            {dietitian.firstName} {dietitian.lastName}
                                          </div>
                                          <div className="text-xs text-gray-500 truncate">{dietitian.email}</div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                );
                              } else {
                                return (
                                  <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs">
                                    <UserMinus className="h-3 w-3 mr-1" />
                                    <span className="hidden sm:inline">Unassigned</span>
                                  </Badge>
                                );
                              }
                            })()}
                          </td>
                          <td className="hidden sm:table-cell px-6 py-4 whitespace-nowrap">
                            {(() => {
                              // Combine assignedHealthCounselor (singular) and assignedHealthCounselors (array)
                              const allHealthCounselors: { _id: string; firstName: string; lastName: string; email: string; avatar?: string }[] = [];
                              // Check if assignedHealthCounselor is a populated object (has firstName)
                              if (client.assignedHealthCounselor && typeof client.assignedHealthCounselor === 'object' && client.assignedHealthCounselor.firstName) {
                                allHealthCounselors.push(client.assignedHealthCounselor);
                              }
                              if (client.assignedHealthCounselors && client.assignedHealthCounselors.length > 0) {
                                client.assignedHealthCounselors.forEach(hc => {
                                  // Only add if it's a populated object with firstName
                                  if (hc && typeof hc === 'object' && hc.firstName && !allHealthCounselors.find(existing => existing._id === hc._id)) {
                                    allHealthCounselors.push(hc);
                                  }
                                });
                              }

                              if (allHealthCounselors.length > 0) {
                                return (
                                  <div className="space-y-1">
                                    {allHealthCounselors.map((hc) => (
                                      <div key={hc._id} className="flex items-center gap-2 p-1.5 bg-purple-50 rounded border border-purple-200">
                                        <Avatar className="h-6 w-6">
                                          <AvatarImage src={hc.avatar} />
                                          <AvatarFallback className="bg-purple-100 text-purple-800 text-xs">
                                            {hc.firstName?.[0]}{hc.lastName?.[0]}
                                          </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                          <div className="text-xs font-medium text-gray-900 truncate">
                                            {hc.firstName} {hc.lastName}
                                          </div>
                                          <div className="text-xs text-gray-500 truncate">{hc.email}</div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                );
                              } else {
                                return (
                                  <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                                    <UserMinus className="h-3 w-3 mr-1" />
                                    <span>Not Assigned</span>
                                  </Badge>
                                );
                              }
                            })()}
                          </td>
                          <td className="hidden sm:table-cell px-6 py-4 whitespace-nowrap">
                            <Badge className={getStatusColor(client.clientStatus || 'lead')}>
                              {(client.clientStatus || 'lead') === 'lead' ? 'Lead' : (client.clientStatus || 'lead') === 'active' ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                          <td className="hidden lg:table-cell px-6 py-4 whitespace-nowrap">
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
                          </td>
                          <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <div className="flex items-center">
                              <Calendar className="h-3 w-3 mr-1" />
                              {formatDate(client.createdAt)}
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center justify-end gap-1 sm:gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openAssignDialog(client)}
                                className="text-xs px-2 sm:px-3"
                              >
                                <UserPlus className="h-3 w-3 sm:mr-1" />
                                <span className="hidden sm:inline">{client.assignedDietitian ? 'Reassign' : 'Assign'}</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => router.push(`/dietician/clients/${client._id}`)}
                                className="text-xs px-2 sm:px-3"
                              >
                                <Eye className="h-3 w-3 sm:mr-1" />
                                <span className="hidden sm:inline">View Dashboard</span>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>

              {/* Pagination Controls */}
              <div className="flex items-center justify-between border-t px-4 py-4">
                <div className="text-sm text-gray-600">
                  Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalResults)} of {totalResults} clients
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      const pageNum = currentPage <= 3 ? i + 1 : Math.max(currentPage - 2, 1) + i;
                      if (pageNum > totalPages) return null;
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                          className="w-10 h-10 p-0"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages || totalPages === 0}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </Card>
          </>
        )}

        {/* Assignment Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
            <DialogHeader className="shrink-0">
              <DialogTitle>Manage Professionals</DialogTitle>
              <DialogDescription>
                {selectedClient && (
                  <>
                    Assign dietitians and health counselors for <strong>{selectedClient.firstName} {selectedClient.lastName}</strong>
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 overflow-y-auto flex-1 pr-2">
              {/* Summary Section */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs text-blue-600 uppercase tracking-wide font-semibold">Total Dietitians</p>
                  <p className="text-2xl font-bold text-blue-900">
                    {(() => {
                      const dietitians = new Set();
                      if (selectedClient?.assignedDietitian && typeof selectedClient.assignedDietitian === 'object' && selectedClient.assignedDietitian._id) {
                        dietitians.add(selectedClient.assignedDietitian._id);
                      }
                      if (selectedClient?.assignedDietitians && Array.isArray(selectedClient.assignedDietitians)) {
                        selectedClient.assignedDietitians.forEach(d => {
                          if (d && d._id) dietitians.add(d._id);
                        });
                      }
                      return dietitians.size;
                    })()}
                  </p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <p className="text-xs text-purple-600 uppercase tracking-wide font-semibold">Total Health Counselors</p>
                  <p className="text-2xl font-bold text-purple-900">
                    {(() => {
                      const hcs = new Set();
                      if (selectedClient?.assignedHealthCounselor && typeof selectedClient.assignedHealthCounselor === 'object' && selectedClient.assignedHealthCounselor._id) {
                        hcs.add(selectedClient.assignedHealthCounselor._id);
                      }
                      if (selectedClient?.assignedHealthCounselors && Array.isArray(selectedClient.assignedHealthCounselors)) {
                        selectedClient.assignedHealthCounselors.forEach(h => {
                          if (h && h._id) hcs.add(h._id);
                        });
                      }
                      return hcs.size;
                    })()}
                  </p>
                </div>
              </div>

              {/* Currently assigned professionals */}
              <div className="space-y-3">
                {/* Dietitians - show both singular and array */}
                {(() => {
                  const allDietitians: { _id: string; firstName: string; lastName: string; email: string; avatar?: string }[] = [];
                  if (selectedClient?.assignedDietitian && typeof selectedClient.assignedDietitian === 'object' && selectedClient.assignedDietitian._id) {
                    allDietitians.push(selectedClient.assignedDietitian);
                  }
                  if (selectedClient?.assignedDietitians && Array.isArray(selectedClient.assignedDietitians)) {
                    selectedClient.assignedDietitians.forEach(d => {
                      if (d && d._id && !allDietitians.some(existing => existing._id === d._id)) {
                        allDietitians.push(d);
                      }
                    });
                  }

                  return allDietitians.length > 0 ? (
                    <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                      <p className="text-sm text-green-900 mb-2 font-medium">Currently assigned dietitians ({allDietitians.length}):</p>
                      <div className="space-y-2">
                        {allDietitians.map((dietitian) => (
                          <div key={dietitian._id} className="flex items-center justify-between bg-white p-2 rounded border">
                            <div className="flex items-center">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={dietitian.avatar} />
                                <AvatarFallback className="bg-green-200 text-green-800 text-xs">
                                  {dietitian.firstName?.[0]}{dietitian.lastName?.[0]}
                                </AvatarFallback>
                              </Avatar>
                              <div className="ml-2">
                                <p className="text-sm font-medium text-gray-900">
                                  {dietitian.firstName} {dietitian.lastName}
                                </p>
                                <p className="text-xs text-gray-500">{dietitian.email}</p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => selectedClient && handleRemoveDietitian(selectedClient._id, dietitian._id)}
                              disabled={assigning}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-sm text-gray-600">No dietitians assigned yet</p>
                    </div>
                  );
                })()}

                {/* Health Counselors - show both singular and array */}
                {(() => {
                  const allHCs: { _id: string; firstName: string; lastName: string; email: string; avatar?: string }[] = [];
                  if (selectedClient?.assignedHealthCounselor && typeof selectedClient.assignedHealthCounselor === 'object' && selectedClient.assignedHealthCounselor._id) {
                    allHCs.push(selectedClient.assignedHealthCounselor);
                  }
                  if (selectedClient?.assignedHealthCounselors && Array.isArray(selectedClient.assignedHealthCounselors)) {
                    selectedClient.assignedHealthCounselors.forEach(h => {
                      if (h && h._id && !allHCs.some(existing => existing._id === h._id)) {
                        allHCs.push(h);
                      }
                    });
                  }

                  return allHCs.length > 0 ? (
                    <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                      <p className="text-sm text-purple-900 mb-2 font-medium">Currently assigned health counselors ({allHCs.length}):</p>
                      <div className="space-y-2">
                        {allHCs.map((hc) => (
                          <div key={hc._id} className="flex items-center justify-between bg-white p-2 rounded border">
                            <div className="flex items-center">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={hc.avatar} />
                                <AvatarFallback className="bg-purple-200 text-purple-800 text-xs">
                                  {hc.firstName?.[0]}{hc.lastName?.[0]}
                                </AvatarFallback>
                              </Avatar>
                              <div className="ml-2">
                                <p className="text-sm font-medium text-gray-900">
                                  {hc.firstName} {hc.lastName}
                                </p>
                                <p className="text-xs text-gray-500">{hc.email}</p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => selectedClient && handleRemoveHealthCounselor(selectedClient._id, hc._id)}
                              disabled={assigning}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-sm text-gray-600">No health counselors assigned yet</p>
                    </div>
                  );
                })()}
              </div>

              {/* Assignment mode */}
              <div>
                <label className="text-sm font-medium mb-2 block">Assignment Mode</label>
                <Select value={assignMode} onValueChange={(v) => setAssignMode(v as 'add' | 'replace')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add">Add to existing dietitians</SelectItem>
                    <SelectItem value="replace">Replace all with selected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Dietitian Selection Section */}
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-900 mb-3">Dietitian Assignment</h4>

                {dietitians.length === 0 ? (
                  <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <p className="text-sm text-yellow-700">No dietitians available. Please add dietitians first.</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Select Dietitian to Add
                      </label>
                      <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Search dietitians..."
                          value={dietitianSearchTerm}
                          onChange={(e) => setDietitianSearchTerm(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                      <Select value={selectedDietitianId} onValueChange={setSelectedDietitianId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a dietitian..." />
                        </SelectTrigger>
                        <SelectContent>
                          {dietitians
                            .filter(d => assignMode === 'replace' || !selectedClient?.assignedDietitians?.some(ad => ad._id === d._id))
                            .filter(d => {
                              if (!dietitianSearchTerm.trim()) return true;
                              const searchLower = dietitianSearchTerm.toLowerCase();
                              const fullName = `${d.firstName} ${d.lastName}`.toLowerCase();
                              return fullName.includes(searchLower) || d.email?.toLowerCase().includes(searchLower);
                            })
                            .map((dietitian) => (
                              <SelectItem key={dietitian._id} value={dietitian._id}>
                                <div className="flex items-center justify-between w-full">
                                  <span>{dietitian.firstName} {dietitian.lastName}</span>
                                  <Badge variant="outline" className="ml-2">
                                    {dietitian.clientCount} clients
                                  </Badge>
                                </div>
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedDietitianId && (
                      <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                        {(() => {
                          const dietitian = dietitians.find(d => d._id === selectedDietitianId);
                          if (!dietitian) return null;
                          return (
                            <div>
                              <p className="text-sm text-green-900 mb-1">Selected dietitian:</p>
                              <div className="flex items-center">
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={dietitian.avatar} />
                                  <AvatarFallback className="bg-green-200 text-green-800 text-xs">
                                    {dietitian.firstName?.[0]}{dietitian.lastName?.[0]}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="ml-2">
                                  <p className="text-sm font-medium text-green-900">
                                    {dietitian.firstName} {dietitian.lastName}
                                  </p>
                                  <p className="text-xs text-green-700">
                                    {dietitian.email} • {dietitian.clientCount} clients
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Health Counselor Selection Section */}
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-900 mb-3">Health Counselor Assignment</h4>

                {healthCounselors.length === 0 ? (
                  <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <p className="text-sm text-yellow-700">No health counselors available. Please add health counselors first.</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Select Health Counselors to Add (Multiple Selection)
                      </label>
                      <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Search health counselors..."
                          value={healthCounselorSearchTerm}
                          onChange={(e) => setHealthCounselorSearchTerm(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-1">
                        {healthCounselors
                          .filter(hc => {
                            // Filter out already assigned health counselors in 'add' mode
                            if (assignMode === 'add') {
                              const currentlyAssigned = new Set<string>();
                              if (selectedClient?.assignedHealthCounselor && typeof selectedClient.assignedHealthCounselor === 'object') {
                                currentlyAssigned.add(selectedClient.assignedHealthCounselor._id);
                              }
                              if (selectedClient?.assignedHealthCounselors && Array.isArray(selectedClient.assignedHealthCounselors)) {
                                selectedClient.assignedHealthCounselors.forEach(h => {
                                  if (h && h._id) currentlyAssigned.add(h._id);
                                });
                              }
                              if (currentlyAssigned.has(hc._id)) return false;
                            }
                            if (!healthCounselorSearchTerm.trim()) return true;
                            const searchLower = healthCounselorSearchTerm.toLowerCase();
                            const fullName = `${hc.firstName} ${hc.lastName}`.toLowerCase();
                            return fullName.includes(searchLower) || hc.email?.toLowerCase().includes(searchLower);
                          })
                          .map((hc) => (
                            <div
                              key={hc._id}
                              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${selectedHealthCounselorIds.includes(hc._id)
                                ? 'bg-purple-100 border border-purple-300'
                                : 'hover:bg-gray-50 border border-transparent'
                                }`}
                              onClick={() => {
                                setSelectedHealthCounselorIds(prev =>
                                  prev.includes(hc._id)
                                    ? prev.filter(id => id !== hc._id)
                                    : [...prev, hc._id]
                                );
                              }}
                            >
                              <div className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={selectedHealthCounselorIds.includes(hc._id)}
                                  onChange={() => { }}
                                  className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 mr-3"
                                />
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={hc.avatar} />
                                  <AvatarFallback className="bg-purple-200 text-purple-800 text-xs">
                                    {hc.firstName?.[0]}{hc.lastName?.[0]}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="ml-2">
                                  <p className="text-sm font-medium text-gray-900">
                                    {hc.firstName} {hc.lastName}
                                  </p>
                                  <p className="text-xs text-gray-500">{hc.email}</p>
                                </div>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {hc.clientCount} clients
                              </Badge>
                            </div>
                          ))}
                        {healthCounselors.filter(hc => {
                          if (assignMode === 'add') {
                            const currentlyAssigned = new Set<string>();
                            if (selectedClient?.assignedHealthCounselor && typeof selectedClient.assignedHealthCounselor === 'object') {
                              currentlyAssigned.add(selectedClient.assignedHealthCounselor._id);
                            }
                            if (selectedClient?.assignedHealthCounselors && Array.isArray(selectedClient.assignedHealthCounselors)) {
                              selectedClient.assignedHealthCounselors.forEach(h => {
                                if (h && h._id) currentlyAssigned.add(h._id);
                              });
                            }
                            if (currentlyAssigned.has(hc._id)) return false;
                          }
                          if (!healthCounselorSearchTerm.trim()) return true;
                          const searchLower = healthCounselorSearchTerm.toLowerCase();
                          const fullName = `${hc.firstName} ${hc.lastName}`.toLowerCase();
                          return fullName.includes(searchLower) || hc.email?.toLowerCase().includes(searchLower);
                        }).length === 0 && (
                            <p className="text-sm text-gray-500 text-center py-2">
                              {assignMode === 'add' ? 'All health counselors are already assigned' : 'No health counselors match your search'}
                            </p>
                          )}
                      </div>
                    </div>

                    {selectedHealthCounselorIds.length > 0 && (
                      <div className="mt-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                        <p className="text-sm text-purple-900 mb-2 font-medium">
                          Selected health counselors ({selectedHealthCounselorIds.length}):
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {selectedHealthCounselorIds.map(id => {
                            const hc = healthCounselors.find(h => h._id === id);
                            if (!hc) return null;
                            return (
                              <Badge
                                key={id}
                                variant="secondary"
                                className="flex items-center gap-1 bg-purple-100 text-purple-800"
                              >
                                {hc.firstName} {hc.lastName}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedHealthCounselorIds(prev => prev.filter(i => i !== id));
                                  }}
                                  className="ml-1 hover:text-purple-900"
                                >
                                  <XCircle className="h-3 w-3" />
                                </button>
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <DialogFooter className="shrink-0 border-t pt-4">
              <Button
                variant="outline"
                onClick={() => setAssignDialogOpen(false)}
                disabled={assigning}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAssignDietitian}
                disabled={assigning}
              >
                {assigning ? 'Assigning...' : 'Save Assignments'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Transfer Dialog (Bulk Transfer) */}
        <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-blue-600" />
                Transfer Clients
              </DialogTitle>
              <DialogDescription>
                Transfer {selectedClients.length} selected client(s) to a new dietitian
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Selected clients list */}
              <div className="max-h-32 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                <p className="text-sm font-medium text-gray-700 mb-2">Selected Clients:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedClients.map(clientId => {
                    const client = clients.find(c => c._id === clientId);
                    return client ? (
                      <Badge key={clientId} variant="secondary" className="text-xs">
                        {client.firstName} {client.lastName}
                      </Badge>
                    ) : null;
                  })}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Select New Dietitian
                </label>
                <Select value={transferDietitianId} onValueChange={setTransferDietitianId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a dietitian..." />
                  </SelectTrigger>
                  <SelectContent>
                    {dietitians.map((dietitian) => (
                      <SelectItem key={dietitian._id} value={dietitian._id}>
                        <div className="flex items-center justify-between w-full">
                          <span>{dietitian.firstName} {dietitian.lastName}</span>
                          <Badge variant="outline" className="ml-2">
                            {dietitian.clientCount} clients
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {transferDietitianId && (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  {(() => {
                    const dietitian = dietitians.find(d => d._id === transferDietitianId);
                    if (!dietitian) return null;
                    return (
                      <div>
                        <p className="text-sm text-blue-900 mb-1">Transferring to:</p>
                        <div className="flex items-center">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={dietitian.avatar} />
                            <AvatarFallback className="bg-blue-200 text-blue-800 text-xs">
                              {dietitian.firstName?.[0]}{dietitian.lastName?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="ml-2">
                            <p className="text-sm font-medium text-blue-900">
                              {dietitian.firstName} {dietitian.lastName}
                            </p>
                            <p className="text-xs text-blue-700">
                              {dietitian.email} • {dietitian.clientCount} current clients
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-800">
                  <strong>Note:</strong> The new dietitian will have full access to all client data including diet plans, payments, and medical records.
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => {
                  setTransferDialogOpen(false);
                  setTransferDietitianId('');
                }}
                disabled={transferring}
              >
                Cancel
              </Button>
              <Button
                onClick={handleBulkTransfer}
                disabled={transferring || !transferDietitianId}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {transferring ? 'Transferring...' : `Transfer ${selectedClients.length} Client(s)`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Client Detail Dialog */}
        <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Client Details</DialogTitle>
            </DialogHeader>

            {detailClient && (
              <div className="space-y-6 py-4">
                {/* Personal Information */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-900 border-b pb-2">Personal Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">First Name</p>
                      <p className="text-sm font-medium text-gray-900">{detailClient.firstName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Last Name</p>
                      <p className="text-sm font-medium text-gray-900">{detailClient.lastName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Email</p>
                      <p className="text-sm font-medium text-gray-900">{detailClient.email}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Phone</p>
                      <p className="text-sm font-medium text-gray-900">{detailClient.phone || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Client ID</p>
                      <p className="text-sm font-medium text-gray-900">{detailClient.clientId || getClientId(detailClient._id)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Status</p>
                      <Badge className={getStatusColor(detailClient.clientStatus || 'lead')}>
                        {(detailClient.clientStatus || 'lead') === 'lead' ? 'Lead' : (detailClient.clientStatus || 'lead') === 'active' ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Health Information */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-gray-900 border-b pb-2">Health Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Date of Birth</p>
                      <p className="text-sm font-medium text-gray-900">
                        {detailClient.dateOfBirth ? formatDate(detailClient.dateOfBirth) : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Age</p>
                      <p className="text-sm font-medium text-gray-900">
                        {detailClient.dateOfBirth ? calculateAge(detailClient.dateOfBirth) : 'N/A'} years
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Gender</p>
                      <p className="text-sm font-medium text-gray-900 capitalize">{detailClient.gender || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Height</p>
                      <p className="text-sm font-medium text-gray-900">{detailClient.height ? `${detailClient.height} cm` : 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Weight</p>
                      <p className="text-sm font-medium text-gray-900">{detailClient.weight ? `${detailClient.weight} kg` : 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Activity Level</p>
                      <p className="text-sm font-medium text-gray-900 capitalize">{detailClient.activityLevel || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                {/* Health Goals */}
                {detailClient.healthGoals && detailClient.healthGoals.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-gray-900 border-b pb-2">Health Goals</h3>
                    <div className="flex flex-wrap gap-2">
                      {detailClient.healthGoals.map((goal, idx) => (
                        <Badge key={idx} variant="secondary">{goal}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Medical Conditions */}
                {detailClient.medicalConditions && detailClient.medicalConditions.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-gray-900 border-b pb-2">Medical Conditions</h3>
                    <div className="flex flex-wrap gap-2">
                      {detailClient.medicalConditions.map((condition, idx) => (
                        <Badge key={idx} variant="outline" className="text-red-700 border-red-300">{condition}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Allergies */}
                {detailClient.allergies && detailClient.allergies.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-gray-900 border-b pb-2">Allergies</h3>
                    <div className="flex flex-wrap gap-2">
                      {detailClient.allergies.map((allergy, idx) => (
                        <Badge key={idx} variant="outline" className="text-orange-700 border-orange-300">{allergy}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dietary Restrictions */}
                {detailClient.dietaryRestrictions && detailClient.dietaryRestrictions.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-gray-900 border-b pb-2">Dietary Restrictions</h3>
                    <div className="flex flex-wrap gap-2">
                      {detailClient.dietaryRestrictions.map((restriction, idx) => (
                        <Badge key={idx} variant="outline" className="text-green-700 border-green-300">{restriction}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Assigned Professionals - Improved Responsive Grid */}
                {(() => {
                  const allDietitians: any[] = [];
                  if (detailClient.assignedDietitian) {
                    allDietitians.push(detailClient.assignedDietitian);
                  }
                  if (detailClient.assignedDietitians && detailClient.assignedDietitians.length > 0) {
                    detailClient.assignedDietitians.forEach((d: any) => {
                      if (!allDietitians.find(existing => existing._id === d._id)) {
                        allDietitians.push(d);
                      }
                    });
                  }

                  const allHealthCounselors: any[] = [];
                  if (detailClient.assignedHealthCounselor) {
                    allHealthCounselors.push(detailClient.assignedHealthCounselor);
                  }
                  if (detailClient.assignedHealthCounselors && detailClient.assignedHealthCounselors.length > 0) {
                    detailClient.assignedHealthCounselors.forEach((hc: any) => {
                      if (!allHealthCounselors.find(existing => existing._id === hc._id)) {
                        allHealthCounselors.push(hc);
                      }
                    });
                  }

                  return (
                    <div className="space-y-4">
                      <h3 className="font-semibold text-gray-900 border-b pb-2">Assigned Professionals</h3>
                      <ProfessionalSection
                        dietitians={allDietitians}
                        healthCounselors={allHealthCounselors}
                        compact={false}
                      />
                    </div>
                  );
                })()}

                {/* Timestamps */}
                <div className="space-y-2 text-xs text-gray-500 border-t pt-4">
                  <p>Joined: {formatDate(detailClient.createdAt)}</p>
                  <p>Client ID: {detailClient._id}</p>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
