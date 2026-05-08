/**
 * API Route: Data Export
 * GET /api/admin/data/export - Export model data to CSV
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import { modelRegistry } from '@/lib/import';
import {
  generateHeaderFromField,
  formatValueForCSV,
  escapeCSV,
} from '@/lib/utils/csvExport';

export const runtime = 'nodejs';

/**
 * Check if a value is a Buffer
 */
function isBuffer(value: any): boolean {
  if (!value) return false;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return true;
  if (value.type === 'Buffer' && Array.isArray(value.data)) return true;
  if (value._bsontype === 'Binary') return true;
  return false;
}

/**
 * Check if a value is an ObjectId
 */
function isObjectId(value: any): boolean {
  if (!value) return false;
  if (typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value)) return true;
  if (value._bsontype === 'ObjectId' || value._bsontype === 'ObjectID') return true;
  if (value.constructor?.name === 'ObjectId') return true;
  return false;
}

/**
 * Format ingredient object for display
 */
function formatIngredient(ing: any): string {
  if (!ing) return '';
  const parts = [];
  if (ing.quantity) parts.push(ing.quantity);
  if (ing.unit) parts.push(ing.unit);
  if (ing.name) parts.push(ing.name);
  if (ing.remarks) parts.push(`(${ing.remarks})`);
  return parts.join(' ').trim() || '';
}

/**
 * Flatten an object for CSV export - extracts all scalar values
 */
function flattenObject(obj: any, prefix: string = '', result: Record<string, any> = {}): Record<string, any> {
  if (!obj || typeof obj !== 'object') {
    return result;
  }

  Object.keys(obj).forEach(key => {
    // Skip internal mongoose/mongo fields
    if (key.startsWith('$') || key === '__v' || key === '__t') return;

    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    // Handle null/undefined
    if (value === null || value === undefined) {
      result[fullKey] = '';
      return;
    }

    // Handle Buffer - skip or convert (never show Buffer in export)
    if (isBuffer(value)) {
      result[fullKey] = '';
      return;
    }

    // Handle ObjectId
    if (isObjectId(value)) {
      result[fullKey] = value.toString();
      return;
    }

    // Handle Date
    if (value instanceof Date) {
      result[fullKey] = value.toISOString();
      return;
    }

    // Handle Array
    if (Array.isArray(value)) {
      // Empty arrays
      if (value.length === 0) {
        result[fullKey] = '';
        return;
      }

      // Check for special ingredient arrays (recipe ingredients)
      if (key === 'ingredients' && value[0] && typeof value[0] === 'object' && 'name' in value[0]) {
        result[fullKey] = value.map(formatIngredient).filter(v => v).join('; ');
        return;
      }

      // For arrays, join values with semicolon
      const formatted = value.map(item => {
        if (item === null || item === undefined) return '';
        if (isBuffer(item)) return '';
        if (isObjectId(item)) return item.toString();
        if (typeof item === 'object') {
          // Try to get display value from object
          if (item.name && item.quantity && item.unit) {
            return formatIngredient(item);
          }
          if (item.name) return item.name;
          if (item.firstName && item.lastName) return `${item.firstName} ${item.lastName}`;
          if (item.firstName) return item.firstName;
          if (item.title) return item.title;
          if (item.email) return item.email;
          if (item._id) return item._id.toString();
          // For complex objects, try to create readable representation
          try {
            // Try common patterns
            const keys = Object.keys(item).filter(k => !k.startsWith('_'));
            if (keys.length <= 3) {
              return keys.map(k => `${k}: ${item[k]}`).join(', ');
            }
            return JSON.stringify(item);
          } catch {
            return '';
          }
        }
        return String(item);
      }).filter(v => v !== '');
      result[fullKey] = formatted.join('; ');
      return;
    }

    // Handle nested object (but not too deep)
    if (typeof value === 'object') {
      // Check if it's a populated reference (has _id and other fields)
      if (value._id) {
        // Try to get display value
        if (value.name) {
          result[fullKey] = value.name;
        } else if (value.firstName && value.lastName) {
          result[fullKey] = `${value.firstName} ${value.lastName}`;
        } else if (value.firstName) {
          result[fullKey] = value.firstName;
        } else if (value.email) {
          result[fullKey] = value.email;
        } else if (value.title) {
          result[fullKey] = value.title;
        } else if (value.displayId) {
          result[fullKey] = value.displayId;
        } else {
          result[fullKey] = value._id.toString();
        }
        return;
      }

      // For simple nested objects, flatten one level
      if (prefix.split('.').length < 3) {
        flattenObject(value, fullKey, result);
      } else {
        // Too deep, create readable representation
        try {
          const keys = Object.keys(value).filter(k => !k.startsWith('_'));
          if (keys.length <= 3) {
            result[fullKey] = keys.map(k => `${k}: ${value[k]}`).join(', ');
          } else {
            result[fullKey] = JSON.stringify(value);
          }
        } catch {
          result[fullKey] = '';
        }
      }
      return;
    }

    // Handle primitives
    if (typeof value === 'boolean') {
      result[fullKey] = value ? 'Yes' : 'No';
    } else {
      result[fullKey] = String(value);
    }
  });

  return result;
}

/**
 * Convert data to CSV with proper headers and value formatting
 */
