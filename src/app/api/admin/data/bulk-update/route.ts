/**
 * API Route: Bulk Update Records
 * PUT /api/admin/data/bulk-update - Update multiple records by _id
 * 
 * Accepts an array of records, each must have _id field
 * Updates fields based on the data provided in each record
 * For Recipe model: tracks update history using _id-based updates
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import { modelRegistry } from '@/lib/import';
import mongoose from 'mongoose';

export const runtime = 'nodejs';

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
      // Handle various Python patterns:
      // 1. {'key': 'value'} -> {"key": "value"}
      // 2. 'key': value -> "key": value
      // 3. None -> null
      // 4. True/False -> true/false

      let jsonStr = trimmed
        // Replace single quotes around keys and string values
        .replace(/'/g, '"')
        // Fix numbers that got quoted (e.g., "90.0" should stay as number)
        .replace(/"(\d+\.?\d*)"/g, '$1')
        // Handle Python None
        .replace(/: None/g, ': null')
        .replace(/: True/g, ': true')
        .replace(/: False/g, ': false');

      const parsed = JSON.parse(jsonStr);
      return parsed;
    } catch (e) {
      // If parsing fails, try a more aggressive approach
      try {
        // Use Function constructor to safely evaluate Python-like syntax
        const sanitized = trimmed
          .replace(/'/g, '"')
          .replace(/None/g, 'null')
          .replace(/True/g, 'true')
          .replace(/False/g, 'false');
        return JSON.parse(sanitized);
      } catch (e2) {
        // Return original if all parsing fails
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

function normalizeFieldKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeObjectIdInput(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'object') {
    const maybeOid = (value as { $oid?: unknown }).$oid;
    if (typeof maybeOid === 'string' && mongoose.Types.ObjectId.isValid(maybeOid)) {
      return maybeOid;
    }
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (mongoose.Types.ObjectId.isValid(raw)) {
    return raw;
  }

  const wrappedObjectIdMatch = raw.match(/ObjectId\((['"]?)([a-fA-F0-9]{24})\1\)/i);
  if (wrappedObjectIdMatch && mongoose.Types.ObjectId.isValid(wrappedObjectIdMatch[2])) {
    return wrappedObjectIdMatch[2];
  }

  return null;
}

function parseBooleanLike(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;

  return null;
}

interface UpdateRecord {
  _id?: string;
  [key: string]: any;
}

interface UpdateError {
  id: string;
  error: string;
  errorDetails?: string;
  errorCode?: string;
  _id?: string;
}

export async function PUT(request: NextRequest) {
  try {
    // Auth check
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { modelName, records, reason } = body as { modelName: string; records: UpdateRecord[]; reason?: string };

    // Validation
    if (!modelName) {
      return NextResponse.json(
        { success: false, error: 'Model name is required' },
        { status: 400 }
      );
    }

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

    // Get the registered model
    const registeredModel = modelRegistry.get(modelName);
    if (!registeredModel) {
      return NextResponse.json(
        { success: false, error: 'Model not found' },
        { status: 404 }
      );
    }

    const Model = registeredModel.model;
    const schemaFields = registeredModel.fields.map(f => f.path);
    const schemaFieldInfoMap = new Map(registeredModel.fields.map((f) => [f.path, f]));
    const schemaFieldCaseMap = new Map<string, string>();
    const schemaFieldNormalizedMap = new Map<string, string>();
    const isUnifiedPaymentModel = modelName.toLowerCase() === 'unifiedpayment';
    const schemaFieldAliasMap = new Map<string, string>();

    if (isUnifiedPaymentModel) {
      // Defensive aliases for spreadsheet-style headers.
      schemaFieldAliasMap.set('daysused', 'daysUsed');
      schemaFieldAliasMap.set('remainingdays', 'remainingDays');
      schemaFieldAliasMap.set('extendeddaysused', 'extendedDaysUsed');
      schemaFieldAliasMap.set('durationdays', 'durationDays');
    }

    for (const schemaField of schemaFields) {
      const lower = schemaField.toLowerCase();
      if (!schemaFieldCaseMap.has(lower)) {
        schemaFieldCaseMap.set(lower, schemaField);
      }

      const normalized = normalizeFieldKey(schemaField);
      if (normalized && !schemaFieldNormalizedMap.has(normalized)) {
        schemaFieldNormalizedMap.set(normalized, schemaField);
      }
    }

    const resolveSchemaField = (incomingKey: string): string | null => {
      const trimmedKey = incomingKey.trim();
      if (!trimmedKey) return null;

      const exactMatch = schemaFieldCaseMap.get(trimmedKey.toLowerCase());
      if (exactMatch) return exactMatch;

      const normalizedKey = normalizeFieldKey(trimmedKey);
      const normalizedMatch = schemaFieldNormalizedMap.get(normalizedKey);
      if (normalizedMatch) return normalizedMatch;

      const aliasedMatch = schemaFieldAliasMap.get(normalizedKey);
      if (aliasedMatch && schemaFieldInfoMap.has(aliasedMatch)) {
        return aliasedMatch;
      }

      return null;
    };

    const normalizeValueForField = (rawValue: unknown, schemaField: string): { shouldSet: boolean; value?: any } => {
      const fieldInfo = schemaFieldInfoMap.get(schemaField);

      if (rawValue === '' || rawValue === null || rawValue === 'null') {
        return { shouldSet: true, value: null };
      }

      let normalizedValue: any = rawValue;
      if (typeof normalizedValue === 'string') {
        normalizedValue = normalizedValue.trim();
      }

      if (typeof normalizedValue === 'string') {
        const bool = parseBooleanLike(normalizedValue);
        if (bool !== null && (fieldInfo?.type === 'Boolean' || normalizedValue === 'true' || normalizedValue === 'false')) {
          return { shouldSet: true, value: bool };
        }
      }

      const isObjectIdField = Boolean(fieldInfo?.ref) || fieldInfo?.type === 'ObjectId';
      if (isObjectIdField) {
        const objectId = normalizeObjectIdInput(normalizedValue);
        if (!objectId) {
          return { shouldSet: false };
        }
        return { shouldSet: true, value: objectId };
      }

      if ((fieldInfo?.isArray || /^Array</.test(fieldInfo?.type || '')) && typeof normalizedValue === 'string') {
        const parsedArray = parsePythonStyleArray(normalizedValue);
        if (Array.isArray(parsedArray)) {
          return { shouldSet: true, value: parsedArray };
        }
        if (normalizedValue.includes(';')) {
          const splitValues = normalizedValue
            .split(';')
            .map((item) => item.trim())
            .filter(Boolean);
          return { shouldSet: true, value: splitValues };
        }
      }

      if (fieldInfo?.type === 'Date' && typeof normalizedValue === 'string') {
        const parsedDate = new Date(normalizedValue);
        if (Number.isNaN(parsedDate.getTime())) {
          return { shouldSet: false };
        }
        return { shouldSet: true, value: parsedDate };
      }

      if (fieldInfo?.type === 'Number' && typeof normalizedValue === 'string') {
        const compactValue = normalizedValue.replace(/,/g, '').trim();
        const parsedNumber = Number(compactValue);
        if (!Number.isNaN(parsedNumber)) {
          return { shouldSet: true, value: parsedNumber };
        }

        // Accept friendly strings like "64 days" or "used: 64" for numeric fields.
        const extractedNumberMatch = compactValue.match(/-?\d+(?:\.\d+)?/);
        if (extractedNumberMatch) {
          const extractedNumber = Number(extractedNumberMatch[0]);
          if (!Number.isNaN(extractedNumber)) {
            return { shouldSet: true, value: extractedNumber };
          }
        }

        return { shouldSet: false };
      }

      if ((fieldInfo?.isNested || fieldInfo?.type === 'Mixed') && typeof normalizedValue === 'string') {
        const parsedObject = parsePythonStyleArray(normalizedValue);
        if (parsedObject !== normalizedValue) {
          return { shouldSet: true, value: parsedObject };
        }
      }

      if (typeof normalizedValue === 'string') {
        const parsedValue = parsePythonStyleArray(normalizedValue);
        return { shouldSet: true, value: parsedValue };
      }

      return { shouldSet: true, value: normalizedValue };
    };
    const isRecipeModel = modelName.toLowerCase() === 'recipe';

    // Process updates
    let updatedCount = 0;
    let failedCount = 0;
    let noChangesCount = 0;
    const errors: UpdateError[] = [];
    const updateResults: any[] = [];

    // For Recipe model, process individually to track changes
    if (isRecipeModel) {
      for (const record of records) {
        const { _id, ...updateData } = record;
        const normalizedRecordId = normalizeObjectIdInput(_id);
        const identifier = normalizedRecordId || String(_id || 'unknown');

        try {
          // _id is the only supported identifier for bulk updates
          if (!normalizedRecordId) {
            errors.push({
              id: String(identifier),
              error: 'Invalid ObjectId format',
              errorCode: 'INVALID_OBJECT_ID',
              _id: String(_id || '') || undefined
            });
            failedCount++;
            continue;
          }

          const recipe = await Model.findById(normalizedRecordId);

          if (!recipe) {
            errors.push({
              id: String(identifier),
              error: 'Record not found with this _id',
              errorCode: 'RECIPE_NOT_FOUND',
              _id: normalizedRecordId
            });
            failedCount++;
            continue;
          }

          // Track changes for update history
          const changedFields: any[] = [];
          const cleanedData: Record<string, any> = {};

          for (const [key, value] of Object.entries(updateData)) {
            if (key.startsWith('_') || key === 'createdAt' || key === '__v' || key === 'updates') continue;

            const schemaField = resolveSchemaField(key);
            if (!schemaField) continue;

            const oldValue = (recipe as any)[schemaField];
            const normalized = normalizeValueForField(value, schemaField);
            if (!normalized.shouldSet) continue;
            const newValue = normalized.value;

            // Only track if value changed
            if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
              changedFields.push({
                fieldName: schemaField,
                oldValue: oldValue,
                newValue: newValue,
                timestamp: new Date()
              });
              cleanedData[schemaField] = newValue;
            }
          }

          if (Object.keys(cleanedData).length === 0) {
            updateResults.push({ id: identifier, status: 'no_changes' });
            noChangesCount++;
            continue;
          }

          // Add update record with change tracking
          const updateRecord = {
            changedFields,
            updatedBy: new mongoose.Types.ObjectId(session.user.id),
            reason: reason || 'Bulk update via admin data',
            timestamp: new Date(),
            ...(isRecipeModel && {
              recipeIdentifiers: {
                _id: String(recipe._id)
              }
            })
          };

          const existingUpdates = (recipe.updates as any) || [];
          cleanedData.updates = [...existingUpdates, updateRecord];
          cleanedData.updatedAt = new Date();

          const updated = await Model.findByIdAndUpdate(
            recipe._id,
            { $set: cleanedData },
            { new: true }
          );

          const lastUpdate = updated?.updates?.[updated.updates.length - 1];
          updateResults.push({
            id: identifier,
            _id: String(updated?._id),
            status: 'success',
            updateId: lastUpdate?.updateId,
            changedFields: changedFields.map((f: any) => f.fieldName)
          });
          updatedCount++;

        } catch (error: any) {
          errors.push({
            id: String(identifier),
            error: 'Update failed',
            errorDetails: error.message || 'Unknown error',
            errorCode: error.code || 'UNKNOWN_ERROR',
            _id: normalizedRecordId || String(_id || '') || undefined
          });
          failedCount++;
        }
      }
    } else {
      // Use bulk operations for non-Recipe models
      const bulkOps = [];

      for (const record of records) {
        const { _id, ...updateData } = record;
        const normalizedRecordId = normalizeObjectIdInput(_id);
        const identifier = normalizedRecordId || String(_id || 'unknown');

        // For non-Recipe models, require valid ObjectId
        if (!normalizedRecordId) {
          errors.push({ id: identifier || 'unknown', error: 'Invalid ObjectId format' });
          failedCount++;
          continue;
        }

        // Clean update data - only include fields that exist in schema
        const cleanedData: Record<string, any> = {};
        for (const [key, value] of Object.entries(updateData)) {
          if (key.startsWith('_') || key === 'createdAt' || key === '__v') continue;

          const schemaField = resolveSchemaField(key);

          if (schemaField) {
            const normalized = normalizeValueForField(value, schemaField);
            if (!normalized.shouldSet) continue;
            cleanedData[schemaField] = normalized.value;
          }
        }

        if (Object.keys(cleanedData).length === 0) {
          errors.push({ id: normalizedRecordId, error: 'No valid fields to update' });
          failedCount++;
          continue;
        }

        if (isUnifiedPaymentModel && normalizedRecordId) {
          const hasDaysUsed = Object.prototype.hasOwnProperty.call(cleanedData, 'daysUsed');
          const hasRemainingDays = Object.prototype.hasOwnProperty.call(cleanedData, 'remainingDays');
          const hasDurationDays = Object.prototype.hasOwnProperty.call(cleanedData, 'durationDays');

          const toNumber = (value: unknown): number | null => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : null;
          };

          const existingRecord = await Model.findById(normalizedRecordId)
            .select('durationDays daysUsed remainingDays')
            .lean() as { durationDays?: number; daysUsed?: number; remainingDays?: number } | null;

          let durationDaysForCalc: number | null = hasDurationDays ? toNumber(cleanedData.durationDays) : null;

          if (durationDaysForCalc === null && typeof existingRecord?.durationDays === 'number') {
            durationDaysForCalc = existingRecord.durationDays;
          }

          const daysUsedNum = toNumber(cleanedData.daysUsed);
          const remainingDaysNum = toNumber(cleanedData.remainingDays);
          const existingDaysUsed = toNumber(existingRecord?.daysUsed);
          const existingRemainingDays = toNumber(existingRecord?.remainingDays);

          // Keep plan day counters consistent when only remainingDays is provided in upload.
          if (hasRemainingDays && !hasDaysUsed && durationDaysForCalc !== null && remainingDaysNum !== null) {
            cleanedData.remainingDays = Math.max(0, remainingDaysNum);
            cleanedData.daysUsed = Math.max(0, durationDaysForCalc - cleanedData.remainingDays);
          }

          // Keep plan day counters consistent when only daysUsed is provided in upload.
          if (hasDaysUsed && !hasRemainingDays && durationDaysForCalc !== null && daysUsedNum !== null) {
            cleanedData.daysUsed = Math.max(0, daysUsedNum);
            cleanedData.remainingDays = Math.max(0, durationDaysForCalc - cleanedData.daysUsed);
          }

          // If both are provided, infer which side changed from existing record.
          if (hasDaysUsed && hasRemainingDays && durationDaysForCalc !== null && daysUsedNum !== null && remainingDaysNum !== null) {
            const remainingChanged = existingRemainingDays !== null && remainingDaysNum !== existingRemainingDays;
            const daysUsedChanged = existingDaysUsed !== null && daysUsedNum !== existingDaysUsed;

            if (remainingChanged && !daysUsedChanged) {
              cleanedData.remainingDays = Math.max(0, remainingDaysNum);
              cleanedData.daysUsed = Math.max(0, durationDaysForCalc - cleanedData.remainingDays);
            } else if (daysUsedChanged && !remainingChanged) {
              cleanedData.daysUsed = Math.max(0, daysUsedNum);
              cleanedData.remainingDays = Math.max(0, durationDaysForCalc - cleanedData.daysUsed);
            }
          }
        }

        cleanedData.updatedAt = new Date();

        bulkOps.push({
          updateOne: {
            filter: { _id: new mongoose.Types.ObjectId(normalizedRecordId) },
            update: { $set: cleanedData }
          }
        });
      }

      // Execute bulk operations
      if (bulkOps.length > 0) {
        try {
          const result = await Model.bulkWrite(bulkOps, { ordered: false });
          updatedCount = result.modifiedCount;

          if (result.matchedCount < bulkOps.length) {
            const notFoundCount = bulkOps.length - result.matchedCount;
            failedCount += notFoundCount;
            errors.push({
              id: 'multiple',
              error: `${notFoundCount} records not found in database`
            });
          }
        } catch (bulkError: any) {
          if (bulkError.writeErrors) {
            for (const writeError of bulkError.writeErrors) {
              const failedId = normalizeObjectIdInput(records[writeError.index]?._id) || String(records[writeError.index]?._id || 'unknown');
              errors.push({ id: failedId, error: writeError.errmsg || 'Write error' });
              failedCount++;
            }
            updatedCount = bulkError.result?.nModified || 0;
          } else {
            throw bulkError;
          }
        }
      }
    }

    console.log(`[BulkUpdate] Model: ${modelName}, Updated: ${updatedCount}, Failed: ${failedCount}, NoChanges: ${noChangesCount}`);

    return NextResponse.json({
      success: true,
      message: `Bulk update completed`,
      modelName,
      updated: updatedCount,
      failed: failedCount,
      noChanges: noChangesCount,
      summary: {
        total: records.length,
        updated: updatedCount,
        failed: failedCount,
        noChanges: noChangesCount
      },
      ...(isRecipeModel && { updateResults: updateResults.slice(0, 100) }),
      errors: errors.slice(0, 50) // Limit errors to prevent huge response
    });

  } catch (error: any) {
    console.error('[BulkUpdate] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Bulk update failed',
        updated: 0,
        failed: 0,
        errors: [{ id: 'unknown', error: error.message || 'Server error' }]
      },
      { status: 500 }
    );
  }
}

// GET - Get bulk update template/info for a model
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const modelName = searchParams.get('model');

    if (!modelName) {
      return NextResponse.json(
        { success: false, error: 'Model name is required' },
        { status: 400 }
      );
    }

    await connectDB();

    const registeredModel = modelRegistry.get(modelName);
    if (!registeredModel) {
      return NextResponse.json(
        { success: false, error: 'Model not found' },
        { status: 404 }
      );
    }

    const isRecipeModel = modelName.toLowerCase() === 'recipe';

    // Get fields for template
    const fields = registeredModel.fields
      .filter(f => !f.path.startsWith('_') && f.path !== 'createdAt' && f.path !== '__v')
      .map(f => ({
        name: f.path,
        type: f.type,
        required: f.required
      }));

    return NextResponse.json({
      success: true,
      modelName,
      displayName: registeredModel.displayName,
      fields,
      requiredIdField: '_id',
      supportsUuid: false,
      instructions: isRecipeModel
        ? 'Upload a file with _id column and any fields you want to update. Recipe updates are tracked with unique updateIds for audit purposes.'
        : 'Upload a file with _id column and any fields you want to update. Only matching records will be updated.',
      ...(isRecipeModel && {
        recipeNotes: [
          'Use MongoDB _id to identify recipes for updates',
          'Each update generates a unique updateId for tracking',
          'All field changes are recorded in update history',
          'Include a "reason" field in your request to document why changes were made'
        ]
      })
    });

  } catch (error: any) {
    console.error('[BulkUpdate] GET Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to get template info' },
      { status: 500 }
    );
  }
}
