/**
 * API Route: Data Import - Upload and Parse
 * POST /api/admin/import/upload
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { fileParser, dataImportService, validationEngine } from '@/lib/import';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    // Auth check - admin only
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get the form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const forceModel = formData.get('forceModel') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'File size exceeds 10MB limit' },
        { status: 400 }
      );
    }

    // Create import session
    const importSession = dataImportService.createSession(file.name);

    // Parse the file
    const arrayBuffer = await file.arrayBuffer();
    const parseResult = await fileParser.parse(arrayBuffer, file.name);

    if (!parseResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to parse file',
          details: parseResult.errors 
        },
        { status: 400 }
      );
    }

    console.log(`[Import Upload] Parsed ${parseResult.totalRows} rows from ${file.name}`);
    if (!parseResult.success) {
      console.log(`[Import Upload] Parse errors: ${parseResult.errors.join(', ')}`);
    } else {
      console.log(`[Import Upload] Headers: ${parseResult.headers.slice(0, 10).join(', ')}${parseResult.headers.length > 10 ? '...' : ''}`);
    }

    // Validate all rows
    const validationResult = await validationEngine.validateAll(
      parseResult.rows,
      forceModel || undefined
    );

    console.log(`[Import Upload] Validation complete: ${validationResult.validRows} valid, ${validationResult.invalidRows} invalid, ${validationResult.unmatchedRows} unmatched`);
    console.log(`[Import Upload] Model groups: ${validationResult.modelGroups.map(g => `${g.modelName}:${g.validCount}/${g.totalCount}`).join(', ')}`);
    if (validationResult.unmatchedRows > 0) {
      console.log(`[Import Upload] Unmatched rows: ${validationResult.unmatchedData.map(u => `row${u.rowIndex}`).join(', ')}`);
    }

    // Update session with validation results
    dataImportService.updateSessionWithValidation(
      importSession.id,
      {
        modelGroups: validationResult.modelGroups.map(g => ({
          modelName: g.modelName,
          displayName: g.displayName,
          rows: g.rows,
          validCount: g.validCount,
          invalidCount: g.invalidCount
        })),
        unmatchedData: validationResult.unmatchedData,
        canSave: validationResult.canSave
      }
    );

    console.log(`[Import Upload] Session ${importSession.id} updated with validation, canSave: ${validationResult.canSave}`);

    return NextResponse.json({
      success: true,
      sessionId: importSession.id,
      fileName: file.name,
      fileType: parseResult.fileType,
      totalRows: parseResult.totalRows,
      headers: parseResult.headers,
      validation: {
        validRows: validationResult.validRows,
        invalidRows: validationResult.invalidRows,
        unmatchedRows: validationResult.unmatchedRows,
        canSave: validationResult.canSave
      },
      modelGroups: validationResult.modelGroups.map(g => ({
        modelName: g.modelName,
        displayName: g.displayName,
        validCount: g.validCount,
        invalidCount: g.invalidCount,
        totalCount: g.totalCount,
        rows: g.rows
      })),
      unmatchedData: validationResult.unmatchedData,
      allErrors: validationResult.allErrors
    });

  } catch (error: any) {
    console.error('Import upload error:', error);
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
