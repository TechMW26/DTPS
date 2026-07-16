/**
 * API Route: Bulk Update Recipes by _id
 * PUT /api/admin/recipes/bulk-update - Update recipes using _id identifier only
 * POST /api/admin/recipes/bulk-update - Upload CSV file for bulk updates using _id
 * 
 * IMPORTANT: _id is the ONLY accepted identifier for recipe lookups.
 * - Updates are identified strictly by _id
 * - Existing recipes are updated via $set operations
 * - No new recipes are created during update operations
 * - Requests without valid _id are skipped with status 'cancelled'
 * - Arrays are replaced completely (not appended)
 * - All updates use MongoDB $set operator for consistency
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import Recipe from '@/lib/db/models/Recipe';
import mongoose from 'mongoose';
import { clearCacheByTag } from '@/lib/api/utils';

export const runtime = 'nodejs';

/**
 * Parse servings string to extract numeric value
 * Examples:
 *   "2.5 SMALL BOWL (500 gm/ml)" -> 2.5
 *   "1/2 TSP ( 2.5 gm/ml )" -> 0.5
 */
function parseServingsToNumber(servingsStr: string | number): number {
  if (typeof servingsStr === 'number') return servingsStr;

  const str = String(servingsStr).trim();
  const match = str.match(/^[\s]*([0-9]+(?:\/[0-9]+)?(?:\.[0-9]+)?)/);
  if (match && match[1]) {
    const qStr = match[1];
    if (qStr.includes('/')) {
      const [numerator, denominator] = qStr.split('/').map(Number);
      if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
        return numerator / denominator;
      }
    } else {
      const num = parseFloat(qStr);
      if (!isNaN(num)) return num;
    }
  }
  return 1;
}

/**
 * Parse Python-style string arrays to proper JSON arrays
 * Handles strings like "[{'name': 'value', ...}]"
 */
