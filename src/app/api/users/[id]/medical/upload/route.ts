import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import { MedicalInfo } from '@/lib/db/models';
import { File as FileModel } from '@/lib/db/models/File';
import { clearCacheByTag } from '@/lib/api/utils';
import { getImageKit } from '@/lib/imagekit';

// POST /api/users/[id]/medical/upload - Upload medical report file
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const fileName = formData.get('fileName') as string;
    const category = (formData.get('category') as string) || 'medical-report';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const uniqueFileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const contentType = file.type || 'application/octet-stream';
    const bytes = await file.arrayBuffer();
    const imageKit = getImageKit();
    if (!imageKit) {
      return NextResponse.json(
        { error: 'ImageKit media service is unavailable', code: 'MEDIA_SERVICE_DOWN' },
        { status: 503 }
      );
    }

    const uploaded = await imageKit.upload({
      file: Buffer.from(bytes),
      fileName: uniqueFileName,
      folder: '/medical-reports',
    });

    let savedFile;
    try {
      savedFile = await FileModel.create({
        filename: uploaded.name || uniqueFileName,
        originalName: file.name,
        mimeType: contentType,
        size: file.size,
        type: 'medical-report',
        imageKitFileId: uploaded.fileId,
        imageKitUrl: uploaded.url,
        uploadedBy: session.user.id,
        metadata: { userId: id, category },
      });
    } catch (databaseError) {
      await imageKit.deleteFile(uploaded.fileId).catch(() => undefined);
      throw databaseError;
    }

    const fileId = String(savedFile._id);
    const publicUrl = `/api/files/${fileId}`;

    // Save to database
    let medicalInfo = await MedicalInfo.findOne({ userId: id });

    const reportEntry = {
      id: fileId,
      fileName: fileName || file.name,
      uploadedOn: new Date().toISOString().split('T')[0],
      fileType: contentType,
      url: publicUrl,
      category: category as 'medical-report' | 'other'
    };

    if (medicalInfo) {
      if (!medicalInfo.reports) {
        medicalInfo.reports = [];
      }
      medicalInfo.reports.push(reportEntry);
      await medicalInfo.save();
    } else {
      medicalInfo = await MedicalInfo.create({
        userId: id,
        reports: [reportEntry]
      });
    }

    // Clear cache so profile page shows updated reports
    await clearCacheByTag('users');
    await clearCacheByTag(`users:id:${id}`);
    await clearCacheByTag(`users:id:medical:${id}`);
    await clearCacheByTag('client');
    await clearCacheByTag(`client:medical-info:${id}`);
    await clearCacheByTag(`client:${id}`);

    return NextResponse.json({
      success: true,
      report: reportEntry
    });

  } catch (error) {
    console.error('Error uploading medical report:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
