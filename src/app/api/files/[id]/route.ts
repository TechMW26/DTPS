import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import { File as FileModel } from '@/lib/db/models/File';
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
    const fileDoc = await FileModel.findById(id);
    if (!fileDoc) {
      return new NextResponse('File not found', { status: 404 });
    }

    // Redirect to stored URL (Vercel Blob or legacy ImageKit)
    const storedUrl = fileDoc.imageKitUrl || fileDoc.localPath;
    if (storedUrl) {
      return NextResponse.redirect(storedUrl, 307);
    }

    // Legacy files that were stored inline in MongoDB are retained in RTDB.
    // Large base64 strings are chunked during migration to stay below RTDB's
    // per-string limit and reassembled only when requested.
    const storedData = (fileDoc as any).data;
    const base64 = storedData?.__type === 'chunked-string'
      ? storedData.chunks?.join('')
      : typeof storedData === 'string'
        ? storedData
        : null;
    if (base64) {
      const body = Buffer.from(base64.replace(/^data:[^;,]+;base64,/, ''), 'base64');
      return new NextResponse(body, {
        headers: {
          'Content-Type': fileDoc.mimeType || 'application/octet-stream',
          'Content-Length': String(body.length),
          'Cache-Control': 'private, max-age=31536000, immutable',
        },
      });
    }

    return new NextResponse('Media reference not found', { status: 404 });
  } catch (error) {
    console.error('Error serving file:', error);
    return new NextResponse('Error serving file', { status: 500 });
  }
}
