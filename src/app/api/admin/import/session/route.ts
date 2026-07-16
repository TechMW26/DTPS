/**
 * API Route: Data Import - Session Management
 * GET/DELETE /api/admin/import/session
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { dataImportService } from '@/lib/import';

export const runtime = 'nodejs';

// Get session data
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
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Session ID is required' },
        { status: 400 }
      );
    }

    const importSession = dataImportService.getSession(sessionId);
    if (!importSession) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      session: importSession
    });

  } catch (error: any) {
    console.error('Import session get error:', error);
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

// Clear or delete session
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
    const action = searchParams.get('action') || 'delete'; // 'clear' or 'delete'

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Session ID is required' },
        { status: 400 }
      );
    }

    let success: boolean;
    if (action === 'clear') {
      success = dataImportService.clearSession(sessionId);
    } else {
      success = dataImportService.deleteSession(sessionId);
    }

    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: action === 'clear' ? 'Session cleared' : 'Session deleted'
    });

  } catch (error: any) {
    console.error('Import session delete error:', error);
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
