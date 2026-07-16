import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import ProgressEntry from '@/lib/db/models/ProgressEntry';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// Progress Photos API Routes

// GET /api/progress/photos - Get progress photos
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // front, side, back

    const query: any = {
      user: session.user.id,
      type: 'photo'
    };

    if (type) {
      query['metadata.photoType'] = type;
    }

    const photos = await ProgressEntry
      .find(query)
      .sort({ createdAt: -1 })
      .lean();

    const formattedPhotos = photos.map((photo: any) => ({
      id: photo._id.toString(),
      url: photo.value, // WordPress URL stored in value field
      type: photo.metadata?.photoType || 'front',
      notes: photo.metadata?.notes,
      createdAt: photo.createdAt,
      wordpressId: photo.metadata?.wordpressId
    }));

    return NextResponse.json({ photos: formattedPhotos });
  } catch (error: any) {
    console.error('Error fetching photos:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch photos' },
      { status: 500 }
    );
  }
}

// POST /api/progress/photos - Upload progress photo
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const photoType = formData.get('photoType') as string || 'front';
    const notes = formData.get('notes') as string || '';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Upload directly to WordPress - SAME AS WORDPRESS MEDIA ROUTE
    const WP_BASE = process.env.WP_BASE || 'https://your-wordpress-site.com';
    const WP_KEY = process.env.WP_API_KEY || 'dtps_live_7JpQ6QfE2w3r9T1L';
    const WP_SECRET = process.env.WP_API_SECRET || 'dtps_secret_bS8mN2kL5xP0vY4R';
    const API_BASE = `${WP_BASE}/wp-json/dtps/v1`;

    // Create FormData for WordPress API
    const wpFormData = new FormData();

    // Convert File to Blob
    const bytes = await file.arrayBuffer();
    const blob = new Blob([bytes], { type: file.type });
    wpFormData.append('file', blob, file.name);
    wpFormData.append('title', `Progress Photo - ${photoType}`);
    wpFormData.append('alt', `Progress photo - ${photoType} view`);
    const wpResponse = await fetch(`${API_BASE}/media`, {
      method: 'POST',
      headers: {
        'X-Api-Key': WP_KEY,
        'X-Api-Secret': WP_SECRET,
      },
      body: wpFormData,
    });

    const text = await wpResponse.text();

    if (!wpResponse.ok) {
      console.error('WordPress upload error:', text);
      throw new Error(text || 'Failed to upload to WordPress');
    }

    const wpData = JSON.parse(text);

    // Connect to database AFTER successful WordPress upload
    await connectDB();

    const progressEntry = new ProgressEntry({
      user: session.user.id, // Use user ID instead of userEmail
      type: 'photo',
      value: wpData.source_url || wpData.url, // Use source_url like recipes
      metadata: {
        photoType,
        notes,
        wordpressId: wpData.id,
        originalFilename: file.name,
        fileSize: file.size,
        mimeType: file.type
      }
    });

    await progressEntry.save();

    // Get previous photo of same type for comparison
    const previousPhoto = await ProgressEntry
      .findOne({
        user: session.user.id, // Use user ID instead of userEmail
        type: 'photo',
        'metadata.photoType': photoType,
        _id: { $ne: progressEntry._id }
      })
      .sort({ createdAt: -1 })
      .lean();

    const response = {
      success: true,
      photo: {
        _id: progressEntry._id,
        url: progressEntry.value, // Use the saved URL (source_url)
        photoType,
        notes,
        wordpressId: wpData.id,
        createdAt: progressEntry.createdAt
      },
      previousPhoto: previousPhoto ? {
        _id: (previousPhoto as any)._id,
        url: (previousPhoto as any).value,
        photoType: (previousPhoto as any).metadata?.photoType,
        createdAt: (previousPhoto as any).createdAt
      } : null,
      wordpress: wpData
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error uploading photo:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload photo' },
      { status: 500 }
    );
  }
}

// DELETE /api/progress/photos - Delete progress photo
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const photoId = searchParams.get('id');

    if (!photoId) {
      return NextResponse.json({ error: 'Photo ID required' }, { status: 400 });
    }

    await connectDB();

    const photo = await withCache(
      `progress:photos:${JSON.stringify({
      _id: photoId,
      user: session.user.id, // Use user ID instead of userEmail
      type: 'photo'
    })}`,
      async () => await ProgressEntry.findOne({
      _id: photoId,
      user: session.user.id, // Use user ID instead of userEmail
      type: 'photo'
    }),
      { ttl: 120000, tags: ['progress'] }
    );

    if (!photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    // Delete from database
    await ProgressEntry.deleteOne({ _id: photoId });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting photo:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete photo' },
      { status: 500 }
    );
  }
}