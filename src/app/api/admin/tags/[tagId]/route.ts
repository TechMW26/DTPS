import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connect';
import Tag from '@/lib/db/models/Tag';
import mongoose from 'mongoose';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tagId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    const { tagId } = await params;

    if (!mongoose.Types.ObjectId.isValid(tagId)) {
      return NextResponse.json(
        { error: 'Invalid tag ID' },
        { status: 400 }
      );
    }

    await connectDB();

    const tag = await withCache(
      `admin:tags:tagId:${JSON.stringify(tagId)}`,
      async () => await Tag.findById(tagId),
      { ttl: 120000, tags: ['admin'] }
    );

    if (!tag) {
      return NextResponse.json(
        { error: 'Tag not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(tag, { status: 200 });
  } catch (error) {
    console.error('Error fetching tag:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tag' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ tagId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    const { tagId } = await params;

    if (!mongoose.Types.ObjectId.isValid(tagId)) {
      return NextResponse.json(
        { error: 'Invalid tag ID' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { name, description, color, icon, tagType } = body;

    await connectDB();

    // Fetch fresh from DB (not cached) since we need to update
    const tag = await Tag.findById(tagId);

    if (!tag) {
      return NextResponse.json(
        { error: 'Tag not found' },
        { status: 404 }
      );
    }

    // Check if new name already exists (if name is being changed)
    if (name && name.trim() !== tag.name) {
      const existingTag = await Tag.findOne({ name: name.trim(), _id: { $ne: tagId } });
      if (existingTag) {
        return NextResponse.json(
          { error: 'Tag name already exists' },
          { status: 409 }
        );
      }
    }

    // Update fields
    if (name) tag.name = name.trim();
    if (description !== undefined) tag.description = description.trim();
    if (color) tag.color = color;
    if (icon) tag.icon = icon;
    if (tagType && ['dietitian', 'health_counselor', 'general'].includes(tagType)) {
      tag.tagType = tagType;
    }

    await tag.save();
    
    // Clear cache to reflect changes
    await clearCacheByTag('tags');

    return NextResponse.json(tag, { status: 200 });
  } catch (error) {
    console.error('Error updating tag:', error);
    return NextResponse.json(
      { error: 'Failed to update tag' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ tagId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    const { tagId } = await params;

    if (!mongoose.Types.ObjectId.isValid(tagId)) {
      return NextResponse.json(
        { error: 'Invalid tag ID' },
        { status: 400 }
      );
    }

    await connectDB();

    const tag = await Tag.findByIdAndDelete(tagId);

    if (!tag) {
      return NextResponse.json(
        { error: 'Tag not found' },
        { status: 404 }
      );
    }

    // Clear cache to reflect deletion
    await clearCacheByTag('tags');

    // TODO: Remove this tag from all tasks that reference it
    // await Task.updateMany({ tags: tagId }, { $pull: { tags: tagId } });

    return NextResponse.json(
      { message: 'Tag deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting tag:', error);
    return NextResponse.json(
      { error: 'Failed to delete tag' },
      { status: 500 }
    );
  }
}
