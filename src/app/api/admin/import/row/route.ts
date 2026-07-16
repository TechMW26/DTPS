/**
 * API Route: Data Import - Update Row
 * PATCH /api/admin/import/row
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { dataImportService } from '@/lib/import';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest) {
  try {
    // Auth check - admin only
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { sessionId, modelName, rowIndex, data } = body;

    console.log(`[Row Update] Received update for session: ${sessionId}, model: ${modelName}, row: ${rowIndex}`);

    if (!sessionId || !modelName || rowIndex === undefined || !data) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields', details: { sessionId, modelName, rowIndex, hasData: !!data } },
        { status: 400 }
      );
    }

    // Update the row
    const result = await dataImportService.updateRow(
      sessionId,
      modelName,
      rowIndex,
      data
    );

    if (!result.success) {
      console.error(`[Row Update] Failed to update row: ${sessionId}/${modelName}/${rowIndex}`);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to update row',
          details: {
            sessionId,
            modelName,
            rowIndex,
            reason: 'Row not found in session or validation failed'
          }
        },
        { status: 400 }
      );
    }

    console.log(`[Row Update] Successfully updated row ${rowIndex} in session ${sessionId}`);

    return NextResponse.json({
      success: true,
      row: result.row,
      sessionCanSave: result.sessionCanSave
    });

  } catch (error: any) {
    console.error('Import row update error:', error);
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

export async function DELETE(request: NextRequest) {
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
    const sessionId = searchParams.get('sessionId');
    const modelName = searchParams.get('modelName');
    const rowIndex = searchParams.get('rowIndex');

    if (!sessionId || !rowIndex) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    let result;
    if (modelName) {
      // Remove from model group
      result = dataImportService.removeRow(
        sessionId,
        modelName,
        parseInt(rowIndex)
      );
    } else {
      // Remove from unmatched
      result = dataImportService.removeUnmatchedRow(
        sessionId,
        parseInt(rowIndex)
      );
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: 'Failed to remove row' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      sessionCanSave: result.sessionCanSave
    });

  } catch (error: any) {
    console.error('Import row delete error:', error);
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
