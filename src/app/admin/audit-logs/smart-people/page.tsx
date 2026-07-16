'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDateTimeIST } from '@/lib/utils/formatDateIST';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { formatDistanceToNow } from 'date-fns';
import {
    Eye,
    Search,
    Users,
    Stethoscope,
    HeartPulse,
    UserCheck,
    ShieldCheck,
    Activity,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ChangeDetail {
    fieldName: string;
    oldValue: any;
    newValue: any;
}

interface ActivityLog {
    _id: string;
    userId: string;
    userEmail: string;
    userName: string;
    userPhone?: string;
    userAvatar?: string;
    userRole: 'admin' | 'dietitian' | 'health_counselor' | 'client';
    action: string;
    actionType: string;
    category: string;
    description: string;
    targetUserId?: string;
    targetUserName?: string;
    targetUserPhone?: string;
    changeDetails?: ChangeDetail[];
    details?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    createdAt: string;
}

type RoleFilter = 'all' | 'dietitian' | 'health_counselor' | 'client' | 'admin';

interface ApiResponse {
    logs: ActivityLog[];
    total: number;
    page: number;
    limit: number;
    pages: number;
    roleCounts: Record<string, number>;
    actionTypes: string[];
    categories: string[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const roleLabel = (r?: string) => {
    if (!r) return '—';
    const map: Record<string, string> = {
        admin: 'Admin',
        dietitian: 'Dietitian',
        health_counselor: 'Health Counselor',
        client: 'Client',
    };
    return map[r] ?? r;
};

const roleBadgeClass = (r?: string) => {
    switch (r) {
        case 'admin':
            return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
        case 'dietitian':
            return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
        case 'health_counselor':
            return 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300';
        case 'client':
            return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
        default:
            return 'bg-gray-100 text-gray-700';
    }
};

const actionBadgeClass = (t?: string) => {
    switch (t) {
        case 'create':
            return 'bg-green-100 text-green-700';
        case 'update':
            return 'bg-blue-100 text-blue-700';
        case 'delete':
            return 'bg-red-100 text-red-700';
        case 'assign':
            return 'bg-indigo-100 text-indigo-700';
        case 'login':
        case 'logout':
            return 'bg-yellow-100 text-yellow-700';
        case 'view':
            return 'bg-gray-100 text-gray-600';
        case 'complete':
            return 'bg-emerald-100 text-emerald-700';
        case 'payment':
            return 'bg-pink-100 text-pink-700';
        default:
            return 'bg-gray-100 text-gray-700';
    }
};

const categoryLabel = (c?: string) =>
    c ? c.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()) : '—';

/* ------------------------------------------------------------------ */
/*  Role filter tab config                                             */
/* ------------------------------------------------------------------ */

const ROLE_TABS: {
    key: RoleFilter;
    label: string;
    icon: React.ReactNode;
    color: string;
    bgActive: string;
    borderActive: string;
}[] = [
        {
            key: 'all',
            label: 'All',
            icon: <Users className="w-4 h-4" />,
            color: 'text-gray-700',
            bgActive: 'bg-gray-900 text-white',
            borderActive: 'border-gray-900',
        },
        {
            key: 'dietitian',
            label: 'Dietitian',
            icon: <Stethoscope className="w-4 h-4" />,
            color: 'text-blue-700',
            bgActive: 'bg-blue-600 text-white',
            borderActive: 'border-blue-600',
        },
        {
            key: 'health_counselor',
            label: 'Health Counselor',
            icon: <HeartPulse className="w-4 h-4" />,
            color: 'text-teal-700',
            bgActive: 'bg-teal-600 text-white',
            borderActive: 'border-teal-600',
        },
        {
            key: 'client',
            label: 'Client / User',
            icon: <UserCheck className="w-4 h-4" />,
            color: 'text-orange-700',
            bgActive: 'bg-orange-600 text-white',
            borderActive: 'border-orange-600',
        },
        {
            key: 'admin',
            label: 'Admin',
            icon: <ShieldCheck className="w-4 h-4" />,
            color: 'text-purple-700',
            bgActive: 'bg-purple-600 text-white',
            borderActive: 'border-purple-600',
        },
    ];

const ITEMS_PER_PAGE = 40;

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function SmartPeopleAuditLogsPage() {
    const [isClient, setIsClient] = useState(false);
    const [loading, setLoading] = useState(true);
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

    // Filters
    const [activeRole, setActiveRole] = useState<RoleFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [actionTypeFilter, setActionTypeFilter] = useState<string>('all');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

    // Stats & dropdown options
    const [roleCounts, setRoleCounts] = useState<Record<string, number>>({
        all: 0,
        admin: 0,
        dietitian: 0,
        health_counselor: 0,
        client: 0,
    });
    const [actionTypes, setActionTypes] = useState<string[]>([]);
    const [categories, setCategories] = useState<string[]>([]);

    // Debounced search
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        setIsClient(true);
    }, []);

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery);
            setCurrentPage(1); // Reset to page 1 on search
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Fetch logs from API
    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('page', currentPage.toString());
            params.set('limit', ITEMS_PER_PAGE.toString());

            if (activeRole !== 'all') {
                params.set('role', activeRole);
            }
            if (actionTypeFilter !== 'all') {
                params.set('actionType', actionTypeFilter);
            }
            if (categoryFilter !== 'all') {
                params.set('category', categoryFilter);
            }
            if (debouncedSearch.trim()) {
                params.set('search', debouncedSearch.trim());
            }

            const res = await fetch(`/api/admin/audit-logs/smart-people?${params.toString()}`);

            if (!res.ok) {
                throw new Error('Failed to fetch');
            }

            const data: ApiResponse = await res.json();

            setLogs(data.logs);
            setTotalPages(data.pages);
            setTotalItems(data.total);
            setRoleCounts(data.roleCounts);
            setActionTypes(data.actionTypes);
            setCategories(data.categories);
        } catch (error) {
            console.error('Error fetching audit logs:', error);
        } finally {
            setLoading(false);
        }
    }, [currentPage, activeRole, actionTypeFilter, categoryFilter, debouncedSearch]);

    // Fetch on mount and when filters change
    useEffect(() => {
        if (isClient) {
            fetchLogs();
        }
    }, [isClient, fetchLogs]);

    // Handle role filter change
    const handleRoleChange = (role: RoleFilter) => {
        setActiveRole(role);
        setCurrentPage(1);
    };

    // Handle action type filter change
    const handleActionTypeChange = (type: string) => {
        setActionTypeFilter(type);
        setCurrentPage(1);
    };

    // Handle category filter change
    const handleCategoryChange = (cat: string) => {
        setCategoryFilter(cat);
        setCurrentPage(1);
    };

    // Clear all filters
    const clearFilters = () => {
        setActiveRole('all');
        setActionTypeFilter('all');
        setCategoryFilter('all');
        setSearchQuery('');
        setDebouncedSearch('');
        setCurrentPage(1);
    };

    // Pagination helpers
    const goToPage = (page: number) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
        }
    };

    // Calculate visible page numbers
    const visiblePages = useMemo(() => {
        const pages: number[] = [];
        const maxVisible = 5;

        let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let end = Math.min(totalPages, start + maxVisible - 1);

        if (end - start + 1 < maxVisible) {
            start = Math.max(1, end - maxVisible + 1);
        }

        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        return pages;
    }, [currentPage, totalPages]);

    if (!isClient) {
        return (
            <div className="min-h-screen bg-gray-50 p-4 md:p-6">
                <div className="max-w-7xl mx-auto space-y-5">
                    <div className="h-20 rounded-xl bg-gray-200/70 animate-pulse" />
                    <div className="h-24 rounded-xl bg-gray-200/70 animate-pulse" />
                    <div className="h-96 rounded-xl bg-gray-200/70 animate-pulse" />
                </div>
            </div>
        );
    }

    const hasFilters = activeRole !== 'all' || actionTypeFilter !== 'all' || categoryFilter !== 'all' || searchQuery;

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-6">
            <div className="max-w-7xl mx-auto space-y-5">
                {/* ---- Header ---- */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl shadow-lg bg-linear-to-br from-indigo-500 to-purple-600">
                            <Activity className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                                Smart People Audit
                            </h1>
                            <p className="text-gray-500 text-sm">
                                Activity history across all roles • {totalItems.toLocaleString()} total records
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            onClick={fetchLogs}
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            disabled={loading}
                        >
                            {loading ? (
                                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                            ) : (
                                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                            )}
                            Refresh
                        </Button>
                    </div>
                </div>

                {/* ---- Role Stats Cards ---- */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {ROLE_TABS.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => handleRoleChange(tab.key)}
                            className={cn(
                                'relative flex flex-col items-center gap-1.5 rounded-xl p-3.5 border-2 transition-all duration-200 cursor-pointer',
                                activeRole === tab.key
                                    ? `${tab.bgActive} ${tab.borderActive} shadow-lg scale-[1.02]`
                                    : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
                            )}
                        >
                            <div
                                className={cn(
                                    'p-1.5 rounded-lg',
                                    activeRole === tab.key ? 'bg-white/20' : 'bg-gray-100'
                                )}
                            >
                                {tab.icon}
                            </div>
                            <span className="text-xs font-semibold">{tab.label}</span>
                            <span
                                className={cn(
                                    'text-lg font-bold',
                                    activeRole === tab.key ? 'text-white' : tab.color
                                )}
                            >
                                {roleCounts[tab.key]?.toLocaleString() || 0}
                            </span>
                        </button>
                    ))}
                </div>

                {/* ---- Filters Row ---- */}
                <div className="flex flex-col sm:flex-row gap-3">
                    {/* Search */}
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                            placeholder="Search by email, name, description, action…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 bg-white"
                        />
                    </div>

                    {/* Action type filter */}
                    <select
                        value={actionTypeFilter}
                        onChange={(e) => handleActionTypeChange(e.target.value)}
                        className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="all">All Actions</option>
                        {actionTypes.map((at) => (
                            <option key={at} value={at}>
                                {at.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                            </option>
                        ))}
                    </select>

                    {/* Category filter */}
                    <select
                        value={categoryFilter}
                        onChange={(e) => handleCategoryChange(e.target.value)}
                        className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="all">All Categories</option>
                        {categories.map((cat) => (
                            <option key={cat} value={cat}>
                                {cat.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                            </option>
                        ))}
                    </select>
                </div>

                {/* ---- Active Filter Tags ---- */}
                {hasFilters && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-gray-500">Showing:</span>
                        {activeRole !== 'all' && (
                            <span className={cn('rounded-full px-2.5 py-0.5 font-semibold', roleBadgeClass(activeRole))}>
                                {roleLabel(activeRole)}
                            </span>
                        )}
                        {actionTypeFilter !== 'all' && (
                            <span className={cn('rounded-full px-2.5 py-0.5 font-semibold', actionBadgeClass(actionTypeFilter))}>
                                {actionTypeFilter.replace(/_/g, ' ')}
                            </span>
                        )}
                        {categoryFilter !== 'all' && (
                            <span className="bg-amber-100 text-amber-700 rounded-full px-2.5 py-0.5 font-semibold">
                                {categoryLabel(categoryFilter)}
                            </span>
                        )}
                        {searchQuery && (
                            <span className="bg-gray-100 rounded-full px-2.5 py-0.5 font-medium text-gray-600">
                                &quot;{searchQuery}&quot;
                            </span>
                        )}
                        <button
                            onClick={clearFilters}
                            className="text-red-500 hover:text-red-700 font-semibold underline ml-1"
                        >
                            Clear All
                        </button>
                        <span className="ml-auto text-gray-400">
                            {totalItems} result{totalItems !== 1 ? 's' : ''}
                        </span>
                    </div>
                )}

                {/* ---- Table ---- */}
                <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-gray-50/80">
                                    <TableHead className="font-semibold text-gray-900">Performed By</TableHead>
                                    <TableHead className="font-semibold text-gray-900">Role</TableHead>
                                    <TableHead className="font-semibold text-gray-900">Operation</TableHead>
                                    <TableHead className="font-semibold text-gray-900">Description</TableHead>
                                    <TableHead className="font-semibold text-gray-900">Target User</TableHead>
                                    <TableHead className="font-semibold text-gray-900">Category</TableHead>
                                    <TableHead className="font-semibold text-gray-900">When</TableHead>
                                    <TableHead className="font-semibold text-gray-900 text-center">View</TableHead>
                                </TableRow>
                            </TableHeader>

                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-12">
                                            <div className="flex items-center justify-center gap-2 text-gray-500">
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                Loading activity logs...
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : logs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-12 text-gray-400">
                                            {hasFilters
                                                ? 'No matching logs found. Try changing your filters.'
                                                : 'No activity logs yet.'}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    logs.map((log) => (
                                        <TableRow key={log._id} className="hover:bg-gray-50/50 transition-colors">
                                            {/* Performed by */}
                                            <TableCell className="text-sm">
                                                <span className="font-medium text-gray-800 truncate block max-w-45">
                                                    {log.userName || '—'}
                                                </span>
                                                <span className="text-xs text-gray-400 block truncate max-w-45">
                                                    {log.userEmail}
                                                </span>
                                                <span className="text-xs text-gray-500 block truncate max-w-45">
                                                    📞 {log.userPhone || '9000000000'}
                                                </span>
                                            </TableCell>

                                            {/* Role */}
                                            <TableCell>
                                                <span
                                                    className={cn(
                                                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                                                        roleBadgeClass(log.userRole)
                                                    )}
                                                >
                                                    {roleLabel(log.userRole)}
                                                </span>
                                            </TableCell>

                                            {/* Operation */}
                                            <TableCell>
                                                <span
                                                    className={cn(
                                                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase',
                                                        actionBadgeClass(log.actionType)
                                                    )}
                                                >
                                                    {log.actionType?.replace(/_/g, ' ') || log.action}
                                                </span>
                                            </TableCell>

                                            {/* Description */}
                                            <TableCell className="text-sm text-gray-600 max-w-55">
                                                <span className="truncate block">{log.description || '—'}</span>
                                            </TableCell>

                                            {/* Target */}
                                            <TableCell className="text-sm text-gray-700">
                                                {log.targetUserName ? (
                                                    <span className="truncate block max-w-35">{log.targetUserName}</span>
                                                ) : (
                                                    <span className="text-gray-300">—</span>
                                                )}
                                            </TableCell>

                                            {/* Category */}
                                            <TableCell className="text-sm text-gray-600">
                                                <span className="bg-gray-100 rounded-full px-2 py-0.5 text-xs font-medium">
                                                    {categoryLabel(log.category)}
                                                </span>
                                            </TableCell>

                                            {/* When */}
                                            <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                                                {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                                            </TableCell>

                                            {/* View button */}
                                            <TableCell className="text-center">
                                                <Button
                                                    onClick={() => setSelectedLog(log)}
                                                    variant="outline"
                                                    size="sm"
                                                    className="flex items-center gap-1 mx-auto text-xs"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                    View
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* ---- Pagination ---- */}
                    {totalPages > 1 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/50">
                            <p className="text-sm text-gray-600">
                                Page <span className="font-semibold">{currentPage}</span> of{' '}
                                <span className="font-semibold">{totalPages}</span> • Showing{' '}
                                <span className="font-semibold">
                                    {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, totalItems)}
                                </span>
                                –
                                <span className="font-semibold">
                                    {Math.min(currentPage * ITEMS_PER_PAGE, totalItems)}
                                </span>{' '}
                                of <span className="font-semibold">{totalItems.toLocaleString()}</span>
                            </p>

                            <div className="flex items-center gap-1">
                                {/* First page */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => goToPage(1)}
                                    disabled={currentPage === 1 || loading}
                                    className="h-8 w-8 p-0"
                                >
                                    <ChevronsLeft className="w-4 h-4" />
                                </Button>

                                {/* Previous page */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => goToPage(currentPage - 1)}
                                    disabled={currentPage === 1 || loading}
                                    className="h-8 w-8 p-0"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>

                                {/* Page numbers */}
                                <div className="flex items-center gap-1 mx-1">
                                    {visiblePages[0] > 1 && (
                                        <>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => goToPage(1)}
                                                className="h-8 w-8 p-0 text-xs"
                                            >
                                                1
                                            </Button>
                                            {visiblePages[0] > 2 && (
                                                <span className="px-1 text-gray-400">…</span>
                                            )}
                                        </>
                                    )}

                                    {visiblePages.map((page) => (
                                        <Button
                                            key={page}
                                            variant={currentPage === page ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={() => goToPage(page)}
                                            disabled={loading}
                                            className={cn(
                                                'h-8 w-8 p-0 text-xs',
                                                currentPage === page && 'bg-indigo-600 hover:bg-indigo-700'
                                            )}
                                        >
                                            {page}
                                        </Button>
                                    ))}

                                    {visiblePages[visiblePages.length - 1] < totalPages && (
                                        <>
                                            {visiblePages[visiblePages.length - 1] < totalPages - 1 && (
                                                <span className="px-1 text-gray-400">…</span>
                                            )}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => goToPage(totalPages)}
                                                className="h-8 w-8 p-0 text-xs"
                                            >
                                                {totalPages}
                                            </Button>
                                        </>
                                    )}
                                </div>

                                {/* Next page */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => goToPage(currentPage + 1)}
                                    disabled={currentPage === totalPages || loading}
                                    className="h-8 w-8 p-0"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </Button>

                                {/* Last page */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => goToPage(totalPages)}
                                    disabled={currentPage === totalPages || loading}
                                    className="h-8 w-8 p-0"
                                >
                                    <ChevronsRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ---- Detail Dialog ---- */}
            {selectedLog && (
                <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
                    <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Eye className="w-5 h-5" />
                                Audit Log Details
                            </DialogTitle>
                        </DialogHeader>

                        <div className="space-y-4 pr-1">
                            {/* Performed By */}
                            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                                <h3 className="font-semibold text-blue-900 mb-3 uppercase text-xs tracking-wider">
                                    Performed By
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-blue-700 font-medium">Name</span>
                                        <p className="text-gray-700">{selectedLog.userName || '—'}</p>
                                    </div>
                                    <div>
                                        <span className="text-blue-700 font-medium">Email</span>
                                        <p className="text-gray-700 break-all">{selectedLog.userEmail}</p>
                                    </div>
                                    <div>
                                        <span className="text-blue-700 font-medium">Phone</span>
                                        <p className="text-gray-700">{selectedLog.userPhone || '9000000000'}</p>
                                    </div>
                                    <div>
                                        <span className="text-blue-700 font-medium">Role</span>
                                        <p>
                                            <span
                                                className={cn(
                                                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                                                    roleBadgeClass(selectedLog.userRole)
                                                )}
                                            >
                                                {roleLabel(selectedLog.userRole)}
                                            </span>
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-blue-700 font-medium">IP Address</span>
                                        <p className="text-gray-700 font-mono text-xs break-all">
                                            {selectedLog.ipAddress || '—'}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-blue-700 font-medium">Date &amp; Time</span>
                                        <p className="text-gray-700">
                                            {formatDateTimeIST(selectedLog.createdAt)}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-blue-700 font-medium">User ID</span>
                                        <p className="text-gray-700 font-mono text-xs break-all">
                                            {selectedLog.userId || '—'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Action & Target */}
                            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                                <h3 className="font-semibold text-green-900 mb-3 uppercase text-xs tracking-wider">
                                    Action &amp; Target
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-green-700 font-medium">Action</span>
                                        <p className="text-gray-700 font-mono text-xs">{selectedLog.action}</p>
                                    </div>
                                    <div>
                                        <span className="text-green-700 font-medium">Operation Type</span>
                                        <p>
                                            <span
                                                className={cn(
                                                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase',
                                                    actionBadgeClass(selectedLog.actionType)
                                                )}
                                            >
                                                {selectedLog.actionType?.replace(/_/g, ' ') || '—'}
                                            </span>
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-green-700 font-medium">Target User</span>
                                        <p className="text-gray-700">{selectedLog.targetUserName || '—'}</p>
                                    </div>
                                    <div>
                                        <span className="text-green-700 font-medium">Target Phone</span>
                                        <p className="text-gray-700">{selectedLog.targetUserPhone || '9000000000'}</p>
                                    </div>
                                    <div>
                                        <span className="text-green-700 font-medium">Target User ID</span>
                                        <p className="text-gray-700 font-mono text-xs break-all">
                                            {selectedLog.targetUserId || '—'}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-green-700 font-medium">Category</span>
                                        <p className="text-gray-700">{categoryLabel(selectedLog.category)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Description */}
                            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                                <h3 className="font-semibold text-purple-900 mb-3 uppercase text-xs tracking-wider">
                                    Description
                                </h3>
                                <p className="text-sm text-gray-700">{selectedLog.description}</p>
                            </div>

                            {/* Changes Made */}
                            {selectedLog.changeDetails && selectedLog.changeDetails.length > 0 && (
                                <div className="bg-white rounded-lg p-4 border border-purple-100">
                                    <h3 className="font-semibold text-purple-900 mb-4 uppercase text-xs tracking-wider">
                                        Changes Made — {selectedLog.changeDetails.length} Field(s)
                                    </h3>
                                    <div className="space-y-4 max-h-80 overflow-y-auto">
                                        {selectedLog.changeDetails.map((ch, idx) => (
                                            <div key={idx} className="bg-purple-50 rounded p-4 border border-purple-200">
                                                <p className="font-medium text-purple-900 mb-3 text-xs uppercase">
                                                    {ch.fieldName?.replace(/_/g, ' ')}
                                                </p>
                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                    <div className="min-w-0">
                                                        <span className="text-red-600 font-semibold text-xs block mb-1">
                                                            Old Value
                                                        </span>
                                                        <div className="bg-red-50 rounded p-2 border border-red-200 min-h-10 overflow-auto max-h-24">
                                                            <p className="text-gray-700 text-xs font-mono break-all whitespace-pre-wrap">
                                                                {ch.oldValue == null
                                                                    ? '(empty)'
                                                                    : typeof ch.oldValue === 'object'
                                                                        ? JSON.stringify(ch.oldValue)
                                                                        : String(ch.oldValue)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <span className="text-green-600 font-semibold text-xs block mb-1">
                                                            New Value
                                                        </span>
                                                        <div className="bg-green-50 rounded p-2 border border-green-200 min-h-10 overflow-auto max-h-24">
                                                            <p className="text-gray-700 text-xs font-mono break-all whitespace-pre-wrap">
                                                                {ch.newValue == null
                                                                    ? '(empty)'
                                                                    : typeof ch.newValue === 'object'
                                                                        ? JSON.stringify(ch.newValue)
                                                                        : String(ch.newValue)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Extra details */}
                            {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                                <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                                    <h3 className="font-semibold text-amber-900 mb-3 uppercase text-xs tracking-wider">
                                        Additional Details
                                    </h3>
                                    <div className="text-xs font-mono text-gray-700 bg-white rounded p-3 border border-amber-100 overflow-auto max-h-40 break-all whitespace-pre-wrap">
                                        {JSON.stringify(selectedLog.details, null, 2)}
                                    </div>
                                </div>
                            )}

                            {/* Request info */}
                            {selectedLog.userAgent && (
                                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                    <h3 className="font-semibold text-gray-900 mb-3 uppercase text-xs tracking-wider">
                                        Request Info
                                    </h3>
                                    <div className="text-xs font-mono text-gray-600 bg-white rounded p-3 border border-gray-200 overflow-auto max-h-32 break-all whitespace-pre-wrap">
                                        {selectedLog.userAgent}
                                    </div>
                                </div>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