function parsePythonStyleArray(value: any): any {
  if (typeof value !== 'string') return value;

  // Check if it looks like a Python-style array with single quotes
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return value;

  // Check if it contains Python-style single quotes for strings
  if (trimmed.includes("{'") || trimmed.includes("': '") || trimmed.includes("', '")) {
    try {
      // Replace Python-style quotes with JSON-style quotes
      let jsonStr = trimmed
        .replace(/'/g, '"')
        .replace(/"(\d+\.?\d*)"/g, '$1')
        .replace(/: None/g, ': null')
        .replace(/: True/g, ': true')
        .replace(/: False/g, ': false');

      const parsed = JSON.parse(jsonStr);
      return parsed;
    } catch (e) {
      try {
        const sanitized = trimmed
          .replace(/'/g, '"')
          .replace(/None/g, 'null')
          .replace(/True/g, 'true')
          .replace(/False/g, 'false');
        return JSON.parse(sanitized);
      } catch (e2) {
        console.error('Failed to parse Python-style array:', e2);
        return value;
      }
    }
  }

  // Try parsing as regular JSON
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

/**
 * Convert string boolean values to actual booleans
 */
function normalizeBoolean(value: any): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    return lower === 'true' || lower === '1' || lower === 'yes' || lower === 'on';
  }
  return Boolean(value);
}

/**
 * Normalize field values based on field type
 */
function normalizeFieldValue(field: string, value: any): any {
  // Boolean fields
  if (['isActive', 'isPublic', 'isPremium', 'isTemplate'].includes(field)) {
    return normalizeBoolean(value);
  }

  // Numeric fields
  if (['prepTime', 'cookTime', 'servings'].includes(field)) {
    if (typeof value === 'number') return value;

    // Extract numeric part from strings like "1.5 TSP ( 7.5 gm/ml )" or "1/2 TSP ( 2.5 gm/ml )"
    if (typeof value === 'string') {
      // Try to extract first number (decimal, integer, or fraction)
      // Match patterns like: 1.5, 2, 1/2, 3/4, etc.
      const match = value.match(/^[\s]*([0-9]+(?:\/[0-9]+)?(?:\.[0-9]+)?)/);
      if (match && match[1]) {
        let num: number;
        if (match[1].includes('/')) {
          // Handle fraction like "1/2" or "3/4"
          const [numerator, denominator] = match[1].split('/').map(Number);
          num = numerator / denominator;
        } else {
          num = parseFloat(match[1]);
        }
        return isNaN(num) ? null : num;
      }
      return null;
    }

    return null;
  }

  // Parse arrays if they are strings
  if (['ingredients', 'instructions', 'tags', 'dietaryRestrictions', 'allergens', 'medicalContraindications'].includes(field)) {
    let parsed = parsePythonStyleArray(value);

    // For ingredients, ensure quantity is a number
    if (field === 'ingredients' && Array.isArray(parsed)) {
      parsed = parsed.map((ing: any) => {
        if (typeof ing === 'object' && ing !== null) {
          return {
            name: ing.name || '',
            quantity: typeof ing.quantity === 'number' ? ing.quantity : parseFloat(String(ing.quantity)) || 1,
            unit: ing.unit || 'unit',
            remarks: ing.remarks || ''
          };
        }
        return ing;
      });
    }

    return parsed;
  }

  return value;
}

interface UpdateRecord {
  _id: string;
  [key: string]: any;
}

interface UpdateResult {
  _id: string;
  status: 'completed' | 'failed' | 'cancelled';
  message: string;
  errorDetails?: string;
  errorCode?: string;
  changedFields?: string[];
  changedFieldsCount?: number;
}

// Valid recipe fields that can be updated
const UPDATABLE_FIELDS = [
  'name', 'description', 'ingredients', 'instructions', 'prepTime', 'cookTime',
  'servings', 'nutrition', 'tags', 'dietaryRestrictions', 'allergens',
  'medicalContraindications', 'difficulty', 'image', 'images', 'video',
  'isPublic', 'isPremium', 'isActive', 'cuisine', 'category', 'tips', 'variations'
];

// Parse CSV content to array of records (_id required)
function parseCSV(csvContent: string): UpdateRecord[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have at least a header row and one data row');
  }

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  // Validate _id column exists (REQUIRED - only identifier allowed)
  const idIndex = headers.findIndex(h => h.toLowerCase() === '_id');

  if (idIndex === -1) {
    throw new Error('CSV must have an "_id" column to identify recipes for updating. This is the only supported identifier.');
  }

  const records: UpdateRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV line handling quoted values
    const values = parseCSVLine(line);

    if (values.length !== headers.length) {
      console.warn(`Row ${i + 1} has ${values.length} values but expected ${headers.length}`);
      continue;
    }

    const record: Partial<UpdateRecord> = {};
    let recordId: string | null = null;

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      let value = values[j];

      // Skip empty values
      if (value === '' || value === undefined) continue;

      // Extract and validate _id
      if (header.toLowerCase() === '_id') {
        recordId = value;
        record._id = value;
        continue;
      }

      // Store the final value (can be any type after parsing)
      let parsedValue: any = value;

      // Parse JSON arrays/objects
      if (typeof value === 'string' && ((value.startsWith('[') && value.endsWith(']')) ||
        (value.startsWith('{') && value.endsWith('}')))) {
        try {
          parsedValue = JSON.parse(value);
        } catch {
          // Keep as string if JSON parse fails
        }
      }

      // Parse booleans
      if (parsedValue === 'true') parsedValue = true;
      if (parsedValue === 'false') parsedValue = false;

      // Parse numbers for numeric fields
      if (['prepTime', 'cookTime', 'servings'].includes(header) && typeof parsedValue === 'string') {
        // Extract first number from strings like "1.5 TSP ( 7.5 gm/ml )" or "1/2 TSP ( 2.5 gm/ml )"
        const match = parsedValue.match(/^[\s]*([0-9]+(?:\/[0-9]+)?(?:\.[0-9]+)?)/);
        if (match && match[1]) {
          let numValue: number;
          if (match[1].includes('/')) {
            // Handle fraction like "1/2" or "3/4"
            const [numerator, denominator] = match[1].split('/').map(Number);
            numValue = numerator / denominator;
          } else {
            numValue = parseFloat(match[1]);
          }
          if (!isNaN(numValue)) parsedValue = numValue;
        }
      }

      record[header] = parsedValue;
    }

    // Validate record has _id
    if (recordId) {
      records.push(record as UpdateRecord);
    } else {
      console.warn(`Row ${i + 1} skipped: missing _id value`);
    }
  }

  return records;
}

