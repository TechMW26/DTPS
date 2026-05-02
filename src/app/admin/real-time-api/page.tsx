'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { AlertCircle, Clock3, Link2, RefreshCw, ServerCrash, UserCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { UserRole } from '@/types';

type RuntimeRecord = {
    id: string;
    title: string;
    message: string;
    type: string;
    source: string;
    priority: string;
    category: string;
    status: string;
    section: string;
    apiEndpoint: string;
    actor: {
        id?: string;
        name: string;
        email?: string;
        role: string;
    };
    createdAt: string;
    errorStack?: string;
    details?: Record<string, unknown>;
};

type ApiResponse = {
    records: RuntimeRecord[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
};

const roleLabel = (role: string) => {
    if (role === 'health_counselor') return 'Health Counselor';
    if (role === 'dietitian') return 'Dietitian';
    if (role === 'client') return 'User';
    if (role === 'admin') return 'Admin';
    return 'Unknown';
};

const sectionLabel = (section: string) => {
    if (section === 'health_counselor') return 'Health Counselor';
    if (section === 'dietitian') return 'Dietitian';
    if (section === 'client') return 'User';
    if (section === 'admin') return 'Admin';
    if (section === 'internal') return 'Internal';
    if (section === 'user') return 'User';
    return 'Unknown';
};

const roleBadgeClass = (role: string) => {
    if (role === 'admin') return 'bg-purple-100 text-purple-800';
    if (role === 'dietitian') return 'bg-blue-100 text-blue-800';
    if (role === 'health_counselor') return 'bg-teal-100 text-teal-800';
    if (role === 'client') return 'bg-green-100 text-green-800';
    return 'bg-slate-100 text-slate-700';
};

const priorityBadgeClass = (priority: string) => {
    if (priority === 'critical') return 'bg-red-100 text-red-800';
    if (priority === 'high') return 'bg-orange-100 text-orange-800';
    if (priority === 'medium') return 'bg-yellow-100 text-yellow-800';
    return 'bg-slate-100 text-slate-800';
};

const statusBadgeClass = (status: string) => {
    if (status === 'new') return 'bg-red-100 text-red-800';
    if (status === 'acknowledged') return 'bg-yellow-100 text-yellow-800';
    if (status === 'resolved') return 'bg-green-100 text-green-800';
    return 'bg-slate-100 text-slate-700';
};

export default function RealTimeApiErrorsPage() {
    const { data: session } = useSession();

    const [records, setRecords] = useState<RuntimeRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRecord, setSelectedRecord] = useState<RuntimeRecord | null>(null);
    const [detailsOpen, setDetailsOpen] = useState(false);

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    const [search, setSearch] = useState('');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [roleFilter, setRoleFilter] = useState('all');
    const [sectionFilter, setSectionFilter] = useState('all');

    const fetchRecords = useCallback(async () => {
        try {
            setLoading(true);

            const params = new URLSearchParams({
                page: String(page),
                limit: '20',
                source: sourceFilter,
                status: statusFilter,
                role: roleFilter,
                section: sectionFilter,
            });

            if (search.trim()) {
                params.set('search', search.trim());
            }

            const response = await fetch(`/api/admin/real-time-api?${params.toString()}`);
            if (!response.ok) {
                throw new Error('Failed to load runtime errors');
            }

            const data: ApiResponse = await response.json();
            setRecords(data.records || []);
            setTotalPages(data.pagination?.totalPages || 1);
            setTotal(data.pagination?.total || 0);
        } catch (error) {
            console.error('Failed to fetch runtime errors:', error);
            toast.error('Failed to load runtime errors');
        } finally {
            setLoading(false);
        }
    }, [page, search, sourceFilter, statusFilter, roleFilter, sectionFilter]);

    useEffect(() => {
        fetchRecords();
    }, [fetchRecords]);

    useEffect(() => {
        const interval = setInterval(() => {
            fetchRecords();
        }, 15000);

        return () => clearInterval(interval);
    }, [fetchRecords]);

    const criticalCount = useMemo(
        () => records.filter((record) => record.priority === 'critical' || record.type === 'critical').length,
        [records]
    );

    const newCount = useMemo(
        () => records.filter((record) => record.status === 'new').length,
        [records]
    );

    if (session?.user?.role !== UserRole.ADMIN) {
        return (
            <DashboardLayout>
                <div className="p-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Unauthorized</CardTitle>
                            <CardDescription>Only admin can access this page.</CardDescription>
                        </CardHeader>
                    </Card>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="space-y-6 p-4 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold text-gray-900">Real-Time API Runtime Errors</h1>
                        <p className="text-sm text-gray-600">
                            Admin-only live error stream with section, API, actor role, and actor name.
                        </p>
                    </div>
                    <Button onClick={fetchRecords} variant="outline" size="sm" disabled={loading}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Card>
                        <CardContent className="p-4">
                            <p className="text-sm text-gray-500">Total Runtime Errors</p>
                            <p className="mt-1 text-2xl font-semibold text-gray-900">{total}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4">
                            <p className="text-sm text-gray-500">Critical</p>
                            <p className="mt-1 text-2xl font-semibold text-red-700">{criticalCount}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4">
                            <p className="text-sm text-gray-500">New</p>
                            <p className="mt-1 text-2xl font-semibold text-orange-700">{newCount}</p>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Filter Runtime Errors</CardTitle>
                        <CardDescription>Filter by role, section, source, status, and keyword.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                            <Input
                                placeholder="Search message/API/name"
                                value={search}
                                onChange={(event) => {
                                    setPage(1);
                                    setSearch(event.target.value);
                                }}
                            />

                            <Select value={sectionFilter} onValueChange={(value) => { setPage(1); setSectionFilter(value); }}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Section" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Sections</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="client">User</SelectItem>
                                    <SelectItem value="dietitian">Dietitian</SelectItem>
                                    <SelectItem value="health_counselor">Health Counselor</SelectItem>
                                    <SelectItem value="internal">Internal</SelectItem>
                                    <SelectItem value="unknown">Unknown</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={roleFilter} onValueChange={(value) => { setPage(1); setRoleFilter(value); }}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Actor Role" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Roles</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="client">User</SelectItem>
                                    <SelectItem value="dietitian">Dietitian</SelectItem>
                                    <SelectItem value="health_counselor">Health Counselor</SelectItem>
                                    <SelectItem value="unknown">Unknown</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={sourceFilter} onValueChange={(value) => { setPage(1); setSourceFilter(value); }}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Source" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Sources</SelectItem>
                                    <SelectItem value="api">API</SelectItem>
                                    <SelectItem value="database">Database</SelectItem>
                                    <SelectItem value="auth">Auth</SelectItem>
                                    <SelectItem value="payment">Payment</SelectItem>
                                    <SelectItem value="email">Email</SelectItem>
                                    <SelectItem value="system">System</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={statusFilter} onValueChange={(value) => { setPage(1); setStatusFilter(value); }}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="new">New</SelectItem>
                                    <SelectItem value="acknowledged">Acknowledged</SelectItem>
                                    <SelectItem value="resolved">Resolved</SelectItem>
                                    <SelectItem value="ignored">Ignored</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Runtime Error List</CardTitle>
                        <CardDescription>
                            Proper list with section, error, API, and actor details.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <LoadingSpinner size="lg" />
                            </div>
                        ) : records.length === 0 ? (
                            <div className="py-12 text-center">
                                <ServerCrash className="mx-auto h-10 w-10 text-gray-300" />
                                <p className="mt-3 text-sm text-gray-600">No runtime errors found.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {records.map((record) => (
                                    <div key={record.id} className="rounded-lg border p-4">
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                            <div className="space-y-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <AlertCircle className="h-4 w-4 text-red-600" />
                                                    <h3 className="font-medium text-gray-900">{record.title}</h3>
                                                    <Badge className={priorityBadgeClass(record.priority)}>{record.priority}</Badge>
                                                    <Badge className={statusBadgeClass(record.status)}>{record.status}</Badge>
                                                </div>
                                                <p className="text-sm text-gray-700">{record.message}</p>
                                                {record.apiEndpoint !== 'unknown' && (
                                                    <div className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1">
                                                        <Link2 className="h-3.5 w-3.5 text-indigo-500" />
                                                        <code className="text-xs font-mono font-medium text-indigo-700 break-all">{record.apiEndpoint}</code>
                                                    </div>
                                                )}
                                            </div>

                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    setSelectedRecord(record);
                                                    setDetailsOpen(true);
                                                }}
                                            >
                                                Details
                                            </Button>
                                        </div>

                                        <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-gray-600 sm:grid-cols-2 lg:grid-cols-4">
                                            <div className="rounded-md bg-slate-50 p-2">
                                                <p className="font-medium text-gray-800">Section</p>
                                                <p>{sectionLabel(record.section)}</p>
                                            </div>
                                            <div className="rounded-md border border-indigo-100 bg-indigo-50 p-2">
                                                <p className="font-medium text-indigo-800">API Endpoint</p>
                                                <code className="text-[11px] font-mono text-indigo-700 break-all">{record.apiEndpoint}</code>
                                            </div>
                                            <div className="rounded-md bg-slate-50 p-2 space-y-1">
                                                <p className="font-medium text-gray-800">Actor</p>
                                                <div className="flex items-center gap-1.5">
                                                    <UserCircle2 className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                                                    <p className="font-semibold text-gray-900 truncate">{record.actor.name}</p>
                                                </div>
                                                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${roleBadgeClass(record.actor.role)}`}>
                                                    {roleLabel(record.actor.role)}
                                                </span>
                                                {record.actor.email && (
                                                    <p className="text-[10px] text-gray-500 truncate">{record.actor.email}</p>
                                                )}
                                            </div>
                                            <div className="rounded-md bg-slate-50 p-2">
                                                <p className="font-medium text-gray-800">Occurred</p>
                                                <p className="inline-flex items-center gap-1">
                                                    <Clock3 className="h-3 w-3" />
                                                    {format(new Date(record.createdAt), 'dd MMM yyyy, hh:mm a')}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {totalPages > 1 && (
                                    <div className="flex items-center justify-between border-t pt-4">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPage((previousPage) => Math.max(1, previousPage - 1))}
                                            disabled={page === 1}
                                        >
                                            Previous
                                        </Button>
                                        <p className="text-sm text-gray-600">Page {page} of {totalPages}</p>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPage((previousPage) => Math.min(totalPages, previousPage + 1))}
                                            disabled={page === totalPages}
                                        >
                                            Next
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
                    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
                        <DialogHeader>
                            <DialogTitle>Runtime Error Details</DialogTitle>
                        </DialogHeader>

                        {selectedRecord && (
                            <div className="space-y-4 text-sm">
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div className="rounded-md border p-3">
                                        <p className="text-xs text-gray-500">Section</p>
                                        <p className="font-medium">{sectionLabel(selectedRecord.section)}</p>
                                    </div>
                                    <div className="rounded-md border p-3">
                                        <p className="text-xs text-gray-500">Error Type</p>
                                        <p className="font-medium">{selectedRecord.type}</p>
                                    </div>
                                    <div className="rounded-md border border-indigo-200 bg-indigo-50 p-3">
                                        <p className="text-xs text-indigo-600">API Endpoint</p>
                                        <code className="break-all font-mono text-sm font-semibold text-indigo-800">{selectedRecord.apiEndpoint}</code>
                                    </div>
                                    <div className="rounded-md border p-3">
                                        <p className="text-xs text-gray-500">Source</p>
                                        <p className="font-medium">{selectedRecord.source}</p>
                                    </div>
                                </div>

                                <div className="rounded-md border p-3 space-y-2">
                                    <p className="text-xs text-gray-500 font-medium">Actor</p>
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100">
                                            <UserCircle2 className="h-5 w-5 text-slate-500" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-gray-900">{selectedRecord.actor.name}</p>
                                            <p className="text-xs text-gray-500">{selectedRecord.actor.email || 'No email available'}</p>
                                        </div>
                                        <span className={`ml-auto rounded-full px-2.5 py-1 text-xs font-semibold ${roleBadgeClass(selectedRecord.actor.role)}`}>
                                            {roleLabel(selectedRecord.actor.role)}
                                        </span>
                                    </div>
                                </div>

                                <div className="rounded-md border p-3">
                                    <p className="mb-1 text-xs text-gray-500">Error Message</p>
                                    <p>{selectedRecord.message}</p>
                                </div>

                                {selectedRecord.errorStack ? (
                                    <div className="rounded-md border border-red-200 bg-red-50 p-3">
                                        <p className="mb-1 text-xs text-red-700">Stack Trace</p>
                                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-red-800">{selectedRecord.errorStack}</pre>
                                    </div>
                                ) : null}

                                {selectedRecord.details && Object.keys(selectedRecord.details).length > 0 ? (
                                    <div className="rounded-md border p-3">
                                        <p className="mb-1 text-xs text-gray-500">Full Details</p>
                                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-gray-700">
                                            {JSON.stringify(selectedRecord.details, null, 2)}
                                        </pre>
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        </DashboardLayout>
    );
}
