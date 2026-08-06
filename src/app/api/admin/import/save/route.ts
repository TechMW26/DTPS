/**
 * API Route: Data Import - Save
 * POST /api/admin/import/save
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { dataImportService } from '@/lib/import';

export const runtime = 'nodejs';
export const maxDuration = 120;

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

    const body = await request.json();
    const { sessionId, fallbackSession } = body;

    console.log(`[Import Save] ===== NEW SAVE REQUEST =====`);
    console.log(`[Import Save] Received sessionId: ${sessionId}`);
    console.log(`[Import Save] Request payload keys: ${Object.keys(body).join(', ')}`);
    if (fallbackSession?.modelGroups) {
      console.log(
        `[Import Save] Fallback payload summary: groups=${fallbackSession.modelGroups.length}, unmatched=${Array.isArray(fallbackSession.unmatchedData) ? fallbackSession.unmatchedData.length : 0}`
      );
    }

    if (!sessionId) {
      console.error(`[Import Save] No sessionId provided in request`);
      return NextResponse.json(
        { success: false, error: 'Session ID is required' },
        { status: 400 }
      );
    }

    // Get session
    let importSession = dataImportService.getSession(sessionId) ?? undefined;

    // Session may be missing after worker reload/restart. Restore from client payload if provided.
    if (!importSession && fallbackSession) {
      importSession = dataImportService.restoreSession(sessionId, fallbackSession) ?? undefined;
      if (importSession) {
        console.log(`[Import Save] Restored missing session "${sessionId}" from fallback payload`);
      }
    }

    if (!importSession) {
      console.error(`[Import Save] ❌ Session "${sessionId}" not found`);
      console.log(`[Import Save] Available sessions: ${Array.from(dataImportService.getAllSessions()).map(s => s.id).join(', ')}`);
      return NextResponse.json(
        {
          success: false,
          error: 'Import session not found',
          sessionId: sessionId,
          availableSessions: Array.from(dataImportService.getAllSessions()).map(s => ({ id: s.id, fileName: s.fileName }))
        },
        { status: 404 }
      );
    }

    console.log(`[Import Save] ✅ Found session, canSave: ${importSession.canSave}`);

    // Check if save is allowed
    if (!importSession.canSave) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot save: validation errors exist or no valid data',
          canSave: false
        },
        { status: 400 }
      );
    }

    // Save all data with transaction
    const saveResult = await dataImportService.saveAll(sessionId);

    if (!saveResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: saveResult.message,
          errors: saveResult.errors,
          rollback: saveResult.rollback
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: saveResult.message,
      savedCounts: saveResult.savedCounts,
      totalSaved: saveResult.totalSaved
    });

  } catch (error: any) {
    console.error('Import save error:', error);
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