function convertToCSV(data: any[], fields: string[]): string {
  if (!data || data.length === 0) return '';

  // Generate clean header names from field paths
  const fieldMappings = fields.map(field => ({
    field,
    header: field === '_id' ? '_id' : (generateHeaderFromField(field) || field)
  }));

  // Header row with clean names
  const header = fieldMappings.map(f => escapeCSV(f.header, ',', '"', true)).join(',');

  // Data rows with proper value formatting
  const rows = data.map(item => {
    // Flatten the item first
    const flattened = flattenObject(item);

    return fieldMappings.map(({ field }) => {
      // Try direct field access first
      let value = flattened[field];

      // If not found, try getting from original item
      if (value === undefined) {
        value = getNestedValue(item, field);
      }

      const formatted = formatValueForCSV(value);
      return escapeCSV(formatted, ',', '"', false);
    }).join(',');
  });

  // Add BOM for Excel compatibility
  return '\ufeff' + [header, ...rows].join('\r\n');
}

/**
 * Convert pre-flattened data to CSV (more efficient)
 */
function convertToCSVFromFlattened(flattenedData: Record<string, any>[], fields: string[]): string {
  if (!flattenedData || flattenedData.length === 0) return '';

  // Generate clean header names from field paths
  const fieldMappings = fields.map(field => ({
    field,
    header: field === '_id' ? '_id' : (generateHeaderFromField(field) || field)
  }));

  // Header row with clean names
  const header = fieldMappings.map(f => escapeCSV(f.header, ',', '"', true)).join(',');

  // Data rows - data is already flattened
  const rows = flattenedData.map(item => {
    return fieldMappings.map(({ field }) => {
      const value = item[field] ?? '';
      // Value is already formatted from flattenObject, just escape it
      return escapeCSV(String(value), ',', '"', false);
    }).join(',');
  });

  // Add BOM for Excel compatibility
  return '\ufeff' + [header, ...rows].join('\r\n');
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : null;
  }, obj);
}

export async function GET(request: NextRequest) {
  try {
    // Auth check - admin only
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const modelName = searchParams.get('model');
    const format = searchParams.get('format') || 'csv';
    const download = searchParams.get('download') === 'true';

    await connectDB();

    // If no model specified, return list of available models
    if (!modelName) {
      // Get ALL models, not just importable ones
      const allModels = modelRegistry.getAll();

      // Get counts for each model
      const modelsWithCounts = await Promise.all(
        allModels.map(async (m) => {
          let count = 0;
          try {
            count = await m.model.countDocuments();
          } catch (e) {
            console.error(`Error counting ${m.name}:`, e);
          }
          return {
            name: m.name,
            displayName: m.displayName,
            description: m.description,
            fieldCount: m.fields.filter(f =>
              !f.path.startsWith('_') &&
              f.path !== 'createdAt' &&
              f.path !== 'updatedAt'
            ).length,
            requiredFields: m.requiredFields,
            documentCount: count,
            fields: m.fields.filter(f => !f.path.startsWith('_')).map(f => ({
              path: f.path,
              type: f.type,
              required: f.required
            }))
          };
        })
      );

      return NextResponse.json({
        success: true,
        models: modelsWithCounts
      });
    }

    // Get the model
    const registeredModel = modelRegistry.get(modelName);
    if (!registeredModel) {
      return NextResponse.json(
        { success: false, error: 'Model not found' },
        { status: 404 }
      );
    }

    // Fetch all data from the model - get COMPLETE data with all fields
    const data = await registeredModel.model.find({}).lean();

    if (!data || data.length === 0) {
      // Return empty file for download instead of JSON message
      if (download) {
        if (format === 'json') {
          return new NextResponse('[]', {
            headers: {
              'Content-Type': 'application/json',
              'Content-Disposition': `attachment; filename="${modelName}_export_${new Date().toISOString().split('T')[0]}.json"`
            }
          });
        } else {
          return new NextResponse('', {
            headers: {
              'Content-Type': 'text/csv; charset=utf-8',
              'Content-Disposition': `attachment; filename="${modelName}_export_${new Date().toISOString().split('T')[0]}.csv"`
            }
          });
        }
      }
      return NextResponse.json({
        success: true,
        modelName,
        count: 0,
        message: 'No data found for this model'
      });
    }

    // For JSON export - return COMPLETE raw data as-is (all fields included)
    if (download && format === 'json') {
      const jsonContent = JSON.stringify(data, null, 2);
      return new NextResponse(jsonContent, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${modelName}_export_${new Date().toISOString().split('T')[0]}.json"`
        }
      });
    }

    // For CSV export - flatten all documents and extract unique field paths
    const allFieldPaths = new Set<string>();
    const flattenedData: Record<string, any>[] = [];

    // Flatten each document and collect all field paths
    data.forEach(doc => {
      const flattened = flattenObject(doc);
      flattenedData.push(flattened);
      Object.keys(flattened).forEach(key => {
        // Skip internal fields
        if (!key.startsWith('$') && !key.startsWith('__')) {
          allFieldPaths.add(key);
        }
      });
    });

    // Convert to sorted array, with _id first, then common fields, then rest alphabetically
    const priorityFields = ['_id', 'displayId', 'firstName', 'lastName', 'name', 'email', 'phone', 'role', 'status'];
    const fields = Array.from(allFieldPaths).sort((a, b) => {
      const aIndex = priorityFields.indexOf(a);
      const bIndex = priorityFields.indexOf(b);

      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;

      // createdAt and updatedAt at the end
      if (a === 'createdAt' || a === 'updatedAt') return 1;
      if (b === 'createdAt' || b === 'updatedAt') return -1;

      return a.localeCompare(b);
    });

    if (download) {
      // Use flattened data for CSV generation
      const csvContent = convertToCSVFromFlattened(flattenedData, fields);
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${modelName}_export_${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }

    // Return data preview
    return NextResponse.json({
      success: true,
      modelName,
      displayName: registeredModel.displayName,
      count: data.length,
      fields,
      preview: data.slice(0, 10) // First 10 records as preview
    });

  } catch (error: any) {
    console.error('Data export error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Server error',
        message: error.message
      },
      { status: 500 }
    );
  }
}
