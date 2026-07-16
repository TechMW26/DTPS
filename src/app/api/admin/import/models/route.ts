/**
 * API Route: Data Import - Models & Templates
 * GET /api/admin/import/models
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { modelRegistry, dataImportService } from '@/lib/import';

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
    const modelName = searchParams.get('model');
    const action = searchParams.get('action'); // 'template' | 'fields' | null

    // Get template for a specific model
    if (modelName && action === 'template') {
      const template = dataImportService.getImportTemplate(modelName);
      if (!template) {
        return NextResponse.json(
          { success: false, error: 'Model not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        modelName,
        template
      });
    }

    // Get fields for a specific model
    if (modelName && action === 'fields') {
      const model = modelRegistry.get(modelName);
      if (!model) {
        return NextResponse.json(
          { success: false, error: 'Model not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        modelName,
        displayName: model.displayName,
        description: model.description,
        fields: model.fields,
        requiredFields: model.requiredFields
      });
    }

    // List all models (not just importable)
    const allModels = modelRegistry.getAll();

    return NextResponse.json({
      success: true,
      models: allModels.map(m => ({
        name: m.name,
        displayName: m.displayName,
        description: m.description,
        requiredFields: m.requiredFields,
        fieldCount: m.fields.filter(f => 
          !f.path.startsWith('_') && 
          f.path !== 'createdAt' && 
          f.path !== 'updatedAt'
        ).length
      }))
    });

  } catch (error: any) {
    console.error('Import models error:', error);
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
