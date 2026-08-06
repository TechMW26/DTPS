'use client';

/**
 * Data Management Dashboard - Admin Panel
 * 
 * Comprehensive data management with Import, Export, and Update sections
 * URL: /admin/data
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { formatDateIST, formatDateTimeIST } from '@/lib/utils/formatDateIST';
import {
  Upload,
  Download,
  Edit3,
  Database,
  FileSpreadsheet,
  Search,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Loader2,
  Table,
  FileJson,
  User,
  Calendar,
  CreditCard,
  ClipboardList,
  X,
  Check,
  AlertCircle,
  Eye,
  Save,
  ArrowLeft,
  FileText,
  Package,
  Users,
  Utensils,
  Activity,
  Heart,
  Tag,
  Bell,
  TrendingUp,
  FileUp,
  CheckCircle,
  XCircle,
  ShoppingCart,
  MessageSquare,
  Star,
  Target,
  BookOpen,
  FolderOpen,
  Clock,
  Stethoscope,
  Dumbbell,
  Globe,
  Link,
  Receipt,
  Repeat,
  AlertTriangle,
  Phone,
  ShoppingBag
} from 'lucide-react';

// Types
interface ModelInfo {
  name: string;
  displayName: string;
  description: string;
  fieldCount: number;
  requiredFields: string[];
  documentCount: number;
  fields: Array<{
    path: string;
    type: string;
    required: boolean;
  }>;
}

interface RecordData {
  _id: string;
  [key: string]: any;
}

interface RelatedData {
  lifestyleInfo?: any;
  medicalInfo?: any;
  dietaryRecall?: any;
  recentMealPlans?: any[];
  recentTasks?: any[];
  recentPayments?: any[];
  recentAppointments?: any[];
}

interface FieldInfo {
  path: string;
  type: string;
  required: boolean;
  enum?: string[];
}

type ActiveSection = 'import' | 'export' | 'updates';
type SortOrder = 'asc' | 'desc';

// Debounce hook for search optimization
const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [value, delay]);

  return debouncedValue;
};

// Lazy loading hook with Intersection Observer
const useLazyLoad = (threshold: number = 0.1) => {
  const [visibleIndices, setVisibleIndices] = useState<Set<number>>(new Set());
  const elementRefs = useRef<Map<number, IntersectionObserver | null>>(new Map());

  const observeElement = useCallback((index: number, element: HTMLElement | null) => {
    if (!element) {
      const observer = elementRefs.current.get(index);
      if (observer) {
        observer.disconnect();
        elementRefs.current.delete(index);
      }
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleIndices(prev => new Set(prev).add(index));
        }
      },
      { threshold }
    );

    observer.observe(element);
    elementRefs.current.set(index, observer);
  }, [threshold]);

  return { visibleIndices, observeElement };
};

// Status badge component
const StatusBadge = ({ status }: { status: string }) => {
  const statusConfig: Record<string, { bg: string; text: string }> = {
    completed: { bg: 'bg-green-100', text: 'text-green-700' },
    pending: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
    scheduled: { bg: 'bg-orange-100', text: 'text-orange-700' },
  };

  const config = statusConfig[status] || { bg: 'bg-gray-100', text: 'text-gray-700' };
  return (
    <span className={`px-2 py-1 rounded-full text-xs ${config.bg} ${config.text}`}>
      {status || '-'}
    </span>
  );
};

// Model icon mapping
const MODEL_ICONS: Record<string, React.ElementType> = {
  User: Users,
  Lead: TrendingUp,
  Appointment: Calendar,
  Recipe: Utensils,
  MealPlan: ClipboardList,
  Payment: CreditCard,
  ProgressEntry: Activity,
  FoodLog: FileText,
  Task: ClipboardList,
  Tag: Tag,
  ServicePlan: Package,
  Notification: Bell,
  DietTemplate: FileSpreadsheet,
  Transformation: TrendingUp,
  ClientPurchase: ShoppingCart,
  ActivityAssignment: Dumbbell,
  ActivityLog: Activity,
  Blog: BookOpen,
  ClientDocuments: FolderOpen,
  ClientMealPlan: Utensils,
  ClientSubscription: Repeat,
  DailyTracking: Clock,
  DietaryRecall: ClipboardList,
  EcommerceBlog: BookOpen,
  EcommerceOrder: ShoppingBag,
  EcommercePayment: CreditCard,
  EcommercePlan: Package,
  EcommerceRating: Star,
  EcommerceTransformation: TrendingUp,
  File: FileText,
  GoalCategory: Target,
  History: Clock,
  JournalTracking: BookOpen,
  LifestyleInfo: Heart,
  MealPlanTemplate: FileSpreadsheet,
  MedicalInfo: Stethoscope,
  Message: MessageSquare,
  OtherPlatformPayment: Globe,
  PaymentLink: Link,
  SubscriptionPlan: Receipt,
  SystemAlert: AlertTriangle,
  WatiContact: Phone,
  WooCommerceClient: ShoppingBag,
  default: Database
};

const normalizeUploadFieldKey = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
};

export default function DataManagementPage() {
  const router = useRouter();

  // State - default to 'export' since import redirects to another page
  const [activeSection, setActiveSection] = useState<ActiveSection>('export');
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);

  // Export state
  const [selectedExportModel, setSelectedExportModel] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const [exportingModel, setExportingModel] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Update state
  const [selectedUpdateModel, setSelectedUpdateModel] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<RecordData[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<RecordData | null>(null);
  const [relatedData, setRelatedData] = useState<RelatedData | null>(null);
  const [recordFields, setRecordFields] = useState<FieldInfo[]>([]);
  const [editingRecord, setEditingRecord] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [sortBy, setSortBy] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });

  // Bulk Update state
  const [bulkUpdateFile, setBulkUpdateFile] = useState<File | null>(null);
  const [bulkUpdateLoading, setBulkUpdateLoading] = useState(false);
  const [bulkUpdateResult, setBulkUpdateResult] = useState<{
    success: boolean;
    updated: number;
    failed: number;
    errors: Array<{ id: string; error: string }>;
  } | null>(null);
  const [showBulkUpdateModal, setShowBulkUpdateModal] = useState(false);
  const [bulkUpdatePreview, setBulkUpdatePreview] = useState<Array<{ _id: string;[key: string]: any }>>([]);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  // Error Modal state
  const [errorModal, setErrorModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    details?: string[];
  }>({ show: false, title: '', message: '' });

  // Lazy loading state
  const { visibleIndices: visibleTableRows, observeElement: observeTableRow } = useLazyLoad(0.3);
  const [visibleExportModels, setVisibleExportModels] = useState<Set<string>>(new Set());

  // Export filter state
  const [exportSearchQuery, setExportSearchQuery] = useState('');
  const [exportingAll, setExportingAll] = useState(false);

  // API abort controllers
  const searchAbortRef = useRef<AbortController | null>(null);
  const detailsAbortRef = useRef<AbortController | null>(null);

  // Debounced search query
  const debouncedSearchQuery = useDebounce(searchQuery, 500);

  // Fetch models on mount
  useEffect(() => {
    fetchModels();

    // Cleanup abort controllers on unmount
    return () => {
      if (searchAbortRef.current) searchAbortRef.current.abort();
      if (detailsAbortRef.current) detailsAbortRef.current.abort();
    };
  }, []);

  // Auto-search when debounced query changes
  useEffect(() => {
    if (selectedUpdateModel && debouncedSearchQuery !== undefined) {
      searchRecords(selectedUpdateModel, debouncedSearchQuery, 1, sortBy, sortOrder);
    }
  }, [debouncedSearchQuery, selectedUpdateModel]);

  // Memoized selected model
  const currentModel = useMemo(() =>
    models.find(m => m.name === selectedUpdateModel),
    [models, selectedUpdateModel]
  );

  // Memoized filtered fields
  const visibleRecordFields = useMemo(() =>
    recordFields.filter((f) => !f.path.toLowerCase().includes('password')),
    [recordFields]
  );

  const isUnifiedPaymentModel = selectedUpdateModel === 'UnifiedPayment';
  const unifiedPaymentTableColumns = ['_id', 'clientName', 'clientDisplayId', 'planName', 'daysUsed', 'remainingDays'];

  const bulkUpdateFieldMap = useMemo(() => {
    const fieldMap = new Map<string, string>();

    for (const field of recordFields) {
      fieldMap.set(field.path.toLowerCase(), field.path);
      fieldMap.set(normalizeUploadFieldKey(field.path), field.path);
    }

    if (isUnifiedPaymentModel) {
      // Explicit aliases for spreadsheet-style UnifiedPayment headers.
      fieldMap.set('daysused', 'daysUsed');
      fieldMap.set('remainingdays', 'remainingDays');
      fieldMap.set('extendeddaysused', 'extendedDaysUsed');
    }

    return fieldMap;
  }, [recordFields, isUnifiedPaymentModel]);

  // Filtered models for export based on search
  const filteredExportModels = useMemo(() => {
    if (!exportSearchQuery.trim()) return models;
    const query = exportSearchQuery.toLowerCase();
    return models.filter(m =>
      m.name.toLowerCase().includes(query) ||
      m.displayName.toLowerCase().includes(query) ||
      m.description.toLowerCase().includes(query)
    );
  }, [models, exportSearchQuery]);

  // Total records count across all models
  const totalRecordsCount = useMemo(() =>
    models.reduce((sum, m) => sum + m.documentCount, 0),
    [models]
  );

  const fetchModels = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/data/export');
      const data = await res.json();
      if (data.success) {
        setModels(data.models);
      } else {
        toast.error('Failed to load models');
      }
    } catch (error) {
      toast.error('Error loading models');
    } finally {
      setLoading(false);
    }
  };

  // Export handler
  const handleExport = async (modelName: string) => {
    setExportingModel(modelName);
    try {
      const url = `/api/admin/data/export?model=${modelName}&format=${exportFormat}&download=true`;
      const res = await fetch(url);

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Export failed');
      }

      // Get filename from header or generate one
      const disposition = res.headers.get('content-disposition');
      let filename = `${modelName}_export.${exportFormat}`;
      if (disposition) {
        const match = disposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }

      // Download file
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      toast.success(`${modelName} data exported successfully!`);
    } catch (error: any) {
      toast.error(error.message || 'Export failed');
    } finally {
      setExportingModel(null);
    }
  };

  // Export All Models - Download all models data as a single JSON file
  const handleExportAll = async () => {
    setExportingAll(true);
    const modelsWithData = models.filter(m => m.documentCount > 0);

    if (modelsWithData.length === 0) {
      toast.error('No data to export');
      setExportingAll(false);
      return;
    }

    try {
      const allData: Record<string, any[]> = {};
      let successCount = 0;
      let failCount = 0;

      // Fetch data for each model
      for (const model of modelsWithData) {
        try {
          const res = await fetch(`/api/admin/data/export?model=${model.name}&format=json&download=true`);
          if (res.ok) {
            const data = await res.json();
            allData[model.name] = data;
            successCount++;
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }
      }

      // Create combined export file
      const exportData = {
        exportDate: new Date().toISOString(),
        modelCount: Object.keys(allData).length,
        totalRecords: Object.values(allData).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0),
        data: allData
      };

      const jsonContent = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `DTPS_full_export_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      toast.success(`Exported ${successCount} models successfully!${failCount > 0 ? ` (${failCount} failed)` : ''}`);
    } catch (error: any) {
      toast.error('Export All failed');
    } finally {
      setExportingAll(false);
    }
  };

  // Sync payment status from Payment to ClientPurchase
  const handleSyncPaymentStatus = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/payments/sync-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await res.json();

      if (data.success) {
        toast.success(`Synced ${data.result.updated} payment statuses to ClientPurchase records`);
        if (data.result.failed > 0) {
          toast.warning(`${data.result.failed} payments failed to sync`);
        }
        // Refresh models count if Payment model is visible
        if (selectedExportModel === 'Payment') {
          fetchModels();
        }
      } else {
        toast.error(data.error || 'Sync failed');
      }
    } catch (error: any) {
      toast.error('Error syncing payment status');
    } finally {
      setSyncing(false);
    }
  };

  // Search records with lazy loading
  const searchRecords = useCallback(async (
    modelName: string,
    query: string = '',
    page: number = 1,
    sortField?: string,
    sortDirection: SortOrder = 'desc'
  ) => {
    setLoading(true);

    // Cancel previous request
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }

    // Create new abort controller
    searchAbortRef.current = new AbortController();

    try {
      const params = new URLSearchParams({
        model: modelName,
        search: query,
        page: String(page),
        limit: '20'
      });

      if (sortField) {
        params.set('sortBy', sortField);
        params.set('sortOrder', sortDirection);
      }

      const res = await fetch(`/api/admin/data/records?${params.toString()}`, {
        signal: searchAbortRef.current.signal
      });
      const data = await res.json();

      if (data.success) {
        setSearchResults(data.records);
        setPagination(data.pagination);
        setRecordFields(data.fields);
        // Lazy loading will auto-detect visible rows on render
      } else {
        const errorMessage = data.message || data.error || 'Search failed';
        console.error('API search error:', data);
        toast.error(`Search failed: ${errorMessage}`);
        setSearchResults([]);
        setPagination({ page: 1, limit: 20, total: 0, totalPages: 0 });
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Search request error:', error);
        toast.error(`Error searching records: ${error.message || 'Unknown error'}`);
        setSearchResults([]);
        setPagination({ page: 1, limit: 20, total: 0, totalPages: 0 });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleUnifiedPaymentSort = (fieldPath: 'daysUsed' | 'remainingDays') => {
    if (!selectedUpdateModel) return;

    const defaultOrder: SortOrder = fieldPath === 'remainingDays' ? 'asc' : 'desc';
    const nextOrder: SortOrder = sortBy === fieldPath
      ? (sortOrder === 'asc' ? 'desc' : 'asc')
      : defaultOrder;

    setSortBy(fieldPath);
    setSortOrder(nextOrder);
    searchRecords(selectedUpdateModel, searchQuery, 1, fieldPath, nextOrder);
  };

  // Fetch single record with related data and lazy abort control
  const fetchRecordDetails = async (modelName: string, recordId: string) => {
    setLoading(true);

    // Cancel previous request
    if (detailsAbortRef.current) {
      detailsAbortRef.current.abort();
    }

    // Create new abort controller
    detailsAbortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/admin/data/records?model=${modelName}&id=${recordId}`, {
        signal: detailsAbortRef.current.signal
      });
      const data = await res.json();

      if (data.success) {
        setSelectedRecord(data.record);
        setRelatedData(data.relatedData || null);
        setRecordFields(data.fields);
        setEditingRecord(null);
      } else {
        toast.error('Failed to load record');
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        toast.error('Error loading record');
      }
    } finally {
      setLoading(false);
    }
  };

  // Save record changes
  const saveRecordChanges = async () => {
    if (!selectedUpdateModel || !selectedRecord || !editingRecord) return;

    setSaving(true);
    try {
      const res = await fetch('/api/admin/data/records', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelName: selectedUpdateModel,
          recordId: selectedRecord._id,
          data: editingRecord
        })
      });

      const data = await res.json();

      if (data.success) {
        toast.success('Record updated successfully!');
        setSelectedRecord(data.record);
        setEditingRecord(null);
        // Refresh the search results
        searchRecords(selectedUpdateModel, searchQuery, pagination.page, sortBy, sortOrder);
      } else {
        toast.error(data.error || 'Update failed');
      }
    } catch (error) {
      toast.error('Error updating record');
    } finally {
      setSaving(false);
    }
  };

  // Get model icon
  const getModelIcon = (modelName: string) => {
    const Icon = MODEL_ICONS[modelName] || MODEL_ICONS.default;
    return <Icon className="w-5 h-5" />;
  };

  // Parse CSV content manually
  const parseCSV = (csvText: string): Array<Record<string, any>> => {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    // Parse header row - handle both comma and tab delimiters
    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));

    // Parse data rows
    const data: Array<Record<string, any>> = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i], delimiter);
      if (values.length === headers.length) {
        const row: Record<string, any> = {};
        headers.forEach((header, idx) => {
          let value = values[idx]?.trim().replace(/^["']|["']$/g, '') || '';
          // Try to parse numbers and booleans
          if (value === 'true') value = true as any;
          else if (value === 'false') value = false as any;
          else if (value && !isNaN(Number(value)) && value !== '') {
            // Keep as string if it looks like an ID or phone number
            if (header.toLowerCase().includes('id') || header.toLowerCase().includes('phone') || value.length > 15) {
              // Keep as string
            } else {
              value = Number(value) as any;
            }
          }
          row[header] = value;
        });
        data.push(row);
      }
    }
    return data;
  };

  // Parse a single CSV line handling quoted fields
  const parseCSVLine = (line: string, delimiter: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  };

  // Parse file for bulk update (xlsx, xls, csv, json)
  const parseUploadedFile = async (file: File): Promise<Array<{ _id: string;[key: string]: any }>> => {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();

    // JSON files
    if (fileExtension === 'json') {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        return Array.isArray(data) ? data : [data];
      } catch (e: any) {
        throw new Error(`Invalid JSON format: ${e.message}`);
      }
    }

    // CSV files - parse manually
    if (fileExtension === 'csv') {
      try {
        const text = await file.text();
        const data = parseCSV(text);
        if (data.length === 0) {
          throw new Error('No data found in CSV file');
        }
        return data as Array<{ _id: string;[key: string]: any }>;
      } catch (e: any) {
        throw new Error(`Failed to parse CSV: ${e.message}`);
      }
    }

    // For Excel files (xlsx, xls), use exceljs library
    if (fileExtension === 'xlsx' || fileExtension === 'xls') {
      try {
        // Dynamic import of exceljs library
        const ExcelJS = await import('exceljs');

        const buffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
          throw new Error('No sheets found in Excel file');
        }

        // Get headers from first row
        const headerRow = worksheet.getRow(1);
        const headers: string[] = [];
        headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          headers[colNumber - 1] = cell.text || `column_${colNumber - 1}`;
        });

        // Parse data rows
        const jsonData: Array<{ _id: string;[key: string]: any }> = [];
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber === 1) return; // Skip header row

          const rowData: Record<string, any> = {};
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const header = headers[colNumber - 1];
            if (header) {
              let value: unknown = cell.value;
              if (value && typeof value === 'object') {
                if ('text' in value) value = value.text;
                else if ('result' in value) value = value.result;
                else if (!(value instanceof Date)) value = cell.text;
              }
              rowData[header] = value ?? '';
            }
          });
          jsonData.push(rowData as { _id: string;[key: string]: any });
        });

        if (!jsonData || jsonData.length === 0) {
          throw new Error('No data found in Excel sheet');
        }

        return jsonData;
      } catch (e: any) {
        // If exceljs library fails, provide helpful error
        if (e.message.includes('Cannot read properties')) {
          throw new Error('Excel parsing failed. Please try exporting as CSV and uploading again.');
        }
        throw new Error(`Failed to parse Excel file: ${e.message}`);
      }
    }

    throw new Error(`Unsupported file format: ${fileExtension}`);
  };

  // Handle bulk file selection
  const handleBulkFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;


    const validExtensions = ['xlsx', 'xls', 'csv', 'json'];
    const fileExtension = file.name.split('.').pop()?.toLowerCase();


    if (!fileExtension || !validExtensions.includes(fileExtension)) {
      setErrorModal({
        show: true,
        title: '❌ Invalid File Format',
        message: 'Please upload a valid file format.',
        details: [
          '✅ Supported formats:',
          '• .xlsx (Excel)',
          '• .xls (Excel)',
          '• .csv (Comma Separated)',
          '• .json (JSON)'
        ]
      });
      return;
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setErrorModal({
        show: true,
        title: '❌ File Too Large',
        message: `Your file is ${(file.size / (1024 * 1024)).toFixed(2)} MB. Maximum allowed size is 10 MB.`,
        details: [
          '💡 Tips:',
          '• Split large files into smaller chunks',
          '• Remove unnecessary columns',
          '• Use CSV format for smaller file sizes'
        ]
      });
      return;
    }

    setBulkUpdateFile(file);
    setBulkUpdateResult(null);
    setBulkUpdateLoading(true);

    try {
      const data = await parseUploadedFile(file);

      if (!data || data.length === 0) {
        setErrorModal({
          show: true,
          title: '❌ No Data Found',
          message: 'The file appears to be empty or could not be parsed.',
          details: [
            '💡 Please check:',
            '• The file contains data rows',
            '• The first row contains column headers',
            '• The file is not corrupted'
          ]
        });
        setBulkUpdateFile(null);
        setBulkUpdateLoading(false);
        return;
      }

      const resolveBulkFieldKey = (rawKey: string): string => {
        const trimmedKey = rawKey.trim();
        if (!trimmedKey) return '';

        const directMatch = bulkUpdateFieldMap.get(trimmedKey.toLowerCase());
        if (directMatch) return directMatch;

        const normalizedMatch = bulkUpdateFieldMap.get(normalizeUploadFieldKey(trimmedKey));
        return normalizedMatch || trimmedKey;
      };

      const normalizeCandidateId = (candidate: unknown): string => {
        if (candidate === undefined || candidate === null) return '';

        if (typeof candidate === 'object' && candidate !== null && '$oid' in candidate) {
          const oidValue = (candidate as { $oid?: unknown }).$oid;
          if (oidValue !== undefined && oidValue !== null) {
            const normalizedOid = String(oidValue).trim();
            if (normalizedOid && normalizedOid !== '[object Object]') {
              return normalizedOid;
            }
          }
        }

        const normalized = String(candidate).trim();
        if (normalized && normalized !== '[object Object]') {
          return normalized;
        }

        return '';
      };

      const extractRowId = (row: Record<string, any>): string => {
        const candidates = [row?._id, row?.id, row?.ID];
        for (const candidate of candidates) {
          const normalized = normalizeCandidateId(candidate);
          if (normalized) {
            return normalized;
          }
        }

        // Fallback for variant id headers like " Id ", "_id " or "Object ID".
        for (const [rawKey, value] of Object.entries(row)) {
          const normalizedKey = normalizeUploadFieldKey(rawKey);
          if (!['id', 'objectid', 'mongoid', 'recordid'].includes(normalizedKey)) {
            continue;
          }

          const normalized = normalizeCandidateId(value);
          if (normalized) {
            return normalized;
          }
        }

        return '';
      };

      // Validate that each row has _id field (supports id/ID aliases)
      const validData = data.filter(row => {
        return extractRowId(row) !== '';
      });

      if (validData.length === 0) {
        const availableFields = data[0] ? Object.keys(data[0]) : [];
        setErrorModal({
          show: true,
          title: '❌ Missing Required Field: _id',
          message: 'No records with _id field found. Each row must have an _id field to identify which record to update.',
          details: availableFields.length > 0 ? [
            `📋 Available fields in your file (${availableFields.length}):`,
            ...availableFields.map(f => `• ${f}`),
            '',
            '💡 Tip: Your file needs an "_id" column (or id/ID, which will be normalized to _id).'
          ] : ['No fields found in the file']
        });
        setBulkUpdateFile(null);
        setBulkUpdateLoading(false);
        return;
      }

      // Normalize identifier to _id field
      const normalizedData = validData.map(row => {
        const idValue = extractRowId(row);

        // Create new object with _id
        const cleanRow: Record<string, any> = {};
        for (const [key, value] of Object.entries(row)) {
          const normalizedIncomingKey = normalizeUploadFieldKey(key);

          // Skip identifier aliases after extracting canonical _id.
          if (normalizedIncomingKey === 'id' || normalizedIncomingKey === 'uuid') continue;

          const resolvedKey = resolveBulkFieldKey(key);
          if (!resolvedKey) continue;

          cleanRow[resolvedKey] = value;
        }

        return {
          ...cleanRow,
          _id: idValue
        } as { _id: string;[key: string]: any };
      });

      setBulkUpdatePreview(normalizedData as Array<{ _id: string;[key: string]: any }>);
      setShowBulkUpdateModal(true);
      toast.success(`✅ Loaded ${normalizedData.length} records for preview`);
    } catch (error: any) {
      console.error('File parse error:', error);
      setErrorModal({
        show: true,
        title: '❌ Failed to Parse File',
        message: error.message || 'An error occurred while parsing the file.',
        details: [
          '💡 Suggestions:',
          '• Try exporting your data as CSV format',
          '• Ensure the file is not password protected',
          '• Check if the file is corrupted',
          '• Remove any special characters from headers'
        ]
      });
      setBulkUpdateFile(null);
    } finally {
      setBulkUpdateLoading(false);
    }

    // Reset the input
    if (bulkFileInputRef.current) {
      bulkFileInputRef.current.value = '';
    }
  };

  // Process bulk update
  const processBulkUpdate = async () => {
    if (!selectedUpdateModel || bulkUpdatePreview.length === 0) {
      toast.error('No data to update');
      return;
    }

    setBulkUpdateLoading(true);
    setBulkUpdateResult(null);

    try {
      const res = await fetch('/api/admin/data/bulk-update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelName: selectedUpdateModel,
          records: bulkUpdatePreview
        })
      });

      const data = await res.json();

      if (data.success) {
        const updatedCount = Number(data.updated ?? data.summary?.updated ?? 0);
        const failedCount = Number(data.failed ?? data.summary?.failed ?? 0);
        const hasFailures = failedCount > 0;
        setBulkUpdateResult({
          success: !hasFailures,
          updated: updatedCount,
          failed: failedCount,
          errors: data.errors || []
        });

        if (hasFailures) {
          toast.error(`Updated ${updatedCount} records, ${failedCount} failed. Check errors in the result panel.`);
        } else {
          toast.success(`Successfully updated ${updatedCount} records!`);
        }

        // Refresh the search results
        if (searchResults.length > 0) {
          searchRecords(selectedUpdateModel, searchQuery, pagination.page, sortBy, sortOrder);
        }
      } else {
        const updatedCount = Number(data.updated ?? data.summary?.updated ?? 0);
        const failedCount = Number(data.failed ?? data.summary?.failed ?? bulkUpdatePreview.length);
        setBulkUpdateResult({
          success: false,
          updated: updatedCount,
          failed: failedCount,
          errors: data.errors || [{ id: 'unknown', error: data.error || 'Bulk update failed' }]
        });
        toast.error(data.error || 'Bulk update failed');
      }
    } catch (error: any) {
      setBulkUpdateResult({
        success: false,
        updated: 0,
        failed: bulkUpdatePreview.length,
        errors: [{ id: 'unknown', error: error.message || 'Network error' }]
      });
      toast.error('Error processing bulk update');
    } finally {
      setBulkUpdateLoading(false);
    }
  };

  // Close bulk update modal
  const closeBulkUpdateModal = () => {
    setShowBulkUpdateModal(false);
    setBulkUpdateFile(null);
    setBulkUpdatePreview([]);
    setBulkUpdateResult(null);
  };

  // Format field value for display
  const formatFieldValue = (value: any, type: string): string => {
    if (value === null || value === undefined) return '-';
    if (type === 'Date') {
      try {
        return formatDateTimeIST(value);
      } catch {
        return String(value);
      }
    }
    if (Array.isArray(value)) {
      return value.length > 0 ? value.join(', ') : '-';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    return String(value);
  };

  // Fast section switching handler
  const handleSectionChange = useCallback((section: ActiveSection) => {
    if (section === 'import') {
      router.push('/admin/import');
      return;
    }
    setActiveSection(section);
    // Reset update section state when switching away
    if (section !== 'updates') {
      setSelectedUpdateModel(null);
      setSelectedRecord(null);
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [router]);

  // Render sidebar
  const renderSidebar = () => (
    <div className="w-64 bg-linear-to-b from-teal-50 to-white dark:from-gray-800 dark:to-gray-900 border-r-2 border-teal-200 dark:border-teal-900 h-screen shadow-lg">
      <div className="p-5 border-b-2 border-teal-200 dark:border-teal-900 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 bg-linear-to-r from-[#3AB1A0] to-[#2A9A8B] rounded-lg">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              DTPS
            </h2>
            <p className="text-xs text-[#3AB1A0] dark:text-[#3AB1A0] font-medium">
              Admin Panel
            </p>
          </div>
        </div>
      </div>

      <nav className="p-4 space-y-2">
        {/* Import Section - Always navigates to /admin/import */}
        <button
          onClick={() => handleSectionChange('import')}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-150 font-medium text-gray-700 dark:text-gray-300 hover:bg-teal-100 dark:hover:bg-teal-900/20"
        >
          <Upload className="w-5 h-5 shrink-0" />
          <div className="text-left flex-1">
            <p className="font-semibold">Import Data</p>
            <p className="text-xs opacity-70">Upload files</p>
          </div>
          <ChevronRight className="w-4 h-4 shrink-0 text-gray-400" />
        </button>

        {/* Export Section */}
        <button
          onClick={() => handleSectionChange('export')}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-150 font-medium ${activeSection === 'export'
            ? 'bg-linear-to-r from-[#3AB1A0] to-[#2A9A8B] text-white shadow-lg shadow-teal-500/30'
            : 'text-gray-700 dark:text-gray-300 hover:bg-teal-100 dark:hover:bg-teal-900/20'
            }`}
        >
          <Download className="w-5 h-5 shrink-0" />
          <div className="text-left flex-1">
            <p className="font-semibold">Export Data</p>
            <p className={`text-xs opacity-70 ${activeSection === 'export' ? 'text-teal-100' : ''}`}>
              Download files
            </p>
          </div>
          {activeSection === 'export' && <ChevronRight className="w-4 h-4 shrink-0" />}
        </button>

        {/* Updates Section */}
        <button
          onClick={() => handleSectionChange('updates')}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-150 font-medium ${activeSection === 'updates'
            ? 'bg-linear-to-r from-[#3AB1A0] to-[#2A9A8B] text-white shadow-lg shadow-teal-500/30'
            : 'text-gray-700 dark:text-gray-300 hover:bg-teal-100 dark:hover:bg-teal-900/20'
            }`}
        >
          <Edit3 className="w-5 h-5 shrink-0" />
          <div className="text-left flex-1">
            <p className="font-semibold">Update Data</p>
            <p className={`text-xs opacity-70 ${activeSection === 'updates' ? 'text-teal-100' : ''}`}>
              Search & edit
            </p>
          </div>
          {activeSection === 'updates' && <ChevronRight className="w-4 h-4 shrink-0" />}
        </button>
      </nav>

      {/* Quick Stats */}
      <div className="p-4 m-4 bg-white dark:bg-gray-800 border-2 border-teal-200 dark:border-teal-900 rounded-lg">
        <p className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase tracking-widest mb-4">
          📊 Database Stats
        </p>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Models</span>
            <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-3 py-1 rounded-lg font-bold text-sm">
              {models.length}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Records</span>
            <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-3 py-1 rounded-lg font-bold text-sm">
              {models.reduce((acc, m) => acc + m.documentCount, 0).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-linear-to-t from-white dark:from-gray-800 to-transparent border-t border-teal-200 dark:border-teal-900">
        <p className="text-xs text-center text-gray-500 dark:text-gray-400">
          DTPS Admin
        </p>
      </div>
    </div>
  );

  // Render Import Section
  // Render Export Section
  const renderExportSection = () => (
    <div className="p-8">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-linear-to-r from-[#3AB1A0] to-[#2A9A8B] rounded-lg">
              <Download className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Export Data
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Download your data in CSV or JSON format
              </p>
            </div>
          </div>
          {/* Stats Summary */}
          <div className="hidden md:flex items-center gap-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-2">
            <div className="text-center">
              <p className="text-2xl font-bold text-[#3AB1A0]">{models.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Models</p>
            </div>
            <div className="w-px h-10 bg-gray-200 dark:bg-gray-700"></div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-500">{totalRecordsCount.toLocaleString()}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total Records</p>
            </div>
          </div>
        </div>
      </div>

      {/* Export Controls */}
      <div className="mb-8 bg-white dark:bg-gray-800 rounded-lg border-2 border-teal-200 dark:border-teal-900 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Format Selector */}
          <div>
            <span className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide block mb-3">
              Export Format
            </span>
            <div className="flex gap-3">
              <button
                onClick={() => setExportFormat('csv')}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg border-2 font-medium transition-all ${exportFormat === 'csv'
                  ? 'bg-linear-to-r from-[#3AB1A0] to-[#2A9A8B] border-teal-600 text-white shadow-lg shadow-teal-500/30'
                  : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-teal-400'
                  }`}
              >
                <Table className="w-5 h-5" />
                CSV Format
              </button>
              <button
                onClick={() => setExportFormat('json')}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg border-2 font-medium transition-all ${exportFormat === 'json'
                  ? 'bg-linear-to-r from-[#3AB1A0] to-[#2A9A8B] border-teal-600 text-white shadow-lg shadow-teal-500/30'
                  : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-teal-400'
                  }`}
              >
                <FileJson className="w-5 h-5" />
                JSON Format
              </button>
            </div>
          </div>

          {/* Export All Button */}
          <div>
            <span className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide block mb-3">
              Bulk Export
            </span>
            <button
              onClick={handleExportAll}
              disabled={exportingAll || !!exportingModel || models.length === 0}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${exportingAll || !!exportingModel
                ? 'bg-orange-400 text-white cursor-wait'
                : 'bg-linear-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-lg shadow-orange-500/30'
                }`}
            >
              {exportingAll ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Exporting All...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Export All Models (JSON)
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Search/Filter Models */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search models by name or description..."
            value={exportSearchQuery}
            onChange={(e) => setExportSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all"
          />
          {exportSearchQuery && (
            <button
              onClick={() => setExportSearchQuery('')}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        {exportSearchQuery && (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Showing {filteredExportModels.length} of {models.length} models
          </p>
        )}
      </div>
      {/* Models Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-[#3AB1A0] mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400 font-medium">Loading models...</p>
          </div>
        </div>
      ) : filteredExportModels.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Database className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-lg font-medium text-gray-600 dark:text-gray-400">No models found</p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
            {exportSearchQuery ? 'Try a different search term' : 'No data models available'}
          </p>
          {exportSearchQuery && (
            <button
              onClick={() => setExportSearchQuery('')}
              className="mt-4 text-teal-600 hover:text-teal-700 font-medium text-sm"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredExportModels.map((model, index) => {
            const isVisible = visibleExportModels.has(model.name);
            const isModelExporting = exportingModel === model.name;
            const disableModelExport = isModelExporting || !!exportingModel || exportingAll || syncing || model.documentCount === 0;
            return (
              <div
                key={model.name}
                ref={(el) => {
                  if (el) {
                    const observer = new IntersectionObserver(([entry]) => {
                      if (entry.isIntersecting) {
                        setVisibleExportModels(prev => new Set(prev).add(model.name));
                      }
                    }, { threshold: 0.1 });
                    observer.observe(el);
                  }
                }}
                className={`bg-white dark:bg-gray-800 border-2 rounded-xl p-6 transition-all ${selectedExportModel === model.name
                  ? 'border-teal-500 shadow-xl shadow-teal-500/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-teal-400 dark:hover:border-teal-600'
                  }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-lg ${selectedExportModel === model.name
                      ? 'bg-linear-to-r from-[#3AB1A0] to-[#2A9A8B] text-white'
                      : 'bg-teal-100 dark:bg-teal-900/30'
                      }`}>
                      {isVisible ? getModelIcon(model.name) : <Database className="w-5 h-5 text-gray-400 animate-pulse" />}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white text-lg">{model.displayName}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{model.name}</p>
                    </div>
                  </div>
                </div>

                {isVisible ? (
                  <>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                      {model.description}
                    </p>

                    <div className="grid grid-cols-2 gap-4 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1">Fields</p>
                        <p className="text-xl font-bold text-orange-600">{model.fieldCount}</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1">Records</p>
                        <p className="text-xl font-bold text-orange-600">{model.documentCount.toLocaleString()}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleExport(model.name)}
                      disabled={disableModelExport}
                      className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${isModelExporting || !!exportingModel || exportingAll || syncing
                        ? 'bg-teal-400 text-white cursor-wait'
                        : model.documentCount === 0
                          ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 hover:bg-teal-200 dark:hover:bg-teal-900/50'
                          : 'bg-[#3AB1A0] hover:bg-[#2A9A8B] text-white'
                        }`}
                    >
                      {isModelExporting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Exporting...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          Download {exportFormat.toUpperCase()}
                        </>
                      )}
                    </button>

                    {/* Sync button for Payment model */}
                    {model.name === 'Payment' && (
                      <button
                        onClick={handleSyncPaymentStatus}
                        disabled={syncing || !!exportingModel || exportingAll}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors mt-3 ${syncing || !!exportingModel || exportingAll
                          ? 'bg-orange-400 text-white cursor-wait'
                          : 'bg-linear-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white'
                          }`}
                      >
                        {syncing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4" />
                            Sync Payment Status
                          </>
                        )}
                      </button>
                    )}

                    {model.documentCount === 0 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
                        ℹ️ No records to export
                      </p>
                    )}
                  </>
                ) : (
                  <div className="space-y-4 animate-pulse">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                    <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // Render Update Section
  const renderUpdateSection = () => (
    <div className="p-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-3 bg-linear-to-r from-[#3AB1A0] to-[#2A9A8B] rounded-lg">
            <Edit3 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Update Data
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Search, view, and edit records across all models
            </p>
          </div>
        </div>
      </div>

      {/* Model Selector */}
      {!selectedUpdateModel ? (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Select a Model to Update
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {models.map((model) => (
              <button
                key={model.name}
                onClick={() => {
                  const defaultSortBy = model.name === 'UnifiedPayment' ? 'remainingDays' : '';
                  const defaultSortOrder: SortOrder = defaultSortBy ? 'asc' : 'desc';
                  setSelectedUpdateModel(model.name);
                  setSortBy(defaultSortBy);
                  setSortOrder(defaultSortOrder);
                  searchRecords(model.name, '', 1, defaultSortBy, defaultSortOrder);
                }}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 text-left hover:border-teal-300 dark:hover:border-teal-700 hover:shadow-lg transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-lg">
                    {getModelIcon(model.name)}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">{model.displayName}</p>
                    <p className="text-xs text-gray-500">{model.documentCount.toLocaleString()} records</p>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                  {model.description}
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : selectedRecord ? (
        // Record Detail View
        <div>
          {/* Back button */}
          <button
            onClick={() => {
              setSelectedRecord(null);
              setRelatedData(null);
              setEditingRecord(null);
            }}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to search results
          </button>

          {/* Record Header */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-teal-100 dark:bg-teal-900/30 rounded-lg">
                  {getModelIcon(selectedUpdateModel)}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {(selectedRecord as any).firstName
                      ? `${(selectedRecord as any).firstName} ${(selectedRecord as any).lastName || ''}`
                      : (selectedRecord as any).planName || (selectedRecord as any).name || (selectedRecord as any).email || selectedRecord._id}
                  </h2>
                  <p className="text-sm text-gray-500">{selectedUpdateModel} • ID: {selectedRecord._id}</p>
                  {(selectedRecord as any).planName && !(selectedRecord as any).firstName && (
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">Plan: {(selectedRecord as any).planName}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {editingRecord ? (
                  <>
                    <button
                      onClick={() => setEditingRecord(null)}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveRecordChanges}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 bg-[#3AB1A0] hover:bg-[#2A9A8B] text-white rounded-lg font-medium"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save Changes
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setEditingRecord({ ...selectedRecord })}
                    className="flex items-center gap-2 px-4 py-2 bg-[#3AB1A0] hover:bg-[#2A9A8B] text-white rounded-lg font-medium"
                  >
                    <Edit3 className="w-4 h-4" />
                    Edit Record
                  </button>
                )}
              </div>
            </div>

            {/* Record Fields - Filter out password fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleRecordFields.map((field) => (
                <div key={field.path} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                    {field.path}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  {editingRecord ? (
                    field.enum ? (
                      <div className="space-y-2">
                        <select
                          value={editingRecord[field.path] || ''}
                          onChange={(e) => setEditingRecord({ ...editingRecord, [field.path]: e.target.value })}
                          className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-medium focus:border-[#3AB1A0] focus:ring-2 focus:ring-teal-500/20 transition-all cursor-pointer"
                        >
                          <option value="">-- Select {field.path} --</option>
                          {field.enum.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        {editingRecord[field.path] && (
                          <div className="flex items-center gap-2 pt-1">
                            <span className="text-xs text-gray-600 dark:text-gray-400">Selected:</span>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400">
                              {editingRecord[field.path]}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : field.type === 'Boolean' ? (
                      <div className="space-y-2">
                        <select
                          value={editingRecord[field.path]?.toString() || 'false'}
                          onChange={(e) => setEditingRecord({ ...editingRecord, [field.path]: e.target.value === 'true' })}
                          className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-medium focus:border-[#3AB1A0] focus:ring-2 focus:ring-teal-500/20 transition-all cursor-pointer"
                        >
                          <option value="true">✓ Yes</option>
                          <option value="false">✗ No</option>
                        </select>
                        <div className="flex items-center gap-2 pt-1">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${editingRecord[field.path] === true || editingRecord[field.path] === 'true'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                            }`}>
                            {editingRecord[field.path] === true || editingRecord[field.path] === 'true' ? '✓ Yes' : '✗ No'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <input
                        type={field.type === 'Number' ? 'number' : field.type === 'Date' ? 'datetime-local' : 'text'}
                        value={editingRecord[field.path] || ''}
                        onChange={(e) => setEditingRecord({ ...editingRecord, [field.path]: e.target.value })}
                        className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:border-[#3AB1A0] focus:ring-2 focus:ring-teal-500/20 transition-all"
                        placeholder={`Enter ${field.path}...`}
                      />
                    )
                  ) : (
                    <p className="text-sm text-gray-900 dark:text-white wrap-break-word">
                      {formatFieldValue(selectedRecord[field.path], field.type)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Related Data */}
          {relatedData && selectedUpdateModel === 'User' && (
            <div className="space-y-6">
              {/* Lifestyle Info */}
              {relatedData.lifestyleInfo && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-[#3AB1A0]" />
                    Lifestyle Information
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(relatedData.lifestyleInfo)
                      .filter(([key]) => !key.startsWith('_') && key !== 'userId')
                      .slice(0, 8)
                      .map(([key, value]) => (
                        <div key={key} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                          <p className="text-xs text-gray-500 uppercase">{key}</p>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {formatFieldValue(value, 'String')}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Medical Info */}
              {relatedData.medicalInfo && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Heart className="w-5 h-5 text-red-600" />
                    Medical Information
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(relatedData.medicalInfo)
                      .filter(([key]) => !key.startsWith('_') && key !== 'userId')
                      .slice(0, 8)
                      .map(([key, value]) => (
                        <div key={key} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                          <p className="text-xs text-gray-500 uppercase">{key}</p>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {formatFieldValue(value, 'String')}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Recent Payments */}
              {relatedData.recentPayments && relatedData.recentPayments.length > 0 && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-green-600" />
                    Recent Payments ({relatedData.recentPayments.length})
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-4 py-2 text-left">Amount</th>
                          <th className="px-4 py-2 text-left">Status</th>
                          <th className="px-4 py-2 text-left">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {relatedData.recentPayments.map((payment: any, i: number) => (
                          <tr key={i}>
                            <td className="px-4 py-2">₹{payment.amount || '-'}</td>
                            <td className="px-4 py-2">
                              <StatusBadge status={payment.status || ''} />
                            </td>
                            <td className="px-4 py-2">{payment.createdAt ? formatDateIST(payment.createdAt) : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Recent Appointments */}
              {relatedData.recentAppointments && relatedData.recentAppointments.length > 0 && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-purple-600" />
                    Recent Appointments ({relatedData.recentAppointments.length})
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-4 py-2 text-left">Title</th>
                          <th className="px-4 py-2 text-left">Status</th>
                          <th className="px-4 py-2 text-left">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {relatedData.recentAppointments.map((apt: any, i: number) => (
                          <tr key={i}>
                            <td className="px-4 py-2">{apt.title || apt.type || '-'}</td>
                            <td className="px-4 py-2">
                              <StatusBadge status={apt.status || ''} />
                            </td>
                            <td className="px-4 py-2">{apt.date ? formatDateIST(apt.date) : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        // Search Results View
        <div>
          {/* Back button and Search */}
          <div className="mb-6 space-y-4">
            <button
              onClick={() => {
                setSelectedUpdateModel(null);
                setSearchResults([]);
                setSearchQuery('');
              }}
              className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to models
            </button>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={isUnifiedPaymentModel
                    ? 'Search by _id, clientId, client name, email, planName, or any field...'
                    : 'Search by _id, name, clientId, email, phone, or any field...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:border-[#3AB1A0] focus:ring-2 focus:ring-teal-500/20 transition-all"
                />
              </div>
              {debouncedSearchQuery !== searchQuery && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              )}
            </div>
          </div>

          {/* Model info */}
          <div className="bg-linear-to-r from-teal-50 to-teal-100 dark:from-teal-900/30 dark:to-teal-900/20 border-2 border-teal-300 dark:border-teal-800 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-linear-to-r from-[#3AB1A0] to-[#2A9A8B] rounded-lg">
                  {getModelIcon(selectedUpdateModel)}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {currentModel?.displayName || selectedUpdateModel}
                  </h3>
                  <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
                    📊 {pagination.total.toLocaleString()} total records
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Bulk Update Button */}
                <div className="relative">
                  <input
                    ref={bulkFileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,.json"
                    onChange={handleBulkFileSelect}
                    className="hidden"
                    id="bulk-update-file"
                    disabled={bulkUpdateLoading}
                  />
                  <label
                    htmlFor="bulk-update-file"
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium cursor-pointer transition-all shadow-md hover:shadow-lg ${bulkUpdateLoading
                      ? 'bg-gray-400 cursor-wait'
                      : 'bg-linear-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700'
                      } text-white`}
                  >
                    {bulkUpdateLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Parsing File...
                      </>
                    ) : (
                      <>
                        <FileUp className="w-4 h-4" />
                        Bulk Update
                      </>
                    )}
                  </label>
                </div>
                {loading && (
                  <div className="flex items-center gap-2 text-[#3AB1A0]">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm font-medium">Searching...</span>
                  </div>
                )}
              </div>
            </div>
            {/* Bulk Update Info */}
            <div className="mt-4 pt-4 border-t border-teal-300 dark:border-teal-700">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                💡 <strong>Bulk Update:</strong> Upload a file (.xlsx, .xls, .csv, .json) with <code className="bg-teal-200 dark:bg-teal-800 px-1 rounded">_id</code> column to update multiple records at once
              </p>
              {isUnifiedPaymentModel && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                  ↕️ Sort by clicking <strong>Days Used</strong> or <strong>Remaining Days</strong> column headers.
                </p>
              )}
            </div>
          </div>

          {/* Results Table */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <Loader2 className="w-12 h-12 animate-spin text-[#3AB1A0] mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400 font-medium">Loading records...</p>
              </div>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700">
              <Search className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No records found</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">Try a different search term or browse all records</p>
              <button
                onClick={() => searchRecords(selectedUpdateModel, '', 1, sortBy, sortOrder)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#3AB1A0] hover:bg-[#2A9A8B] text-white rounded-lg font-medium transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                View All Records
              </button>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 w-12">S/No</th>
                      {(isUnifiedPaymentModel ? unifiedPaymentTableColumns : visibleRecordFields.slice(0, 5).map((f) => f.path)).map((fieldPath) => {
                        const displayLabel = fieldPath === 'clientDisplayId'
                          ? 'cId'
                          : fieldPath === 'daysUsed'
                            ? 'Days Used'
                            : fieldPath === 'remainingDays'
                              ? 'Remaining Days'
                              : fieldPath;

                        const isSortableUnifiedField = isUnifiedPaymentModel && (fieldPath === 'daysUsed' || fieldPath === 'remainingDays');

                        if (!isSortableUnifiedField) {
                          return (
                            <th key={fieldPath} className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">
                              {displayLabel}
                            </th>
                          );
                        }

                        const isActiveSort = sortBy === fieldPath;
                        return (
                          <th key={fieldPath} className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">
                            <button
                              type="button"
                              onClick={() => handleUnifiedPaymentSort(fieldPath as 'daysUsed' | 'remainingDays')}
                              className="inline-flex items-center gap-1 hover:text-[#3AB1A0] transition-colors"
                            >
                              <span>{displayLabel}</span>
                              <span className={isActiveSort ? 'text-[#3AB1A0]' : 'text-gray-400'}>
                                {isActiveSort ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
                              </span>
                            </button>
                          </th>
                        );
                      })}
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {searchResults.map((record, index) => (
                      <tr
                        key={record._id}
                        ref={(el) => observeTableRow(index, el)}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      >
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium w-12 text-center">
                          {((pagination.page - 1) * pagination.limit) + index + 1}
                        </td>
                        {visibleTableRows.has(index) ? (
                          <>
                            {(isUnifiedPaymentModel ? unifiedPaymentTableColumns : visibleRecordFields.slice(0, 5).map((f) => f.path)).map((fieldPath) => {
                              const fieldType = visibleRecordFields.find((f) => f.path === fieldPath)?.type || 'String';
                              const formatted = formatFieldValue(record[fieldPath], fieldType);
                              return (
                                <td key={fieldPath} className="px-4 py-3 text-gray-900 dark:text-white">
                                  {formatted.substring(0, 50)}
                                  {formatted.length > 50 ? '...' : ''}
                                </td>
                              );
                            })}
                            <td className="px-4 py-3">
                              <button
                                onClick={() => fetchRecordDetails(selectedUpdateModel, record._id)}
                                className="flex items-center gap-1 text-[#3AB1A0] hover:text-[#2A9A8B] font-medium"
                              >
                                <Eye className="w-4 h-4" />
                                View
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            {(isUnifiedPaymentModel ? unifiedPaymentTableColumns : visibleRecordFields.slice(0, 5).map((f) => f.path)).map((fieldPath) => (
                              <td key={fieldPath} className="px-4 py-3">
                                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-1/2"></div>
                              </td>
                            ))}
                            <td className="px-4 py-3">
                              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-12"></div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Enhanced Pagination */}
              {pagination.totalPages > 1 && (
                <div className="bg-gray-50 dark:bg-gray-700/50 border-t-2 border-gray-200 dark:border-gray-700 px-6 py-4">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Showing <span className="font-bold text-orange-600">Page {pagination.page}</span> of <span className="font-bold text-orange-600">{pagination.totalPages}</span>
                      <span className="ml-4 text-gray-600 dark:text-gray-400">({pagination.total.toLocaleString()} total)</span>
                    </p>
                    <div className="flex gap-2 items-center">
                      <button
                        onClick={() => searchRecords(selectedUpdateModel, searchQuery, 1, sortBy, sortOrder)}
                        disabled={pagination.page === 1}
                        className="px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                        title="First page"
                      >
                        ⬅️
                      </button>
                      <button
                        onClick={() => searchRecords(selectedUpdateModel, searchQuery, pagination.page - 1, sortBy, sortOrder)}
                        disabled={pagination.page === 1}
                        className="px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                      >
                        Prev
                      </button>
                      <div className="px-4 py-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                        <span className="text-sm font-bold text-orange-700 dark:text-orange-400">{pagination.page}/{pagination.totalPages}</span>
                      </div>
                      <button
                        onClick={() => searchRecords(selectedUpdateModel, searchQuery, pagination.page + 1, sortBy, sortOrder)}
                        disabled={pagination.page === pagination.totalPages}
                        className="px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                      >
                        Next
                      </button>
                      <button
                        onClick={() => searchRecords(selectedUpdateModel, searchQuery, pagination.totalPages, sortBy, sortOrder)}
                        disabled={pagination.page === pagination.totalPages}
                        className="px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                        title="Last page"
                      >
                        ➡️
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // Render Bulk Update Modal
  const renderBulkUpdateModal = () => {
    if (!showBulkUpdateModal) return null;

    return (
      <div className="fixed inset-0 z-100 flex items-center justify-center">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={closeBulkUpdateModal}
        />

        {/* Modal */}
        <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden m-4">
          {/* Header */}
          <div className="bg-linear-to-r from-orange-500 to-orange-600 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileUp className="w-6 h-6 text-white" />
              <div>
                <h2 className="text-xl font-bold text-white">Bulk Update Preview</h2>
                <p className="text-orange-100 text-sm">
                  {bulkUpdateFile?.name} • {bulkUpdatePreview.length} records
                </p>
              </div>
            </div>
            <button
              onClick={closeBulkUpdateModal}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[60vh]">
            {/* Result Summary */}
            {bulkUpdateResult && (
              <div className={`mb-6 p-4 rounded-xl border-2 ${bulkUpdateResult.success
                ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                : 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                }`}>
                <div className="flex items-center gap-3 mb-3">
                  {bulkUpdateResult.success ? (
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-600" />
                  )}
                  <h3 className={`font-bold ${bulkUpdateResult.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                    {bulkUpdateResult.success ? 'Update Completed!' : 'Update Completed with Errors'}
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{bulkUpdateResult.updated}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Updated Successfully</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-600">{bulkUpdateResult.failed}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Failed</p>
                  </div>
                </div>
                {bulkUpdateResult.errors.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2">Errors:</p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {bulkUpdateResult.errors.slice(0, 10).map((err, idx) => (
                        <p key={idx} className="text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded">
                          ID: {err.id} - {err.error}
                        </p>
                      ))}
                      {bulkUpdateResult.errors.length > 10 && (
                        <p className="text-xs text-gray-500">...and {bulkUpdateResult.errors.length - 10} more errors</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Preview Table */}
            <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 border-b border-gray-200 dark:border-gray-600">
                <p className="font-semibold text-gray-900 dark:text-white">
                  📋 Data Preview (showing first {Math.min(bulkUpdatePreview.length, 10)} of {bulkUpdatePreview.length} records)
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">#</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">_id</th>
                      {bulkUpdatePreview[0] && Object.keys(bulkUpdatePreview[0])
                        .filter(key => key !== '_id' && key !== 'id' && key !== 'ID')
                        .slice(0, 5)
                        .map(key => (
                          <th key={key} className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300">
                            {key}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {bulkUpdatePreview.slice(0, 10).map((record, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{idx + 1}</td>
                        <td className="px-4 py-3 font-mono text-xs text-orange-600 dark:text-orange-400">
                          {record._id}
                        </td>
                        {Object.entries(record)
                          .filter(([key]) => key !== '_id' && key !== 'id' && key !== 'ID')
                          .slice(0, 5)
                          .map(([key, value]) => (
                            <td key={key} className="px-4 py-3 text-gray-900 dark:text-white">
                              {typeof value === 'object' ? JSON.stringify(value).substring(0, 30) : String(value).substring(0, 30)}
                              {String(value).length > 30 ? '...' : ''}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {bulkUpdatePreview.length > 10 && (
                <div className="bg-gray-50 dark:bg-gray-700 px-4 py-2 border-t border-gray-200 dark:border-gray-600">
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                    ... and {bulkUpdatePreview.length - 10} more records
                  </p>
                </div>
              )}
            </div>

            {/* Fields to Update */}
            {bulkUpdatePreview[0] && (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                <p className="font-semibold text-blue-700 dark:text-blue-400 mb-2">Fields to Update:</p>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(bulkUpdatePreview[0])
                    .filter(key => key !== '_id' && key !== 'id' && key !== 'ID')
                    .map(key => (
                      <span key={key} className="px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 rounded text-xs font-medium">
                        {key}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 dark:bg-gray-700/50 px-6 py-4 border-t border-gray-200 dark:border-gray-600 flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Model: <span className="font-bold text-orange-600">{currentModel?.displayName || selectedUpdateModel}</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={closeBulkUpdateModal}
                className="px-4 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium transition-colors"
              >
                {bulkUpdateResult ? 'Close' : 'Cancel'}
              </button>
              {!bulkUpdateResult && (
                <button
                  onClick={processBulkUpdate}
                  disabled={bulkUpdateLoading}
                  className="flex items-center gap-2 px-6 py-2 bg-linear-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-lg font-medium transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-wait"
                >
                  {bulkUpdateLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Update {bulkUpdatePreview.length} Records
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render Error Modal
  const renderErrorModal = () => {
    if (!errorModal.show) return null;

    return (
      <div className="fixed inset-0 z-110 flex items-center justify-center">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => setErrorModal({ show: false, title: '', message: '' })}
        />

        {/* Modal */}
        <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden m-4 animate-in fade-in zoom-in duration-200">
          {/* Header */}
          <div className="bg-linear-to-r from-red-500 to-red-600 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-white" />
              <h2 className="text-xl font-bold text-white">{errorModal.title}</h2>
            </div>
            <button
              onClick={() => setErrorModal({ show: false, title: '', message: '' })}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Main Message */}
            <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl p-4 mb-4">
              <p className="text-red-700 dark:text-red-400 font-medium">
                {errorModal.message}
              </p>
            </div>

            {/* Details */}
            {errorModal.details && errorModal.details.length > 0 && (
              <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl p-4 max-h-60 overflow-y-auto">
                <div className="space-y-1">
                  {errorModal.details.map((detail, idx) => (
                    <p
                      key={idx}
                      className={`text-sm ${detail.startsWith('•')
                        ? 'text-gray-600 dark:text-gray-400 pl-2 font-mono'
                        : 'text-gray-800 dark:text-gray-200 font-semibold mt-2'
                        }`}
                    >
                      {detail}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Help tip */}
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                💡 <strong>Tip:</strong> For bulk updates, your file must include an <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">_id</code> column containing the MongoDB ObjectId of each record you want to update.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 dark:bg-gray-700/50 px-6 py-4 border-t border-gray-200 dark:border-gray-600">
            <button
              onClick={() => setErrorModal({ show: false, title: '', message: '' })}
              className="w-full px-4 py-3 bg-linear-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-lg font-medium transition-all shadow-md hover:shadow-lg"
            >
              Got it, Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Error Modal */}
      {renderErrorModal()}

      {/* Bulk Update Modal */}
      {renderBulkUpdateModal()}

      {/* Sidebar - Fixed */}
      <div className="fixed left-0 top-0 h-screen w-64 z-50">
        {renderSidebar()}
      </div>

      {/* Main Content - with margin for sidebar */}
      <div className="ml-64 flex-1 w-[calc(100%-16rem)] overflow-auto">
        <div className="min-h-screen">
          {/* Only render Export and Updates sections - Import redirects to /admin/import */}
          {activeSection === 'export' && renderExportSection()}
          {activeSection === 'updates' && renderUpdateSection()}
        </div>
      </div>
    </div>
  );
}
