'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
  onboardingCompleted?: boolean;
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
  // Expected service dates for dynamic status calculation
  expectedStartDate?: string;
  expectedEndDate?: string;
  hasSuccessfulPayment?: boolean;
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
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterDietitianId, setFilterDietitianId] = useState('all');
  const [filterHealthCounselorId, setFilterHealthCounselorId] = useState('all');
  const [filterOnboarding, setFilterOnboarding] = useState('all');
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

  // New: Primary & Secondary selection state
  const [primaryDietitianId, setPrimaryDietitianId] = useState('');
  const [secondaryDietitianIds, setSecondaryDietitianIds] = useState<string[]>([]);
  const [primaryHealthCounselorId, setPrimaryHealthCounselorId] = useState('');
  const [secondaryHealthCounselorIds, setSecondaryHealthCounselorIds] = useState<string[]>([]);
  const [primaryDietitianSearchTerm, setPrimaryDietitianSearchTerm] = useState('');
  const [primaryHealthCounselorSearchTerm, setPrimaryHealthCounselorSearchTerm] = useState('');

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
      if (filterDateFrom) params.append('dateFrom', filterDateFrom);
      if (filterDateTo) params.append('dateTo', filterDateTo);
      if (filterDietitianId !== 'all') params.append('dietitianId', filterDietitianId);
      if (filterHealthCounselorId !== 'all') params.append('healthCounselorId', filterHealthCounselorId);
      if (filterOnboarding !== 'all') params.append('onboarding', filterOnboarding);
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
  }, [debouncedSearchTerm, filterStatus, filterAssigned, filterDateFrom, filterDateTo, filterDietitianId, filterHealthCounselorId, filterOnboarding, currentPage, pageSize]);

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
  }, [filterStatus, filterAssigned, filterDateFrom, filterDateTo, filterDietitianId, filterHealthCounselorId, filterOnboarding, status]);

  const fetchDietitians = async () => {
    try {
      const response = await fetch('/api/admin/dietitians');
      if (response.ok) {
        const data = await response.json();
        console.log('Fetched dietitians:', data.dietitians?.length || 0);
        // Deduplicate by _id
        const uniqueDietitians = (data.dietitians || []).filter(
          (d: Dietitian, index: number, arr: Dietitian[]) => arr.findIndex(x => x._id === d._id) === index
        );
        setDietitians(uniqueDietitians);
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
        // Deduplicate by _id
        const uniqueHealthCounselors = (data.healthCounselors || []).filter(
          (hc: HealthCounselor, index: number, arr: HealthCounselor[]) => arr.findIndex(x => x._id === hc._id) === index
        );
        setHealthCounselors(uniqueHealthCounselors);
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
    setPrimaryDietitianSearchTerm('');
    setPrimaryHealthCounselorSearchTerm('');

    // Initialize Primary/Secondary from existing assignments
    // Primary Dietitian
    const existingPrimaryDietitian = client.assignedDietitian && typeof client.assignedDietitian === 'object'
      ? client.assignedDietitian._id : '';
    setPrimaryDietitianId(existingPrimaryDietitian);

    // Secondary Dietitians (from array, excluding primary)
    const existingSecondaryDietitians = (client.assignedDietitians || [])
      .filter(d => d && typeof d === 'object' && d._id !== existingPrimaryDietitian)
      .map(d => d._id);
    setSecondaryDietitianIds(existingSecondaryDietitians);

    // Primary Health Counselor
    const existingPrimaryHC = client.assignedHealthCounselor && typeof client.assignedHealthCounselor === 'object'
      ? client.assignedHealthCounselor._id : '';
    setPrimaryHealthCounselorId(existingPrimaryHC);

    // Secondary Health Counselors (from array, excluding primary)
    const existingSecondaryHCs = (client.assignedHealthCounselors || [])
      .filter(hc => hc && typeof hc === 'object' && hc._id !== existingPrimaryHC)
      .map(hc => hc._id);
    setSecondaryHealthCounselorIds(existingSecondaryHCs);

    setAssignDialogOpen(true);
  };

  const handleAssignDietitian = async () => {
    if (!selectedClient) return;

    try {
      setAssigning(true);

      // Build the payload with explicit primary and secondary assignments
      const payload: any = {
        // Primary dietitian goes to assignedDietitian field
        primaryDietitianId: primaryDietitianId || null,
        // Secondary dietitians go to assignedDietitians array (combined with primary)
        secondaryDietitianIds: secondaryDietitianIds.length > 0 ? secondaryDietitianIds : [],
        // Primary health counselor goes to assignedHealthCounselor field
        primaryHealthCounselorId: primaryHealthCounselorId || null,
        // Secondary health counselors go to assignedHealthCounselors array (combined with primary)
        secondaryHealthCounselorIds: secondaryHealthCounselorIds.length > 0 ? secondaryHealthCounselorIds : [],
        mode: 'primary_secondary' // New mode for explicit primary/secondary handling
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
            {/* Active Filters Summary */}
            {(() => {
              const activeFilters: string[] = [];
              if (searchTerm) activeFilters.push(`Search: "${searchTerm}"`);
              if (filterStatus !== 'all') activeFilters.push(`Status: ${filterStatus}`);
              if (filterAssigned !== 'all') activeFilters.push(`Assigned: ${filterAssigned === 'true' ? 'Yes' : 'No'}`);
              if (filterDietitianId !== 'all') {
                const dt = dietitians.find(d => d._id === filterDietitianId);
                activeFilters.push(`Dietitian: ${dt?.firstName || 'Selected'}`);
              }
              if (filterHealthCounselorId !== 'all') {
                const hc = healthCounselors.find(h => h._id === filterHealthCounselorId);
                activeFilters.push(`HC: ${hc?.firstName || 'Selected'}`);
              }
              if (filterOnboarding !== 'all') activeFilters.push(`Onboarding: ${filterOnboarding === 'done' ? 'Done' : 'Pending'}`);
              if (filterDateFrom) activeFilters.push(`From: ${filterDateFrom}`);
              if (filterDateTo) activeFilters.push(`To: ${filterDateTo}`);

              return activeFilters.length > 0 ? (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-blue-800">
                        {activeFilters.length} Active Filter{activeFilters.length > 1 ? 's' : ''} (AND):
                      </span>
                      {activeFilters.map((filter, idx) => (
                        <Badge key={idx} variant="secondary" className="bg-blue-100 text-blue-800 text-xs">
                          {filter}
                        </Badge>
                      ))}
                    </div>
                    <span className="text-sm text-blue-600">
                      Showing {totalResults} matching client{totalResults !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              ) : null;
            })()}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

              {/* Primary Dietitian Filter */}
              <Select value={filterDietitianId} onValueChange={setFilterDietitianId}>
                <SelectTrigger>
                  <SelectValue placeholder="Primary Dietitian" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Dietitians</SelectItem>
                  {dietitians.map((d) => (
                    <SelectItem key={d._id} value={d._id}>
                      {d.firstName} {d.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Primary Health Counselor Filter */}
              <Select value={filterHealthCounselorId} onValueChange={setFilterHealthCounselorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Primary Health Counselor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Health Counselors</SelectItem>
                  {healthCounselors.map((hc) => (
                    <SelectItem key={hc._id} value={hc._id}>
                      {hc.firstName} {hc.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Onboarding Filter */}
              <Select value={filterOnboarding} onValueChange={setFilterOnboarding}>
                <SelectTrigger>
                  <SelectValue placeholder="Onboarding Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Onboarding</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>

              {/* Date From */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Joined From</label>
                <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
              </div>

              {/* Date To */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Joined To</label>
                <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
              </div>

              {/* Clear Filters */}
              <Button
                variant="outline"
                size="sm"
                className="self-end"
                onClick={() => {
                  setSearchTerm('');
                  setFilterStatus('all');
                  setFilterAssigned('all');
                  setFilterDateFrom('');
                  setFilterDateTo('');
                  setFilterDietitianId('all');
                  setFilterHealthCounselorId('all');
                  setFilterOnboarding('all');
                  setCurrentPage(1);
                }}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Clear Filters
              </Button>
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
                      <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Onboarding
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
                        <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Onboarding
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
                              // Primary dietitian (singular field)
                              const primaryDietitian = client.assignedDietitian && typeof client.assignedDietitian === 'object' && client.assignedDietitian.firstName
                                ? client.assignedDietitian : null;
                              const primaryDietitianId = primaryDietitian?._id ? String(primaryDietitian._id) : null;

                              // Secondary dietitians (from array, excluding primary) - compare as strings
                              const secondaryDietitians = (client.assignedDietitians || [])
                                .filter(d =>
                                  d && typeof d === 'object' && d.firstName && (!primaryDietitianId || String(d._id) !== primaryDietitianId)
                                )
                                // Deduplicate by _id
                                .filter((d, index, arr) => arr.findIndex(x => String(x._id) === String(d._id)) === index);

                              if (primaryDietitian || secondaryDietitians.length > 0) {
                                return (
                                  <div className="space-y-1">
                                    {primaryDietitian && (
                                      <div className="flex items-center gap-2 p-1.5 bg-green-50 rounded border border-green-200">
                                        <span className="px-1.5 py-0.5 text-xs font-bold rounded bg-blue-500 text-white shrink-0">P</span>
                                        <Avatar className="h-5 w-5">
                                          <AvatarImage src={primaryDietitian.avatar} />
                                          <AvatarFallback className="bg-green-100 text-green-800 text-xs">
                                            {primaryDietitian.firstName?.[0]}{primaryDietitian.lastName?.[0]}
                                          </AvatarFallback>
                                        </Avatar>
                                        <div className="hidden sm:block min-w-0">
                                          <div className="text-xs font-medium text-gray-900 truncate">
                                            {primaryDietitian.firstName} {primaryDietitian.lastName}
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                    {secondaryDietitians.map((dietitian, index) => (
                                      <div key={`secondary-dietitian-${dietitian._id}-${index}`} className="flex items-center gap-2 p-1.5 bg-gray-50 rounded border border-gray-200">
                                        <span className="px-1.5 py-0.5 text-xs font-bold rounded bg-gray-400 text-white shrink-0">S</span>
                                        <Avatar className="h-5 w-5">
                                          <AvatarImage src={dietitian.avatar} />
                                          <AvatarFallback className="bg-gray-100 text-gray-700 text-xs">
                                            {dietitian.firstName?.[0]}{dietitian.lastName?.[0]}
                                          </AvatarFallback>
                                        </Avatar>
                                        <div className="hidden sm:block min-w-0">
                                          <div className="text-xs font-medium text-gray-700 truncate">
                                            {dietitian.firstName} {dietitian.lastName}
                                          </div>
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
                              // Primary health counselor (singular field)
                              const primaryCounselor = client.assignedHealthCounselor && typeof client.assignedHealthCounselor === 'object' && client.assignedHealthCounselor.firstName
                                ? client.assignedHealthCounselor : null;

                              // Secondary health counselors (from array, excluding primary)
                              const secondaryCounselors = (client.assignedHealthCounselors || [])
                                .filter(hc =>
                                  hc && typeof hc === 'object' && hc.firstName && hc._id !== primaryCounselor?._id
                                )
                                // Deduplicate by _id
                                .filter((hc, index, arr) => arr.findIndex(x => x._id === hc._id) === index);

                              if (primaryCounselor || secondaryCounselors.length > 0) {
                                return (
                                  <div className="space-y-1">
                                    {primaryCounselor && (
                                      <div className="flex items-center gap-2 p-1.5 bg-purple-50 rounded border border-purple-200">
                                        <span className="px-1.5 py-0.5 text-xs font-bold rounded bg-blue-500 text-white shrink-0">P</span>
                                        <Avatar className="h-5 w-5">
                                          <AvatarImage src={primaryCounselor.avatar} />
                                          <AvatarFallback className="bg-purple-100 text-purple-800 text-xs">
                                            {primaryCounselor.firstName?.[0]}{primaryCounselor.lastName?.[0]}
                                          </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                          <div className="text-xs font-medium text-gray-900 truncate">
                                            {primaryCounselor.firstName} {primaryCounselor.lastName}
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                    {secondaryCounselors.map((hc, index) => (
                                      <div key={`secondary-hc-${hc._id}-${index}`} className="flex items-center gap-2 p-1.5 bg-gray-50 rounded border border-gray-200">
                                        <span className="px-1.5 py-0.5 text-xs font-bold rounded bg-gray-400 text-white shrink-0">S</span>
                                        <Avatar className="h-5 w-5">
                                          <AvatarImage src={hc.avatar} />
                                          <AvatarFallback className="bg-gray-100 text-gray-700 text-xs">
                                            {hc.firstName?.[0]}{hc.lastName?.[0]}
                                          </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                          <div className="text-xs font-medium text-gray-700 truncate">
                                            {hc.firstName} {hc.lastName}
                                          </div>
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
                          <td className="hidden sm:table-cell px-6 py-4 whitespace-nowrap">
                            {client.onboardingCompleted ? (
                              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Done
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-yellow-600 border-yellow-300">
                                Pending
                              </Badge>
                            )}
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
          <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
            <DialogHeader className="shrink-0">
              <DialogTitle>Manage Professional Assignments</DialogTitle>
              <DialogDescription>
                {selectedClient && (
                  <>
                    Assign primary and secondary dietitians/health counselors for <strong>{selectedClient.firstName} {selectedClient.lastName}</strong>
                    <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                      {selectedClient.clientId || selectedClient._id.slice(-6).toUpperCase()}
                    </span>
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4 overflow-y-auto flex-1 pr-2">
              {/* ========== DIETITIAN SECTION ========== */}
              <div className="border rounded-lg p-4 bg-green-50/50">
                <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-bold">D</span>
                  Dietitian Assignment
                </h4>

                {dietitians.length === 0 ? (
                  <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <p className="text-sm text-yellow-700">No dietitians available. Please add dietitians first.</p>
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
                        {dietitians
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
                                <p className="text-sm font-medium">{dietitian.firstName} {dietitian.lastName}</p>
                                <p className="text-xs text-gray-500">{dietitian.email}</p>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {dietitian.clientCount} clients
                              </Badge>
                            </div>
                          ))}
                        {dietitians.filter(d => {
                          if (!primaryDietitianSearchTerm.trim()) return true;
                          const searchLower = primaryDietitianSearchTerm.toLowerCase();
                          const fullName = `${d.firstName} ${d.lastName}`.toLowerCase();
                          return fullName.includes(searchLower) || d.email?.toLowerCase().includes(searchLower);
                        }).length === 0 && (
                            <p className="text-sm text-gray-500 text-center py-3">No dietitians found</p>
                          )}
                      </div>
                      {primaryDietitianId && (
                        <div className="flex items-center gap-2 p-2 bg-green-100 rounded-lg border border-green-300">
                          <span className="px-1.5 py-0.5 text-xs font-bold rounded bg-blue-500 text-white">P</span>
                          {(() => {
                            const d = dietitians.find(dt => dt._id === primaryDietitianId);
                            return d ? (
                              <>
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={d.avatar} />
                                  <AvatarFallback className="bg-green-200 text-green-800 text-xs">
                                    {d.firstName?.[0]}{d.lastName?.[0]}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm font-medium">{d.firstName} {d.lastName}</span>
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
                        {dietitians
                          .filter(d => d._id !== primaryDietitianId) // Exclude primary from secondary list
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
                                  <p className="text-sm font-medium">{dietitian.firstName} {dietitian.lastName}</p>
                                  <p className="text-xs text-gray-500">{dietitian.email}</p>
                                </div>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {dietitian.clientCount} clients
                              </Badge>
                            </div>
                          ))}
                        {dietitians.filter(d => d._id !== primaryDietitianId).length === 0 && (
                          <p className="text-sm text-gray-500 text-center py-2">No other dietitians available</p>
                        )}
                      </div>
                      {secondaryDietitianIds.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {secondaryDietitianIds.map(id => {
                            const d = dietitians.find(dt => dt._id === id);
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

              {/* ========== HEALTH COUNSELOR SECTION ========== */}
              <div className="border rounded-lg p-4 bg-purple-50/50">
                <h4 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold">H</span>
                  Health Counselor Assignment
                </h4>

                {healthCounselors.length === 0 ? (
                  <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <p className="text-sm text-yellow-700">No health counselors available. Please add health counselors first.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Primary Health Counselor */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <span className="px-2 py-0.5 text-xs font-bold rounded bg-blue-500 text-white">PRIMARY</span>
                        Select Primary Health Counselor
                        <span className="text-gray-400 font-normal">(saved to assignedHealthCounselor)</span>
                      </label>
                      <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Search primary health counselor..."
                          value={primaryHealthCounselorSearchTerm}
                          onChange={(e) => setPrimaryHealthCounselorSearchTerm(e.target.value)}
                          className="pl-9 bg-white"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto border rounded-lg bg-white">
                        {/* No primary option */}
                        <div
                          className={`flex items-center gap-2 p-2 cursor-pointer transition-colors border-b ${!primaryHealthCounselorId ? 'bg-purple-100' : 'hover:bg-gray-50'}`}
                          onClick={() => setPrimaryHealthCounselorId('')}
                        >
                          <input type="radio" checked={!primaryHealthCounselorId} onChange={() => { }} className="h-4 w-4 text-purple-600" />
                          <span className="text-gray-400">No primary health counselor</span>
                        </div>
                        {healthCounselors
                          .filter(hc => {
                            if (!primaryHealthCounselorSearchTerm.trim()) return true;
                            const searchLower = primaryHealthCounselorSearchTerm.toLowerCase();
                            const fullName = `${hc.firstName} ${hc.lastName}`.toLowerCase();
                            return fullName.includes(searchLower) || hc.email?.toLowerCase().includes(searchLower);
                          })
                          .map((hc) => (
                            <div
                              key={hc._id}
                              className={`flex items-center gap-2 p-2 cursor-pointer transition-colors ${primaryHealthCounselorId === hc._id ? 'bg-purple-100 border-l-4 border-l-purple-500' : 'hover:bg-gray-50'}`}
                              onClick={() => {
                                setPrimaryHealthCounselorId(hc._id);
                                // Auto-remove from secondary if being selected as primary
                                setSecondaryHealthCounselorIds(prev => prev.filter(id => id !== hc._id));
                              }}
                            >
                              <input type="radio" checked={primaryHealthCounselorId === hc._id} onChange={() => { }} className="h-4 w-4 text-purple-600" />
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={hc.avatar} />
                                <AvatarFallback className="bg-purple-200 text-purple-800 text-xs">
                                  {hc.firstName?.[0]}{hc.lastName?.[0]}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1">
                                <p className="text-sm font-medium">{hc.firstName} {hc.lastName}</p>
                                <p className="text-xs text-gray-500">{hc.email}</p>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {hc.clientCount} clients
                              </Badge>
                            </div>
                          ))}
                        {healthCounselors.filter(hc => {
                          if (!primaryHealthCounselorSearchTerm.trim()) return true;
                          const searchLower = primaryHealthCounselorSearchTerm.toLowerCase();
                          const fullName = `${hc.firstName} ${hc.lastName}`.toLowerCase();
                          return fullName.includes(searchLower) || hc.email?.toLowerCase().includes(searchLower);
                        }).length === 0 && (
                            <p className="text-sm text-gray-500 text-center py-3">No health counselors found</p>
                          )}
                      </div>
                      {primaryHealthCounselorId && (
                        <div className="flex items-center gap-2 p-2 bg-purple-100 rounded-lg border border-purple-300">
                          <span className="px-1.5 py-0.5 text-xs font-bold rounded bg-blue-500 text-white">P</span>
                          {(() => {
                            const hc = healthCounselors.find(h => h._id === primaryHealthCounselorId);
                            return hc ? (
                              <>
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={hc.avatar} />
                                  <AvatarFallback className="bg-purple-200 text-purple-800 text-xs">
                                    {hc.firstName?.[0]}{hc.lastName?.[0]}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm font-medium">{hc.firstName} {hc.lastName}</span>
                                <span className="text-xs text-gray-500">{hc.email}</span>
                              </>
                            ) : null;
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Secondary Health Counselors */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <span className="px-2 py-0.5 text-xs font-bold rounded bg-gray-400 text-white">SECONDARY</span>
                        Select Secondary Health Counselors
                        <span className="text-gray-400 font-normal">(saved to assignedHealthCounselors array)</span>
                      </label>
                      <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Search health counselors..."
                          value={healthCounselorSearchTerm}
                          onChange={(e) => setHealthCounselorSearchTerm(e.target.value)}
                          className="pl-9 bg-white"
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1 bg-white">
                        {healthCounselors
                          .filter(hc => hc._id !== primaryHealthCounselorId) // Exclude primary from secondary list
                          .filter(hc => {
                            if (!healthCounselorSearchTerm.trim()) return true;
                            const searchLower = healthCounselorSearchTerm.toLowerCase();
                            const fullName = `${hc.firstName} ${hc.lastName}`.toLowerCase();
                            return fullName.includes(searchLower) || hc.email?.toLowerCase().includes(searchLower);
                          })
                          .map((hc) => (
                            <div
                              key={hc._id}
                              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${secondaryHealthCounselorIds.includes(hc._id)
                                ? 'bg-purple-100 border border-purple-300'
                                : 'hover:bg-gray-50 border border-transparent'
                                }`}
                              onClick={() => {
                                setSecondaryHealthCounselorIds(prev =>
                                  prev.includes(hc._id)
                                    ? prev.filter(id => id !== hc._id)
                                    : [...prev, hc._id]
                                );
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={secondaryHealthCounselorIds.includes(hc._id)}
                                  onChange={() => { }}
                                  className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                />
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={hc.avatar} />
                                  <AvatarFallback className="bg-purple-200 text-purple-800 text-xs">
                                    {hc.firstName?.[0]}{hc.lastName?.[0]}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="text-sm font-medium">{hc.firstName} {hc.lastName}</p>
                                  <p className="text-xs text-gray-500">{hc.email}</p>
                                </div>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {hc.clientCount} clients
                              </Badge>
                            </div>
                          ))}
                        {healthCounselors.filter(hc => hc._id !== primaryHealthCounselorId).length === 0 && (
                          <p className="text-sm text-gray-500 text-center py-2">No other health counselors available</p>
                        )}
                      </div>
                      {secondaryHealthCounselorIds.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {secondaryHealthCounselorIds.map(id => {
                            const hc = healthCounselors.find(h => h._id === id);
                            if (!hc) return null;
                            return (
                              <Badge
                                key={id}
                                variant="secondary"
                                className="flex items-center gap-1 bg-gray-100 text-gray-800"
                              >
                                <span className="px-1 py-0.5 text-[10px] font-bold rounded bg-gray-400 text-white">S</span>
                                {hc.firstName} {hc.lastName}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSecondaryHealthCounselorIds(prev => prev.filter(i => i !== id));
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

              {/* Summary of changes */}
              <div className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold text-gray-900 mb-3">Assignment Summary</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600 mb-1">Dietitians:</p>
                    <p className="font-medium">
                      {primaryDietitianId ? '1 Primary' : 'No Primary'}
                      {secondaryDietitianIds.length > 0 ? ` + ${secondaryDietitianIds.length} Secondary` : ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600 mb-1">Health Counselors:</p>
                    <p className="font-medium">
                      {primaryHealthCounselorId ? '1 Primary' : 'No Primary'}
                      {secondaryHealthCounselorIds.length > 0 ? ` + ${secondaryHealthCounselorIds.length} Secondary` : ''}
                    </p>
                  </div>
                </div>
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
                className="bg-blue-600 hover:bg-blue-700"
              >
                {assigning ? 'Saving...' : 'Save Assignments'}
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
