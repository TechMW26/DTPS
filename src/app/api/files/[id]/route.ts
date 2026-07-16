import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import { File as FileModel } from '@/lib/db/models/File';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import mongoose from 'mongoose';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return new NextResponse('Invalid file id', { status: 400 });
    }

    await connectDB();
    const fileDoc = await withCache(
      `files:id:${JSON.stringify(id)}`,
      async () => await FileModel.findById(id),
      { ttl: 120000, tags: ['files'] }
    );
    if (!fileDoc) {
      return new NextResponse('File not found', { status: 404 });
    }
    const buffer = Buffer.from(fileDoc.data, 'base64');

    // Sanitize filename for Content-Disposition header
    const sanitizedFilename = fileDoc.originalName
      .replace(/[^\x20-\x7E]/g, '_') // Replace non-ASCII chars
      .replace(/"/g, '\\"'); // Escape quotes

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': fileDoc.mimeType,
        'Content-Disposition': `inline; filename="${sanitizedFilename}"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Error serving file:', error);
    return new NextResponse('Error serving file', { status: 500 });
  }
}