// Parse a single CSV line handling quoted values
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

// PUT - Bulk update with JSON payload (_id only)
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userRole = ((session.user as any).role || '').toLowerCase();
    if (!['admin', 'dietitian', 'health_counselor'].includes(userRole)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { records, reason } = body as { records: UpdateRecord[]; reason?: string };

    if (!records || !Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Records array is required and must not be empty' },
        { status: 400 }
      );
    }

    // Validate all records have _id
    const invalidRecords = records.filter(r => !r._id);
    if (invalidRecords.length > 0) {
      return NextResponse.json(
        { success: false, error: `${invalidRecords.length} records missing required _id field` },
        { status: 400 }
      );
    }

    await connectDB();

    const results: UpdateResult[] = [];
    let completedCount = 0;
    let failedCount = 0;
    let cancelledCount = 0;

    for (const record of records) {
      const { _id, ...updateData } = record;
      const recordId = String(_id || 'unknown');

      try {
        // Find recipe by _id ONLY (single source of truth)
        if (!_id || !mongoose.Types.ObjectId.isValid(recordId)) {
          results.push({
            _id: recordId,
            status: 'cancelled',
            message: `Invalid _id format: ${recordId}`,
            errorCode: 'INVALID_OBJECT_ID'
          });
          cancelledCount++;
          continue;
        }

        const recipe = await Recipe.findById(recordId);

        if (!recipe) {
          results.push({
            _id: recordId,
            status: 'cancelled',
            message: `Recipe not found with _id: ${recordId}`,
            errorCode: 'ID_NOT_FOUND'
          });
          cancelledCount++;
          continue;
        }

        // Track changes
        const changedFields: string[] = [];
        const updatePayload: Record<string, any> = {};

        for (const [key, rawValue] of Object.entries(updateData)) {
          // Skip non-updatable fields
          if (!UPDATABLE_FIELDS.includes(key)) continue;

          const oldValue = (recipe as any)[key];

          // Parse and normalize field values
          let newValue = parsePythonStyleArray(rawValue);
          newValue = normalizeFieldValue(key, newValue);

          // Special handling for servings: extract number, keep full string
          if (key === 'servings' && rawValue !== undefined) {
            updatePayload['servings'] = parseServingsToNumber(rawValue);
            updatePayload['servingSize'] = typeof rawValue === 'string' ? rawValue.trim() : `${rawValue} serving${rawValue !== 1 ? 's' : ''}`;
            changedFields.push('servings', 'servingSize');
            continue;
          }

          // Only include if value actually changed
          if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            changedFields.push(key);
            updatePayload[key] = newValue;
          }
        }

        // If no changes detected, skip
        if (changedFields.length === 0) {
          results.push({
            _id: recordId,
            status: 'cancelled',
            message: 'No field changes detected',
            errorCode: 'NO_CHANGES'
          });
          cancelledCount++;
          continue;
        }

        // Add timestamp for tracking
        updatePayload.updatedAt = new Date();

        // Update recipe using $set (replaces fields completely, doesn't append)
        const updated = await Recipe.findByIdAndUpdate(
          recipe._id,
          { $set: updatePayload },
          { new: true, runValidators: true }
        );

        results.push({
          _id: String(updated?._id || recordId),
          status: 'completed',
          message: `Successfully updated ${changedFields.length} field(s)`,
          changedFields,
          changedFieldsCount: changedFields.length
        });
        completedCount++;

      } catch (error: any) {
        results.push({
          _id: recordId,
          status: 'failed',
          message: 'Update operation failed',
          errorDetails: error.message || 'Unknown error',
          errorCode: error.code || 'UPDATE_ERROR'
        });
        failedCount++;
      }
    }

    // Clear recipe cache for immediate reflection
    clearCacheByTag('recipes');

    return NextResponse.json({
      success: true,
      message: 'Bulk update operation completed',
      summary: {
        total: records.length,
        completed: completedCount,
        failed: failedCount,
        cancelled: cancelledCount
      },
      results
    });

  } catch (error: any) {
    console.error('[RecipeBulkUpdate] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Bulk update failed' },
      { status: 500 }
    );
  }
}

