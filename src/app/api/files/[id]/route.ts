import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import { File as FileModel } from '@/lib/db/models/File';
import { withCache } from '@/lib/api/utils';
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
    const storedUrl = fileDoc.imageKitUrl || fileDoc.localPath;
    if (storedUrl) {
      const resolverUrl = new URL('/api/media/resolve', request.url);
      resolverUrl.searchParams.set('url', storedUrl);
      return NextResponse.redirect(resolverUrl, 307);
    }

    return new NextResponse('ImageKit media reference not found', { status: 404 });
  } catch (error) {
    console.error('Error serving file:', error);
    return new NextResponse('Error serving file', { status: 500 });
  }
}
