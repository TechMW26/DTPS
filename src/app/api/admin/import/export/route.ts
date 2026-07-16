/**
 * API Route: Data Import - Export Files
 * GET /api/admin/import/export
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { dataImportService } from '@/lib/import';
 
export const runtime = 'nodejs';

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
    const modelName = searchParams.get('model');
    const format = searchParams.get('format') || 'csv'; // 'csv' or 'json'

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Session ID is required' },
        { status: 400 }
      );
    }

    // Generate export files
    const exports = dataImportService.generateExportFiles(sessionId);

    if (exports.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No data to export or session not found' },
        { status: 404 }
      );
    }

    // If specific model requested, return that file as download
    if (modelName) {
      const exportFile = exports.find(e => e.modelName === modelName);
      if (!exportFile) {
        return NextResponse.json(
          { success: false, error: 'Model data not found' },
          { status: 404 }
        );
      }

      const content = format === 'json' ? exportFile.jsonContent : exportFile.csvContent;
      const contentType = format === 'json' ? 'application/json' : 'text/csv';
      const extension = format === 'json' ? 'json' : 'csv';

      return new NextResponse(content, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${exportFile.fileName}.${extension}"`
        }
      });
    }

    // Return list of available exports
    return NextResponse.json({
      success: true,
      exports: exports.map(e => ({
        modelName: e.modelName,
        fileName: e.fileName,
        hasCsv: !!e.csvContent,
        hasJson: !!e.jsonContent
      }))
    });

  } catch (error: any) {
    console.error('Import export error:', error);
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
