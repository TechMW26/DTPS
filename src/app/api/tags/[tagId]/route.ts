import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import mongoose from 'mongoose';
import Tag from '@/lib/db/models/Tag';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/tags/[tagId] - Get a specific tag
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tagId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { tagId } = await params;
    const tag = await withCache(
      `tags:tagId:${JSON.stringify(tagId)}`,
      async () => await Tag.findById(tagId),
      { ttl: 120000, tags: ['tags'] }
    );

    if (!tag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    return NextResponse.json({ tag });
  } catch (error) {
    console.error('Error fetching tag:', error);
    return NextResponse.json({ error: 'Failed to fetch tag' }, { status: 500 });
  }
}

// PATCH /api/tags/[tagId] - Update a tag (Admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tagId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    await connectDB();

    const { tagId } = await params;
    const body = await request.json();
    const { name, description, color, icon } = body;

    const tag = await withCache(
      `tags:tagId:${JSON.stringify(tagId)}`,
      async () => await Tag.findById(tagId),
      { ttl: 120000, tags: ['tags'] }
    );
    if (!tag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    // Check if new name is already taken by another tag
    if (name && name !== tag.name) {
      const existingTag = await withCache(
      `tags:tagId:${JSON.stringify({ name: name.trim() })}`,
      async () => await Tag.findOne({ name: name.trim() }),
      { ttl: 120000, tags: ['tags'] }
    );
      if (existingTag) {
        return NextResponse.json({ 
          error: 'Tag with this name already exists' 
        }, { status: 409 });
      }
    }

    // Update fields
    if (name) tag.name = name.trim();
    if (description !== undefined) tag.description = description;
    if (color) tag.color = color;
    if (icon) tag.icon = icon;

    await tag.save();

    return NextResponse.json({ 
      message: 'Tag updated successfully',
      tag
    });
  } catch (error) {
    console.error('Error updating tag:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update tag';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// DELETE /api/tags/[tagId] - Delete a tag (Admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tagId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    await connectDB();

    const { tagId } = await params;
    const tag = await Tag.findByIdAndDelete(tagId);

    if (!tag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Tag deleted successfully' });
  } catch (error) {
    console.error('Error deleting tag:', error);
    return NextResponse.json({ error: 'Failed to delete tag' }, { status: 500 });
  }
}
