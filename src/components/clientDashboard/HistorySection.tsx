'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { 
  Clock, 
  User, 
  FileText, 
  CreditCard, 
  Calendar,
  Utensils,
  Activity,
  Heart,
  RefreshCw,
  UserPlus,
  Edit,
  Trash2,
  Upload,
  Download,
  ChevronDown,
  ChevronUp,
  ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';

interface ChangeDetail {
  fieldName: string;
  oldValue: any;
  newValue: any;
}

interface HistoryEntry {
  _id: string;
  action: string;
  description: string;
  category: 'profile' | 'medical' | 'lifestyle' | 'diet' | 'payment' | 'appointment' | 'document' | 'assignment' | 'other';
  createdAt: string;
  performedBy?: {
    name: string;
    email?: string;
    role: string;
  };
  metadata?: Record<string, any>;
  changeDetails?: ChangeDetail[];
}

interface HistorySectionProps {
  clientId: string;
  onRegisterReset?: (fn: () => void) => void;
}

const categoryIcons: Record<string, React.ReactNode> = {
  profile: <User className="h-4 w-4" />,
  medical: <Heart className="h-4 w-4" />,
  lifestyle: <Activity className="h-4 w-4" />,
  diet: <Utensils className="h-4 w-4" />,
  payment: <CreditCard className="h-4 w-4" />,
  appointment: <Calendar className="h-4 w-4" />,
  document: <FileText className="h-4 w-4" />,
  other: <Clock className="h-4 w-4" />,
};

const categoryColors: Record<string, string> = {
  profile: 'bg-blue-100 text-blue-700 border-blue-200',
  medical: 'bg-red-100 text-red-700 border-red-200',
  lifestyle: 'bg-green-100 text-green-700 border-green-200',
  diet: 'bg-orange-100 text-orange-700 border-orange-200',
  payment: 'bg-purple-100 text-purple-700 border-purple-200',
  appointment: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  document: 'bg-gray-100 text-gray-700 border-gray-200',
  other: 'bg-slate-100 text-slate-700 border-slate-200',
};

const actionIcons: Record<string, React.ReactNode> = {
  create: <UserPlus className="h-3 w-3" />,
  update: <Edit className="h-3 w-3" />,
  delete: <Trash2 className="h-3 w-3" />,
  upload: <Upload className="h-3 w-3" />,
  download: <Download className="h-3 w-3" />,
};

export default function HistorySection({ clientId, onRegisterReset }: HistorySectionProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchHistory();
  }, [clientId]);

  // Register reset callback for floating back button
  useEffect(() => {
    if (onRegisterReset) {
      onRegisterReset(() => {
        setExpandedItems(new Set());
        fetchHistory();
      });
    }
  }, [onRegisterReset]);

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/users/${clientId}/history?limit=100`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data.history || []);
      }
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM d, yyyy h:mm a');
    } catch {
      return 'Unknown date';
    }
  };

  const getRelativeTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins} min ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      return format(date, 'MMM d, yyyy');
    } catch {
      return 'Unknown';
    }
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) {
      return '<empty>';
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        return value.length > 0 ? value.join(', ') : '<empty>';
      }
      return JSON.stringify(value);
    }
    return String(value);
  };

  const formatFieldName = (fieldName: string): string => {
    // Convert camelCase to Title Case
    return fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <LoadingSpinner />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-blue-600" />
            Activity History
          </CardTitle>
          <button 
            onClick={fetchHistory}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No activity history yet</p>
            <p className="text-sm text-gray-400 mt-1">Client activities will appear here</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
            
            <div className="space-y-4">
              {history.map((entry, index) => (
                <div key={entry._id} className="relative pl-10">
                  {/* Timeline dot */}
                  <div className={`absolute left-2 top-1 h-5 w-5 rounded-full border-2 border-white shadow-sm flex items-center justify-center ${categoryColors[entry.category] || categoryColors.other}`}>
                    {categoryIcons[entry.category] || categoryIcons.other}
                  </div>
                  
                  {/* Content card */}
                  <div className="bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {entry.description}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <Badge 
                            variant="outline" 
                            className={`text-[10px] px-1.5 py-0 capitalize ${categoryColors[entry.category] || ''}`}
                          >
                            {entry.category}
                          </Badge>
                          {entry.performedBy && (
                            <span className="text-xs text-gray-500">
                              by {entry.performedBy.name}
                              {entry.performedBy.role && ` (${entry.performedBy.role})`}
                            </span>
                          )}
                        </div>
                        
                        {/* Change details section */}
                        {entry.changeDetails && entry.changeDetails.length > 0 && expandedItems.has(entry._id) && (
                          <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Changed Fields:</p>
                            {entry.changeDetails.map((change, idx) => (
                              <div key={idx} className="bg-white rounded p-2 border-l-2 border-blue-300 ml-2">
                                <p className="text-xs font-medium text-gray-900">
                                  {formatFieldName(change.fieldName)}
                                </p>
                                <div className="flex items-center gap-2 mt-1 text-xs">
                                  <span className="bg-red-50 text-red-700 px-2 py-1 rounded font-mono">
                                    {formatValue(change.oldValue)}
                                  </span>
                                  <span className="text-gray-400">→</span>
                                  <span className="bg-green-50 text-green-700 px-2 py-1 rounded font-mono">
                                    {formatValue(change.newValue)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-medium text-gray-600">
                          {getRelativeTime(entry.createdAt)}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {formatDate(entry.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
