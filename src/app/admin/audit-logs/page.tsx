'use client';

import { useEffect, useState } from 'react';
import { formatDateTimeIST } from '@/lib/utils/formatDateIST';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { LogsIcon, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';

interface AuditLog {
  _id: string;
  adminId: string;
  adminEmail: string;
  action: string;
  targetUserId: string;
  targetUserEmail: string;
  targetUserRole: string;
  changes: Record<string, { old: any; new: any }>;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

interface Filters {
  adminEmail: string;
  targetUserEmail: string;
  action: string;
  startDate: string;
  endDate: string;
}

const ACTIONS = [
  'create_user',
  'update_user',
  'deactivate_user',
  'activate_user',
  'suspend_user',
  'unsuspend_user',
  'change_role',
  'change_status',
  'delete_user',
];

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [limit] = useState(50);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    adminEmail: '',
    targetUserEmail: '',
    action: '',
    startDate: '',
    endDate: '',
  });

  const fetchLogs = async (pageNum = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: limit.toString(),
      });

      if (filters.adminEmail) params.append('adminId', filters.adminEmail);
      if (filters.targetUserEmail) params.append('targetUserId', filters.targetUserEmail);
      if (filters.action) params.append('action', filters.action);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const res = await fetch(`/api/admin/audit-logs?${params}`);

      if (!res.ok) throw new Error('Failed to fetch logs');

      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
      setPage(pageNum);
    } catch (error) {
      console.error('Error fetching logs:', error);
      toast.error('Failed to fetch audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setIsClient(true);
    fetchLogs(0);
  }, []);

  const handleFilterChange = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleApplyFilters = () => {
    setPage(0);
    fetchLogs(0);
  };

  const handleReset = () => {
    setFilters({
      adminEmail: '',
      targetUserEmail: '',
      action: '',
      startDate: '',
      endDate: '',
    });
    setPage(0);
    fetchLogs(0);
  };

  const getActionColor = (action: string) => {
    if (action.includes('deactivate') || action.includes('suspend') || action.includes('delete')) {
      return 'text-red-600 bg-red-50';
    }
    if (action.includes('activate') || action.includes('unsuspend')) {
      return 'text-green-600 bg-green-50';
    }
    if (action.includes('change') || action.includes('update')) {
      return 'text-blue-600 bg-blue-50';
    }
    return 'text-gray-600 bg-gray-50';
  };

  const pages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <LogsIcon className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Admin Audit Logs</h1>
          </div>
          <p className="text-gray-600">Track all admin actions and user changes</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <Input
              placeholder="Admin Email"
              value={filters.adminEmail}
              onChange={(e) => handleFilterChange('adminEmail', e.target.value)}
              className="border-gray-300"
            />
            <Input
              placeholder="Target User Email"
              value={filters.targetUserEmail}
              onChange={(e) => handleFilterChange('targetUserEmail', e.target.value)}
              className="border-gray-300"
            />
            <Select value={filters.action} onValueChange={(value) => handleFilterChange('action', value)}>
              <SelectTrigger className="border-gray-300">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Actions</SelectItem>
                {ACTIONS.map((act) => (
                  <SelectItem key={act} value={act}>
                    {act.replace(/_/g, ' ').toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              className="border-gray-300"
            />
            <Input
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              className="border-gray-300"
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleApplyFilters}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? 'Loading...' : 'Apply Filters'}
            </Button>
            <Button
              onClick={handleReset}
              variant="outline"
              className="flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-100">
                  <TableHead className="font-semibold text-gray-900">Admin</TableHead>
                  <TableHead className="font-semibold text-gray-900">Action</TableHead>
                  <TableHead className="font-semibold text-gray-900">Target User</TableHead>
                  <TableHead className="font-semibold text-gray-900">Changes</TableHead>
                  <TableHead className="font-semibold text-gray-900">Timestamp</TableHead>
                  <TableHead className="font-semibold text-gray-900">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                      {loading ? 'Loading logs...' : 'No audit logs found'}
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log._id} className="hover:bg-gray-50">
                      <TableCell className="text-sm text-gray-700">
                        <div className="font-medium">{log.adminEmail}</div>
                        <div className="text-xs text-gray-500">{log.adminId.slice(0, 8)}</div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getActionColor(log.action)}`}>
                          {log.action.replace(/_/g, ' ').toUpperCase()}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-gray-700">
                        <div className="font-medium">{log.targetUserEmail}</div>
                        <div className="text-xs text-gray-500">{log.targetUserRole}</div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {Object.keys(log.changes).length > 0 ? (
                          <div className="text-xs">
                            <span className="font-medium">{Object.keys(log.changes).length}</span> field(s) changed
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 whitespace-nowrap">
                        {isClient
                          ? formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Button
                          onClick={() => setSelectedLog(log)}
                          variant="outline"
                          size="sm"
                          className="text-blue-600 hover:text-blue-700"
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                Showing {page * limit + 1} to {Math.min((page + 1) * limit, total)} of {total} logs
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => fetchLogs(page - 1)}
                  disabled={page === 0 || loading}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>
                <span className="flex items-center gap-2 text-sm text-gray-600">
                  Page {page + 1} of {pages}
                </span>
                <Button
                  onClick={() => fetchLogs(page + 1)}
                  disabled={page >= pages - 1 || loading}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Audit Log Details</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pr-2">
              {/* Admin Info */}
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <h3 className="font-semibold text-blue-900 mb-3">Admin Information</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="min-w-0">
                      <span className="text-blue-700 font-medium text-sm">Email:</span>
                      <p className="text-gray-700 text-sm truncate">{selectedLog.adminEmail}</p>
                    </div>
                    <div className="min-w-0">
                      <span className="text-blue-700 font-medium text-sm">ID:</span>
                      <p className="text-gray-700 font-mono text-xs break-all">{selectedLog.adminId}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="min-w-0">
                      <span className="text-blue-700 font-medium text-sm">IP Address:</span>
                      <p className="text-gray-700 font-mono text-xs break-all">{selectedLog.ipAddress}</p>
                    </div>
                    <div className="min-w-0">
                      <span className="text-blue-700 font-medium text-sm">Timestamp:</span>
                      <p className="text-gray-700 text-sm">
                        {isClient ? formatDateTimeIST(selectedLog.createdAt) : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Info */}
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <h3 className="font-semibold text-green-900 mb-3">Action Information</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="min-w-0">
                      <span className="text-green-700 font-medium text-sm">Action:</span>
                      <p className="text-gray-700 font-semibold text-sm">{selectedLog.action.replace(/_/g, ' ').toUpperCase()}</p>
                    </div>
                    <div className="min-w-0">
                      <span className="text-green-700 font-medium text-sm">Target User Role:</span>
                      <p className="text-gray-700 capitalize text-sm">{selectedLog.targetUserRole}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="min-w-0">
                      <span className="text-green-700 font-medium text-sm">Target User Email:</span>
                      <p className="text-gray-700 text-sm truncate">{selectedLog.targetUserEmail}</p>
                    </div>
                    <div className="min-w-0">
                      <span className="text-green-700 font-medium text-sm">Target User ID:</span>
                      <p className="text-gray-700 font-mono text-xs break-all">{selectedLog.targetUserId}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Changes */}
              {Object.keys(selectedLog.changes).length > 0 && (
                <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                  <h3 className="font-semibold text-purple-900 mb-4">Changes Made</h3>
                  <div className="space-y-4 max-h-80 overflow-y-auto">
                    {Object.entries(selectedLog.changes).map(([field, change]) => (
                      <div key={field} className="bg-white rounded p-4 border border-purple-100">
                        <p className="font-medium text-purple-900 mb-3 text-sm uppercase">{field.replace(/_/g, ' ')}</p>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div className="min-w-0">
                            <span className="text-red-600 font-semibold text-xs block mb-1">Old Value:</span>
                            <div className="bg-red-50 rounded p-2 border border-red-200 min-h-10 overflow-auto max-h-24">
                              <p className="text-gray-700 text-xs font-mono break-all whitespace-pre-wrap">
                                {JSON.stringify(change.old) === 'null' ? '(empty)' : JSON.stringify(change.old)}
                              </p>
                            </div>
                          </div>
                          <div className="min-w-0">
                            <span className="text-green-600 font-semibold text-xs block mb-1">New Value:</span>
                            <div className="bg-green-50 rounded p-2 border border-green-200 min-h-10 overflow-auto max-h-24">
                              <p className="text-gray-700 text-xs font-mono break-all whitespace-pre-wrap">
                                {JSON.stringify(change.new) === 'null' ? '(empty)' : JSON.stringify(change.new)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Request Info */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h3 className="font-semibold text-gray-900 mb-3">Request Information</h3>
                <div className="text-xs font-mono text-gray-600 bg-white rounded p-3 border border-gray-200 overflow-auto max-h-32 break-all whitespace-pre-wrap">
                  {selectedLog.userAgent}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
