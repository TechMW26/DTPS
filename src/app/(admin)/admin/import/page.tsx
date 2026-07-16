'use client';

/**
 * Data Import Page - Admin Panel
 * 
 * Complete UI for uploading, validating, and importing data
 * with model-wise tabs, validation errors, and editing capabilities.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trash2,
  Save,
  RefreshCw,
  Download,
  Edit2,
  Eye,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  FileJson,
  FileText,
  Table,
  X,
  CheckCircle,
  AlertCircle,
  Database,
  Edit3
} from 'lucide-react';

// Types
interface ValidationError {
  row: number;
  modelName: string;
  field: string;
  message: string;
  value: any;
  errorType: string;
}

interface FieldMappingInfo {
  originalField: string;
  mappedField: string | null;
  value: any;
  status: 'mapped' | 'unmapped' | 'empty';
}

interface RowData {
  rowIndex: number;
  data: Record<string, any>;
  isValid: boolean;
  errors: ValidationError[];
  fieldMapping?: FieldMappingInfo[];
  unmappedFields?: string[];
  emptyFields?: string[];
}

interface ModelGroup {
  modelName: string;
  displayName: string;
  validCount: number;
  invalidCount: number;
  totalCount: number;
  rows: RowData[];
}

interface UnmatchedRow {
  rowIndex: number;
  data: Record<string, any>;
  matchAttempts?: Array<{
    modelName: string;
    confidence: number;
  }>;
}

interface ImportState {
  sessionId: string | null;
  fileName: string | null;
  fileType: string | null;
  totalRows: number;
  headers: string[];
  validation: {
    validRows: number;
    invalidRows: number;
    unmatchedRows: number;
    canSave: boolean;
  } | null;
  modelGroups: ModelGroup[];
  unmatchedData: UnmatchedRow[];
  allErrors: ValidationError[];
  status: 'idle' | 'uploading' | 'validated' | 'saving' | 'saved' | 'error';
}

interface ModelInfo {
  name: string;
  displayName: string;
  description: string;
  requiredFields: string[];
  fieldCount: number;
}

// Initial state
const initialState: ImportState = {
  sessionId: null,
  fileName: null,
  fileType: null,
  totalRows: 0,
  headers: [],
  validation: null,
  modelGroups: [],
  unmatchedData: [],
  allErrors: [],
  status: 'idle'
};

export default function DataImportPage() {
  const [state, setState] = useState<ImportState>(initialState);
  const [activeTab, setActiveTab] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [forceModel, setForceModel] = useState<string>('');
  const [editingRow, setEditingRow] = useState<{
    modelName: string;
    rowIndex: number;
    data: Record<string, any>;
  } | null>(null);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [showMatchDetails, setShowMatchDetails] = useState<number | null>(null);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [showErrorsModal, setShowErrorsModal] = useState(false);
  const [viewingRowData, setViewingRowData] = useState<{
    rowIndex: number;
    data: Record<string, any>;
    modelName?: string;
    isValid?: boolean;
    errors?: ValidationError[];
    fieldMapping?: FieldMappingInfo[];
    unmappedFields?: string[];
    emptyFields?: string[];
  } | null>(null);

  // Load available models on mount
  useEffect(() => {
    loadAvailableModels();
  }, []);

  // Set initial active tab when model groups change
  useEffect(() => {
    if (state.modelGroups.length > 0 && !activeTab) {
      setActiveTab(state.modelGroups[0].modelName);
    }
  }, [state.modelGroups, activeTab]);

  const loadAvailableModels = async () => {
    try {
      const res = await fetch('/api/admin/import/models');
      const data = await res.json();
      if (data.success) {
        setAvailableModels(data.models);
      }
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  };

  // File drop handler
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setState(prev => ({ ...prev, status: 'uploading' }));

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (forceModel) {
        formData.append('forceModel', forceModel);
      }

      const res = await fetch('/api/admin/import/upload', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (!data.success) {
        toast.error(data.error || 'Failed to upload file');
        setState(prev => ({ ...prev, status: 'error' }));
        return;
      }

      setState({
        sessionId: data.sessionId,
        fileName: data.fileName,
        fileType: data.fileType,
        totalRows: data.totalRows,
        headers: data.headers,
        validation: data.validation,
        modelGroups: data.modelGroups,
        unmatchedData: data.unmatchedData,
        allErrors: data.allErrors,
        status: 'validated'
      });

      if (data.validation.canSave) {
        toast.success('File validated successfully! Ready to save.');
      } else {
        toast.warning(`Found ${data.validation.invalidRows} invalid rows and ${data.validation.unmatchedRows} unmatched rows`);
      }

    } catch (error: any) {
      toast.error('Failed to upload file: ' + error.message);
      setState(prev => ({ ...prev, status: 'error' }));
    }
  }, [forceModel]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/json': ['.json']
    },
    maxFiles: 1,
    disabled: state.status === 'uploading' || state.status === 'saving'
  });

  // Save handler
  const handleSave = async () => {
    if (!state.sessionId || !state.validation?.canSave) return;

    setState(prev => ({ ...prev, status: 'saving' }));

    try {
      const res = await fetch('/api/admin/import/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: state.sessionId,
          fallbackSession: {
            fileName: state.fileName,
            modelGroups: state.modelGroups,
            unmatchedData: state.unmatchedData,
            canSave: state.validation?.canSave ?? false
          }
        })
      });

      const data = await res.json();

      if (!data.success) {
        toast.error(data.error || 'Failed to save data');
        setState(prev => ({ ...prev, status: 'validated' }));
        return;
      }

      toast.success(`Successfully saved ${data.totalSaved} records!`);

      // Reset to initial state after successful save
      setTimeout(() => {
        setState(initialState);
        setActiveTab('');
        setEditingRow(null);
      }, 1500);

    } catch (error: any) {
      toast.error('Failed to save: ' + error.message);
      setState(prev => ({ ...prev, status: 'validated' }));
    }
  };

  // Clear handler
  const handleClear = async () => {
    if (state.sessionId) {
      try {
        await fetch(`/api/admin/import/session?sessionId=${state.sessionId}&action=delete`, {
          method: 'DELETE'
        });
      } catch (error) {
        console.error('Failed to delete session:', error);
      }
    }

    setState(initialState);
    setActiveTab('');
    setEditingRow(null);
    toast.info('Cleared all data');
  };

  // Remove row handler
  const handleRemoveRow = async (modelName: string | null, rowIndex: number) => {
    if (!state.sessionId) return;

    try {
      const params = new URLSearchParams({
        sessionId: state.sessionId,
        rowIndex: rowIndex.toString()
      });
      if (modelName) {
        params.append('modelName', modelName);
      }

      const res = await fetch(`/api/admin/import/row?${params}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (data.success) {
        // Update local state
        if (modelName) {
          setState(prev => ({
            ...prev,
            modelGroups: prev.modelGroups.map(g => {
              if (g.modelName === modelName) {
                const rows = g.rows.filter(r => r.rowIndex !== rowIndex);
                return {
                  ...g,
                  rows,
                  totalCount: rows.length,
                  validCount: rows.filter(r => r.isValid).length,
                  invalidCount: rows.filter(r => !r.isValid).length
                };
              }
              return g;
            }),
            validation: prev.validation ? {
              ...prev.validation,
              canSave: data.sessionCanSave
            } : null
          }));
        } else {
          setState(prev => ({
            ...prev,
            unmatchedData: prev.unmatchedData.filter(r => r.rowIndex !== rowIndex),
            validation: prev.validation ? {
              ...prev.validation,
              unmatchedRows: prev.unmatchedData.length - 1,
              canSave: data.sessionCanSave
            } : null
          }));
        }
        toast.success('Row removed');
      }
    } catch (error) {
      toast.error('Failed to remove row');
    }
  };

  // Update row handler
  const handleUpdateRow = async () => {
    if (!state.sessionId || !editingRow) return;

    try {
      const res = await fetch('/api/admin/import/row', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: state.sessionId,
          modelName: editingRow.modelName,
          rowIndex: editingRow.rowIndex,
          data: editingRow.data
        })
      });

      const data = await res.json();

      if (data.success) {
        // Update local state
        setState(prev => ({
          ...prev,
          modelGroups: prev.modelGroups.map(g => {
            if (g.modelName === editingRow.modelName) {
              const rows = g.rows.map(r => {
                if (r.rowIndex === editingRow.rowIndex) {
                  return data.row;
                }
                return r;
              });
              return {
                ...g,
                rows,
                validCount: rows.filter(r => r.isValid).length,
                invalidCount: rows.filter(r => !r.isValid).length
              };
            }
            return g;
          }),
          validation: prev.validation ? {
            ...prev.validation,
            canSave: data.sessionCanSave
          } : null
        }));

        setEditingRow(null);
        toast.success('Row updated');
      } else {
        toast.error('Failed to update row');
      }
    } catch (error) {
      toast.error('Failed to update row');
    }
  };

  // Export handler
  const handleExport = async (modelName: string, format: 'csv' | 'json') => {
    if (!state.sessionId) return;

    window.open(
      `/api/admin/import/export?sessionId=${state.sessionId}&model=${modelName}&format=${format}`,
      '_blank'
    );
  };

  // Download template handler
  const handleDownloadTemplate = async (modelName: string) => {
    try {
      const res = await fetch(`/api/admin/import/models?model=${modelName}&action=template`);
      const data = await res.json();

      if (data.success) {
        const blob = new Blob([data.template.csvTemplate], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${modelName}_template.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      toast.error('Failed to download template');
    }
  };

  // Render upload area
  const renderUploadArea = () => (
    <div className="space-y-4">
      {/* Model selector */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Force assign to model (optional):
        </label>
        <select
          value={forceModel}
          onChange={(e) => setForceModel(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
        >
          <option value="">Auto-detect model</option>
          {availableModels.map(m => (
            <option key={m.name} value={m.name}>{m.displayName}</option>
          ))}
        </select>
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all
          ${isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-gray-300 dark:border-gray-600 hover:border-primary/50'
          }
          ${state.status === 'uploading' ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-4">
          {state.status === 'uploading' ? (
            <Loader2 className="w-16 h-16 text-primary animate-spin" />
          ) : (
            <Upload className="w-16 h-16 text-gray-400" />
          )}
          <div>
            <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
              {isDragActive ? 'Drop the file here' : 'Drag & drop a file here'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              or click to select a file (CSV, Excel, JSON)
            </p>
          </div>
        </div>
      </div>

      {/* Available models info */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <Info className="w-4 h-4" />
          Supported Models ({availableModels.length})
        </h3>
        {availableModels.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading models...</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {availableModels.map(m => (
              <div key={m.name} className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded-lg text-sm hover:bg-teal-50 dark:hover:bg-gray-700/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white truncate">{m.displayName}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{m.fieldCount} fields</div>
                </div>
                <button
                  onClick={() => handleDownloadTemplate(m.name)}
                  className="ml-2 text-primary hover:text-primary/80 shrink-0"
                  title="Download template"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // Render validation summary
  const renderValidationSummary = () => {
    if (!state.validation) return null;

    // Calculate total unmapped fields across all rows
    let totalUnmappedFields = 0;
    let totalEmptyFields = 0;
    let rowsWithUnmappedFields = 0;

    state.modelGroups.forEach(group => {
      group.rows.forEach(row => {
        if (row.unmappedFields && row.unmappedFields.length > 0) {
          totalUnmappedFields += row.unmappedFields.length;
          rowsWithUnmappedFields++;
        }
        if (row.emptyFields && row.emptyFields.length > 0) {
          totalEmptyFields += row.emptyFields.length;
        }
      });
    });

    return (
      <div className="space-y-4 mb-6">
        {/* Main stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-1">
              <FileSpreadsheet className="w-4 h-4" />
              <span className="text-sm">Total Rows</span>
            </div>
            <p className="text-2xl font-bold">{state.totalRows}</p>
          </div>

          <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-sm">Valid</span>
            </div>
            <p className="text-2xl font-bold text-green-700 dark:text-green-400">
              {state.validation.validRows}
            </p>
          </div>

          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-1">
              <XCircle className="w-4 h-4" />
              <span className="text-sm">Invalid</span>
            </div>
            <p className="text-2xl font-bold text-red-700 dark:text-red-400">
              {state.validation.invalidRows}
            </p>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-4 border border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400 mb-1">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm">Unmatched</span>
            </div>
            <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">
              {state.validation.unmatchedRows}
            </p>
          </div>
        </div>

        {/* Field mapping warning */}
        {totalUnmappedFields > 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-yellow-800 dark:text-yellow-300">
                  Field Mapping Warning
                </h4>
                <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
                  {totalUnmappedFields} fields in {rowsWithUnmappedFields} rows could not be mapped to database fields and will NOT be saved.
                  Click the <Eye className="w-4 h-4 inline mx-1" /> button on any row to see detailed field mapping information.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render model tabs
  const renderModelTabs = () => {
    const tabs = [
      ...state.modelGroups.map(g => ({
        id: g.modelName,
        label: g.displayName,
        count: g.totalCount,
        invalidCount: g.invalidCount
      })),
      ...(state.unmatchedData.length > 0 ? [{
        id: 'unmatched',
        label: 'Unmatched',
        count: state.unmatchedData.length,
        invalidCount: state.unmatchedData.length
      }] : [])
    ];

    return (
      <div className="flex flex-wrap gap-2 mb-4 border-b border-gray-200 dark:border-gray-700 pb-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2
              ${activeTab === tab.id
                ? 'bg-primary text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }
            `}
          >
            {tab.label}
            <span className={`
              px-2 py-0.5 rounded-full text-xs
              ${activeTab === tab.id
                ? 'bg-white/20 text-white'
                : 'bg-gray-200 dark:bg-gray-700'
              }
            `}>
              {tab.count}
            </span>
            {tab.invalidCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-red-500 text-white">
                {tab.invalidCount} errors
              </span>
            )}
          </button>
        ))}
      </div>
    );
  };

  // Render comprehensive field viewer modal
  const renderFieldViewer = () => {
    if (!viewingRowData) return null;

    const { data, modelName, isValid, errors = [], fieldMapping = [], unmappedFields = [], emptyFields = [] } = viewingRowData;
    const allFields = Object.entries(data);
    const filledFields = allFields.filter(([, value]) =>
      value !== null && value !== undefined && value !== '' && value !== 0
    ).length;
    const totalFields = allFields.length;
    const mappedFieldsList = fieldMapping?.filter(f => f.status === 'mapped') || [];
    const unmappedFieldsList = fieldMapping?.filter(f => f.status === 'unmapped') || [];
    const emptyFieldsList = fieldMapping?.filter(f => f.status === 'empty') || [];

    const errorsByField = new Map<string, string[]>();
    errors?.forEach(err => {
      if (!errorsByField.has(err.field)) {
        errorsByField.set(err.field, []);
      }
      errorsByField.get(err.field)?.push(err.message);
    });

    return (
      <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-5xl my-8">
          {/* Header */}
          <div className="border-b border-gray-200 dark:border-gray-700 p-6 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-900 z-10">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {modelName || 'Row Data'} - Field Mapping Details
              </h3>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${isValid
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                  }`}>
                  {isValid ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {isValid ? 'Valid' : 'Invalid'}
                </span>
                <span className="text-green-600 dark:text-green-400">
                  ✓ {mappedFieldsList.length} mapped
                </span>
                {unmappedFieldsList.length > 0 && (
                  <span className="text-red-600 dark:text-red-400">
                    ✗ {unmappedFieldsList.length} unmapped
                  </span>
                )}
                {emptyFieldsList.length > 0 && (
                  <span className="text-orange-600 dark:text-orange-400">
                    ○ {emptyFieldsList.length} empty
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setViewingRowData(null)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
            {/* Unmapped Fields Section - Show First as Warning */}
            {unmappedFieldsList.length > 0 && (
              <div className="mb-8">
                <h4 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-4 flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  Unmapped Fields ({unmappedFieldsList.length}) - These fields will NOT be saved!
                </h4>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-600 dark:text-red-400 mb-3">
                    The following fields from your import file could not be matched to any database field:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {unmappedFieldsList.map((field, i) => (
                      <div key={i} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-red-300 dark:border-red-700">
                        <div className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">
                          {field.originalField}
                        </div>
                        <p className="text-sm text-gray-900 dark:text-white mt-1">
                          {typeof field.value === 'object' ? JSON.stringify(field.value) : String(field.value)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Mapped Fields Section */}
            {mappedFieldsList.length > 0 && (
              <div className="mb-8">
                <h4 className="text-sm font-semibold text-green-700 dark:text-green-400 mb-4 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Mapped Fields ({mappedFieldsList.length}) - These fields will be saved
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {mappedFieldsList.map((field, i) => {
                    const fieldErrors = errorsByField.get(field.mappedField || '');
                    const wasMapped = field.originalField !== field.mappedField;
                    return (
                      <div key={i} className={`rounded-lg p-4 border ${fieldErrors
                          ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                          : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                        }`}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            {wasMapped ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 dark:text-gray-400 line-through">
                                  {field.originalField}
                                </span>
                                <span className="text-xs text-green-600">→</span>
                                <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">
                                  {field.mappedField}
                                </span>
                              </div>
                            ) : (
                              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                {field.mappedField}
                              </label>
                            )}
                          </div>
                          {fieldErrors && (
                            <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                          )}
                        </div>
                        <p className="text-sm text-gray-900 dark:text-white">
                          {typeof field.value === 'object' ? JSON.stringify(field.value) : String(field.value)}
                        </p>
                        {fieldErrors && (
                          <div className="mt-2 pt-2 border-t border-yellow-200 dark:border-yellow-700">
                            <div className="text-xs text-yellow-700 dark:text-yellow-400 space-y-1">
                              {fieldErrors.map((err, j) => (
                                <div key={j}>• {err}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty Fields Section */}
            {emptyFieldsList.length > 0 && (
              <div className="mb-8">
                <h4 className="text-sm font-semibold text-orange-700 dark:text-orange-400 mb-4 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Empty Fields ({emptyFieldsList.length}) - No data provided
                </h4>
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                  <div className="flex flex-wrap gap-2">
                    {emptyFieldsList.map((field, i) => (
                      <span key={i} className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-orange-100 dark:bg-orange-800/30 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-700">
                        {field.mappedField || field.originalField}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Validation Errors Section */}
            {errors && errors.length > 0 && (
              <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-4 flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  Validation Issues ({errors.length})
                </h4>
                <div className="space-y-2">
                  {errors.map((err, i) => (
                    <div key={i} className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-800">
                      <div className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">
                        {err.field}
                      </div>
                      <p className="text-sm text-red-600 dark:text-red-400">
                        {err.message}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All Saved Data Preview */}
            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                <Table className="w-4 h-4" />
                Final Data to be Saved ({Object.keys(data).length} fields)
              </h4>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-6 flex justify-end gap-3 sticky bottom-0 bg-white dark:bg-gray-900">
            <button
              onClick={() => setViewingRowData(null)}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Render data table for a model group
  const renderDataTable = () => {
    if (activeTab === 'unmatched') {
      return renderUnmatchedTable();
    }

    const group = state.modelGroups.find(g => g.modelName === activeTab);
    if (!group) return null;

    const rows = showErrorsOnly
      ? group.rows.filter(r => !r.isValid)
      : group.rows;

    const headers = Object.keys(rows[0]?.data || {});
    const visibleHeaders = headers.filter(h => !isSensitiveField(h));

    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Table controls */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showErrorsOnly}
                onChange={(e) => setShowErrorsOnly(e.target.checked)}
                className="rounded"
              />
              Show errors only
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExport(group.modelName, 'csv')}
              className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-1"
            >
              <FileText className="w-4 h-4" />
              Export CSV
            </button>
            <button
              onClick={() => handleExport(group.modelName, 'json')}
              className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-1"
            >
              <FileJson className="w-4 h-4" />
              Export JSON
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto max-h-150 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 w-16">Row</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 w-24">Status</th>
                {visibleHeaders.slice(0, 8).map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {getDisplayHeader(h)}
                  </th>
                ))}
                <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {rows.map(row => (
                <React.Fragment key={row.rowIndex}>
                  <tr className={`
                    ${row.isValid
                      ? (row.unmappedFields && row.unmappedFields.length > 0
                        ? 'bg-yellow-50 dark:bg-yellow-900/10'
                        : 'bg-white dark:bg-gray-800')
                      : 'bg-red-50 dark:bg-red-900/10'
                    }
                  `}>
                    <td className="px-4 py-3 font-mono text-gray-500">{row.rowIndex}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {row.isValid ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                            <CheckCircle2 className="w-3 h-3" />
                            Valid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                            <XCircle className="w-3 h-3" />
                            {row.errors.length} error(s)
                          </span>
                        )}
                        {row.unmappedFields && row.unmappedFields.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
                            <AlertTriangle className="w-3 h-3" />
                            {row.unmappedFields.length} unmapped
                          </span>
                        )}
                      </div>
                    </td>
                    {visibleHeaders.slice(0, 8).map(h => (
                      <td key={h} className="px-4 py-3 max-w-50 truncate">
                        {formatCellValue(row.data[h])}
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setViewingRowData({
                            rowIndex: row.rowIndex,
                            data: sanitizeDataForView(row.data),
                            modelName: group.modelName,
                            isValid: row.isValid,
                            errors: row.errors,
                            fieldMapping: row.fieldMapping,
                            unmappedFields: row.unmappedFields,
                            emptyFields: row.emptyFields
                          })}
                          className="p-1 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded"
                          title="View all fields"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingRow({
                            modelName: group.modelName,
                            rowIndex: row.rowIndex,
                            data: { ...row.data }
                          })}
                          className="p-1 text-[#3AB1A0] hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleRemoveRow(group.modelName, row.rowIndex)}
                          className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* Error details row */}
                  {!row.isValid && (
                    <tr className="bg-red-50/50 dark:bg-red-900/5">
                      <td colSpan={visibleHeaders.slice(0, 8).length + 3} className="px-4 py-2">
                        <div className="flex flex-wrap gap-2">
                          {row.errors.map((error, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                              <strong>{error.field}:</strong> {error.message}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Render unmatched rows table
  const renderUnmatchedTable = () => {
    if (state.unmatchedData.length === 0) return null;

    const headers = Object.keys(state.unmatchedData[0]?.data || {});
    const visibleHeaders = headers.filter(h => !isSensitiveField(h));

    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-yellow-200 dark:border-yellow-800 overflow-hidden">
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-medium">These {state.unmatchedData.length} rows could not be matched to any model</span>
            </div>
            <p className="text-sm text-yellow-600 dark:text-yellow-500 mt-1">
              Click "Why?" to see model match attempts, or remove these rows to proceed with saving.
            </p>
          </div>

          <div className="overflow-x-auto max-h-100 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 w-16">Row</th>
                  {visibleHeaders.slice(0, 6).map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {getDisplayHeader(h)}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 w-32">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {state.unmatchedData.map(row => (
                  <tr key={row.rowIndex} className="bg-yellow-50/50 dark:bg-yellow-900/5">
                    <td className="px-4 py-3 font-mono text-gray-500">{row.rowIndex}</td>
                    {visibleHeaders.slice(0, 6).map(h => (
                      <td key={h} className="px-4 py-3 max-w-37.5 truncate">
                        {formatCellValue(row.data[h])}
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setViewingRowData({
                            rowIndex: row.rowIndex,
                            data: sanitizeDataForView(row.data)
                          })}
                          className="p-1 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded"
                          title="View all fields"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setShowMatchDetails(showMatchDetails === row.rowIndex ? null : row.rowIndex)}
                          className="px-2 py-1 text-xs bg-teal-50 dark:bg-teal-900/20 text-[#3AB1A0] dark:text-[#3AB1A0] rounded hover:bg-teal-100 dark:hover:bg-teal-900/40"
                          title="See why this row didn't match any model"
                        >
                          Why?
                        </button>
                        <button
                          onClick={() => handleRemoveRow(null, row.rowIndex)}
                          className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                          title="Remove this row"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Model match details panel */}
        {showMatchDetails !== null && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-teal-200 dark:border-teal-800 overflow-hidden">
            <div className="p-4 bg-teal-50 dark:bg-teal-900/20 border-b border-teal-200 dark:border-teal-800 flex justify-between items-center">
              <div>
                <h3 className="font-medium text-teal-700 dark:text-teal-400">
                  Why Row {showMatchDetails} Didn't Match Any Model
                </h3>
                <p className="text-sm text-teal-600 dark:text-teal-500 mt-1">
                  A row needs at least 60% confidence to match a model. All attempts below:
                </p>
              </div>
              <button
                onClick={() => setShowMatchDetails(null)}
                className="p-1 hover:bg-teal-100 dark:hover:bg-teal-800 rounded"
              >
                <X className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              </button>
            </div>

            <div className="p-4 space-y-2 max-h-75 overflow-y-auto">
              {state.unmatchedData
                .find(r => r.rowIndex === showMatchDetails)
                ?.matchAttempts?.sort((a, b) => b.confidence - a.confidence)
                .map((attempt, idx) => (
                  <div
                    key={attempt.modelName}
                    className={`p-3 rounded-lg border ${attempt.confidence >= 60
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                        : attempt.confidence >= 40
                          ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                          : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {idx + 1}. {attempt.modelName}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-gray-200 dark:bg-gray-600 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full transition-all ${attempt.confidence >= 60
                                ? 'bg-green-500'
                                : attempt.confidence >= 40
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500'
                              }`}
                            style={{ width: `${attempt.confidence}%` }}
                          />
                        </div>
                        <span className={`font-mono text-sm font-semibold ${attempt.confidence >= 60 ? 'text-green-600' : 'text-red-600'
                          }`}>
                          {attempt.confidence.toFixed(1)}%
                        </span>
                        {attempt.confidence >= 60 ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                    </div>
                  </div>
                )) || (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                    No match attempt data available for this row
                  </p>
                )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Edit modal
  const renderEditModal = () => {
    if (!editingRow) return null;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold">Edit Row {editingRow.rowIndex}</h3>
            <button
              onClick={() => setEditingRow(null)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 overflow-y-auto max-h-[60vh]">
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(editingRow.data).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {key}
                  </label>
                  <input
                    type="text"
                    value={value ?? ''}
                    onChange={(e) => setEditingRow({
                      ...editingRow,
                      data: { ...editingRow.data, [key]: e.target.value }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setEditingRow(null)}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdateRow}
              className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Format cell value for display
  const formatCellValue = (value: any): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const isSensitiveField = (fieldName: string): boolean => {
    const normalized = fieldName.toLowerCase();
    return normalized.includes('password');
  };

  const getDisplayHeader = (fieldName: string): string => {
    if (fieldName === 'dtps_id') return 'zoconutId';
    return fieldName;
  };

  const sanitizeDataForView = (input: Record<string, any>): Record<string, any> => {
    const output: Record<string, any> = {};
    for (const [key, value] of Object.entries(input || {})) {
      output[key] = isSensitiveField(key) ? '******' : value;
    }
    return output;
  };

  const router = useRouter();

  // Sidebar state
  const [activeSection] = useState<'import' | 'export' | 'updates'>('import');

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
        {/* Import Section */}
        <button
          onClick={() => router.push('/admin/import')}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-150 font-medium bg-linear-to-r from-[#3AB1A0] to-[#2A9A8B] text-white shadow-lg shadow-teal-500/30`}
        >
          <Upload className="w-5 h-5 shrink-0" />
          <div className="text-left flex-1">
            <p className="font-semibold">Import Data</p>
            <p className={`text-xs opacity-70 text-teal-100`}>
              Upload files
            </p>
          </div>
          <ChevronRight className="w-4 h-4 shrink-0" />
        </button>

        {/* Export Section */}
        <button
          onClick={() => router.push('/admin/data')}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-150 font-medium text-gray-700 dark:text-gray-300 hover:bg-teal-100 dark:hover:bg-teal-900/20`}
        >
          <Download className="w-5 h-5 shrink-0" />
          <div className="text-left flex-1">
            <p className="font-semibold">Export Data</p>
            <p className="text-xs opacity-70">Download files</p>
          </div>
        </button>

        {/* Updates Section */}
        <button
          onClick={() => router.push('/admin/data')}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-150 font-medium text-gray-700 dark:text-gray-300 hover:bg-teal-100 dark:hover:bg-teal-900/20`}
        >
          <Edit3 className="w-5 h-5 shrink-0" />
          <div className="text-left flex-1">
            <p className="font-semibold">Update Data</p>
            <p className="text-xs opacity-70">Search & edit</p>
          </div>
        </button>
      </nav>

      {/* Quick Stats */}
      <div className="p-4 m-4 bg-white dark:bg-gray-800 border-2 border-teal-200 dark:border-teal-900 rounded-lg">
        <p className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase tracking-widest mb-4">
          📊 Status
        </p>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Import Status</span>
            <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-3 py-1 rounded-lg font-bold text-sm">
              Active
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Mode</span>
            <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-3 py-1 rounded-lg font-bold text-sm">
              Upload
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

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar - Fixed */}
      <div className="fixed left-0 top-0 h-screen w-64 z-50">
        {renderSidebar()}
      </div>

      {/* Main Content - with margin for sidebar */}
      <div className="ml-64 flex-1 w-[calc(100%-16rem)] overflow-auto">
        <div className="min-h-screen">
          <div className="p-8 max-w-7xl">
            {/* Header */}
            <div className="flex items-start justify-between mb-8">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-3 bg-linear-to-r from-[#3AB1A0] to-[#2A9A8B] rounded-lg">
                    <Upload className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Import Data</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                      Import data from CSV, Excel, or JSON files with automatic model detection
                    </p>
                  </div>
                </div>
              </div>

              {state.status !== 'idle' && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleClear}
                    className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Clear & Re-upload
                  </button>

                  <button
                    onClick={handleSave}
                    disabled={!state.validation?.canSave || state.status === 'saving' || state.status === 'saved'}
                    className={`
                px-4 py-2 text-sm rounded-lg flex items-center gap-2 font-medium
                ${state.validation?.canSave && state.status !== 'saving' && state.status !== 'saved'
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                      }
              `}
                  >
                    {state.status === 'saving' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : state.status === 'saved' ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Saved
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save All
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* File info */}
            {state.fileName && (
              <div className="mb-6 bg-teal-50 dark:bg-teal-900/20 rounded-xl p-4 flex items-center gap-4">
                <FileSpreadsheet className="w-8 h-8 text-[#3AB1A0] dark:text-[#3AB1A0]" />
                <div>
                  <p className="font-medium text-teal-900 dark:text-teal-300">{state.fileName}</p>
                  <p className="text-sm text-teal-700 dark:text-teal-400">
                    {state.fileType?.toUpperCase()} • {state.totalRows} rows • {state.headers.length} columns
                  </p>
                </div>
              </div>
            )}

            {/* Main content */}
            {state.status === 'idle' || state.status === 'error' ? (
              renderUploadArea()
            ) : (
              <>
                {renderValidationSummary()}

                {/* Cannot save warning */}
                {!state.validation?.canSave && state.status === 'validated' && (
                  <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                        <XCircle className="w-5 h-5" />
                        <span className="font-medium">Cannot save: Fix all validation errors first</span>
                      </div>
                      {state.allErrors.length > 0 && (
                        <button
                          onClick={() => setShowErrorsModal(true)}
                          className="px-3 py-1 text-xs bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-700 flex items-center gap-1 font-semibold transition-colors"
                        >
                          <AlertTriangle className="w-4 h-4" />
                          View All Errors ({state.allErrors.length})
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-red-600 dark:text-red-500 mt-1">
                      You have {state.validation?.invalidRows || 0} invalid rows and {state.validation?.unmatchedRows || 0} unmatched rows.
                      Edit or remove them to enable saving.
                    </p>
                  </div>
                )}

                {/* Saved success */}
                {state.status === 'saved' && (
                  <div className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="font-medium">Data saved successfully!</span>
                    </div>
                  </div>
                )}

                {/* Tabs and content */}
                {(state.modelGroups.length > 0 || state.unmatchedData.length > 0) && (
                  <>
                    {renderModelTabs()}
                    {renderDataTable()}
                  </>
                )}
              </>
            )}

            {/* Edit modal */}
            {renderEditModal()}

            {/* Field viewer modal */}
            {renderFieldViewer()}

            {/* Errors & Duplicates Modal */}
            {showErrorsModal && state.allErrors.length > 0 && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
                <div className="bg-white dark:bg-gray-800 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                  {/* Modal Header */}
                  <div className="sticky top-0 bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-700 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                          Validation Errors & Issues
                        </h2>
                        <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                          Fix these errors before saving your data
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowErrorsModal(false)}
                      className="p-2 hover:bg-red-100 dark:hover:bg-red-800/50 rounded-lg transition-colors"
                      title="Close"
                    >
                      <X className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                    </button>
                  </div>

                  {/* Modal Content */}
                  <div className="flex-1 overflow-y-auto p-6">
                    {/* Error Summary */}
                    <div className="mb-6 grid grid-cols-3 gap-4">
                      <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-700">
                        <p className="text-xs text-red-600 dark:text-red-400 font-semibold uppercase tracking-wide mb-1">
                          Total Errors
                        </p>
                        <p className="text-2xl font-bold text-red-700 dark:text-red-400">
                          {state.allErrors.length}
                        </p>
                      </div>
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 border border-yellow-200 dark:border-yellow-700">
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 font-semibold uppercase tracking-wide mb-1">
                          Invalid Rows
                        </p>
                        <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">
                          {state.validation?.invalidRows || 0}
                        </p>
                      </div>
                      <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-700">
                        <p className="text-xs text-orange-600 dark:text-orange-400 font-semibold uppercase tracking-wide mb-1">
                          Unmatched Rows
                        </p>
                        <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">
                          {state.validation?.unmatchedRows || 0}
                        </p>
                      </div>
                    </div>

                    {/* Errors Table */}
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-red-100 dark:bg-red-900/50 sticky top-0">
                            <tr className="border-b border-gray-200 dark:border-gray-700">
                              <th className="px-4 py-3 text-left font-semibold text-red-700 dark:text-red-400">Row</th>
                              <th className="px-4 py-3 text-left font-semibold text-red-700 dark:text-red-400">Model</th>
                              <th className="px-4 py-3 text-left font-semibold text-red-700 dark:text-red-400">Field</th>
                              <th className="px-4 py-3 text-left font-semibold text-red-700 dark:text-red-400">Issue</th>
                              <th className="px-4 py-3 text-left font-semibold text-red-700 dark:text-red-400">Type</th>
                              <th className="px-4 py-3 text-left font-semibold text-red-700 dark:text-red-400">Value</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {state.allErrors.map((error, idx) => (
                              <tr key={idx} className="hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                                <td className="px-4 py-3 font-mono text-gray-600 dark:text-gray-400">
                                  <span className="bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded text-xs">
                                    {error.row}
                                  </span>
                                </td>
                                <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                                  {error.modelName}
                                </td>
                                <td className="px-4 py-3 font-semibold text-[#3AB1A0] dark:text-[#3AB1A0]">
                                  {error.field}
                                </td>
                                <td className="px-4 py-3 text-red-700 dark:text-red-400 max-w-xs truncate" title={error.message}>
                                  {error.message}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${error.errorType === 'duplicate'
                                      ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                                      : error.errorType === 'required'
                                        ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400'
                                        : error.errorType === 'enum'
                                          ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400'
                                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400'
                                    }`}>
                                    {error.errorType === 'duplicate' && '⚠️ '}
                                    {error.errorType}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-xs truncate" title={formatCellValue(error.value)}>
                                  {formatCellValue(error.value)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination info */}
                      {state.allErrors.length > 50 && (
                        <div className="bg-gray-100 dark:bg-gray-800 px-4 py-3 text-center text-xs text-gray-600 dark:text-gray-400">
                          Showing all {state.allErrors.length} errors
                        </div>
                      )}
                    </div>

                    {/* Error Type Legend */}
                    <div className="mt-6 p-4 bg-teal-50 dark:bg-teal-900/20 rounded-lg border border-teal-200 dark:border-teal-700">
                      <h4 className="font-semibold text-teal-900 dark:text-teal-300 mb-3 text-sm">Error Types:</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-full bg-red-500"></span>
                          <span className="text-gray-700 dark:text-gray-300"><strong>Duplicate</strong> - Data exists in DB</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-full bg-orange-500"></span>
                          <span className="text-gray-700 dark:text-gray-300"><strong>Required</strong> - Missing required field</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-full bg-yellow-500"></span>
                          <span className="text-gray-700 dark:text-gray-300"><strong>Enum</strong> - Invalid option value</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-full bg-gray-500"></span>
                          <span className="text-gray-700 dark:text-gray-300"><strong>Other</strong> - Other validation error</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Review and fix errors before proceeding with import
                    </p>
                    <button
                      onClick={() => setShowErrorsModal(false)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                    >
                      <X className="w-4 h-4" />
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