// POST - Bulk update with CSV file upload (_id only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userRole = ((session.user as any).role || '').toLowerCase();
    if (!['admin', 'dietitian', 'health_counselor'].includes(userRole)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const reason = formData.get('reason') as string || 'Bulk update via CSV';

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'CSV file is required' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.endsWith('.csv')) {
      return NextResponse.json(
        { success: false, error: 'Only CSV files are accepted' },
        { status: 400 }
      );
    }

    // Read and parse CSV
    const csvContent = await file.text();
    let records: UpdateRecord[];

    try {
      records = parseCSV(csvContent);
    } catch (parseError: any) {
      return NextResponse.json(
        { success: false, error: `CSV parse error: ${parseError.message}` },
        { status: 400 }
      );
    }

    if (records.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid records with _id found in CSV' },
        { status: 400 }
      );
    }

    await connectDB();

    const results: UpdateResult[] = [];
    let completedCount = 0;
    let failedCount = 0;
    let cancelledCount = 0;

    for (const record of records) {
      const { _id, ...updateData } = record;
      const recordId = String(_id || 'unknown');

      try {
        // Find recipe by _id ONLY (single source of truth)
        if (!_id || !mongoose.Types.ObjectId.isValid(recordId)) {
          results.push({
            _id: recordId,
            status: 'cancelled',
            message: `Invalid _id format: ${recordId}`,
            errorCode: 'INVALID_OBJECT_ID'
          });
          cancelledCount++;
          continue;
        }

        const recipe = await Recipe.findById(recordId);

        if (!recipe) {
          results.push({
            _id: recordId,
            status: 'cancelled',
            message: `Recipe not found with _id: ${recordId}`,
            errorCode: 'ID_NOT_FOUND'
          });
          cancelledCount++;
          continue;
        }

        // Track changes
        const changedFields: string[] = [];
        const updatePayload: Record<string, any> = {};

        for (const [key, rawValue] of Object.entries(updateData)) {
          if (!UPDATABLE_FIELDS.includes(key)) continue;

          const oldValue = (recipe as any)[key];

          // Parse and normalize field values
          let newValue = parsePythonStyleArray(rawValue);
          newValue = normalizeFieldValue(key, newValue);

          // Special handling for servings: extract number, keep full string
          if (key === 'servings' && rawValue !== undefined) {
            updatePayload['servings'] = parseServingsToNumber(rawValue);
            updatePayload['servingSize'] = typeof rawValue === 'string' ? rawValue.trim() : `${rawValue} serving${rawValue !== 1 ? 's' : ''}`;
            changedFields.push('servings', 'servingSize');
            continue;
          }

          // Only include if value actually changed
          if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            changedFields.push(key);
            updatePayload[key] = newValue;
          }
        }

        // If no changes detected, skip
        if (changedFields.length === 0) {
          results.push({
            _id: recordId,
            status: 'cancelled',
            message: 'No field changes detected',
            errorCode: 'NO_CHANGES'
          });
          cancelledCount++;
          continue;
        }

        // Add timestamp for tracking
        updatePayload.updatedAt = new Date();

        // Update recipe using $set (replaces fields completely, doesn't append)
        const updated = await Recipe.findByIdAndUpdate(
          recipe._id,
          { $set: updatePayload },
          { new: true, runValidators: true }
        );

        results.push({
          _id: String(updated?._id || recordId),
          status: 'completed',
          message: `Successfully updated ${changedFields.length} field(s)`,
          changedFields,
          changedFieldsCount: changedFields.length
        });
        completedCount++;

      } catch (error: any) {
        results.push({
          _id: recordId,
          status: 'failed',
          message: 'Update operation failed',
          errorDetails: error.message || 'Unknown error',
          errorCode: error.code || 'UPDATE_ERROR'
        });
        failedCount++;
      }
    }

    // Clear recipe cache for immediate reflection
    clearCacheByTag('recipes');

    return NextResponse.json({
      success: true,
      message: 'CSV bulk update operation completed',
      fileName: file.name,
      summary: {
        total: records.length,
        completed: completedCount,
        failed: failedCount,
        cancelled: cancelledCount
      },
      results
    });

  } catch (error: any) {
    console.error('[RecipeBulkUpdate CSV] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'CSV bulk update failed' },
      { status: 500 }
    );
  }
}

