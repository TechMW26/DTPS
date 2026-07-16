import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import { MedicalInfo } from '@/lib/db/models';
import mongoose from 'mongoose';
import { clearCacheByTag } from '@/lib/api/utils';

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

    // Stream file to MongoDB GridFS
    const db = mongoose.connection.db;
    if (!db) {
      return NextResponse.json({ error: 'Database not connected' }, { status: 500 });
    }

    const bucket = new (mongoose as any).mongo.GridFSBucket(db, { bucketName: 'medicalReports' });
    const uniqueFileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const contentType = file.type || 'application/octet-stream';
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadStream = bucket.openUploadStream(uniqueFileName, {
      contentType,
      metadata: { userId: id, originalName: file.name },
    });

    await new Promise<void>((resolve, reject) => {
      uploadStream.end(buffer, (err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const fileId = (uploadStream.id as mongoose.Types.ObjectId).toString();
    const publicUrl = `/api/reports/${fileId}`;

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