// GET - Get template info and sample CSV format
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format');

    if (format === 'csv') {
      // Return sample CSV template
      const csvHeader = '_id,name,description,prepTime,cookTime,servings,difficulty,isPublic,isPremium,tags';
      const csvSample = '65e6f0bb2f0b6a0012ab34cd,"Updated Recipe Name","Updated description",15,30,4,easy,true,false,"[""healthy"",""quick""]"';
      const csvContent = `${csvHeader}\n${csvSample}`;

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="recipe_bulk_update_template.csv"'
        }
      });
    }

    return NextResponse.json({
      success: true,
      instructions: 'Upload a CSV file with an "_id" column to identify recipes for updating.',
      requiredField: '_id (MongoDB ObjectId - used to locate recipes)',
      identificationMethod: '_id is the ONLY accepted identifier for recipe lookups',
      updateMode: 'Updates only - no new recipes are created',
      operationMode: '$set operations used to replace field values completely',
      updatableFields: UPDATABLE_FIELDS,
      sampleCSV: {
        headers: ['_id', 'name', 'description', 'prepTime', 'cookTime', 'difficulty', 'isPublic', 'tags'],
        sampleRow: ['65e6f0bb2f0b6a0012ab34cd', 'Updated Recipe Name', 'New description', '15', '30', 'easy', 'true', '["healthy","quick"]']
      },
      notes: [
        'Use "_id" column to identify the recipe to update (REQUIRED - only accepted identifier)',
        'Only include columns for fields you want to change',
        'Arrays (like tags, ingredients) should be JSON formatted',
        'Boolean values: use true/false or TRUE/FALSE or 1/0',
        'Numeric values: use standard numbers (no quotes)',
        'Records without _id will be skipped and logged',
        'If _id does not match any recipe, that row is marked as "cancelled"',
        'Updates reflect immediately across all dashboards and APIs',
        'Use $set operations - arrays are completely replaced (not appended)',
        'All updates include updatedAt timestamp'
      ],
      exampleRequests: {
        putMethod: {
          endpoint: 'PUT /api/admin/recipes/bulk-update',
          payload: {
            records: [
              { _id: '65e6f0bb2f0b6a0012ab34cd', name: 'Updated Name', prepTime: 20 },
              { _id: '65e6f0bb2f0b6a0012ab34ce', description: 'New description', isPublic: true }
            ],
            reason: 'Admin bulk update'
          }
        },
        postMethod: {
          endpoint: 'POST /api/admin/recipes/bulk-update',
          description: 'Upload CSV file with form-data',
          formData: {
            file: 'recipe_updates.csv',
            reason: 'Admin bulk update (optional)'
          }
        }
      },
      responseStatuses: {
        completed: 'Recipe successfully updated',
        cancelled: 'Update skipped - no recipe found with _id or no field changes',
        failed: 'Update operation encountered an error'
      }
    });

  } catch (error: any) {
    console.error('[RecipeBulkUpdate] GET Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to get template info' },
      { status: 500 }
    );
  }
}
