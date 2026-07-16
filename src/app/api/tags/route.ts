import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import Tag from '@/lib/db/models/Tag';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/tags - Get all tags
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const tags = await withCache(
      `tags:all`,
      async () => await Tag.find()
        .sort({ createdAt: -1 })
        .lean(),
      { ttl: 120000, tags: ['tags'] }
    );

    return NextResponse.json({
      tags,
      count: tags.length
    });
  } catch (error) {
    console.error('Error fetching tags:', error);
    return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 });
  }
}

// POST /api/tags - Create a new tag (Admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    await connectDB();

    const body = await request.json();
    const { name, description, color, icon } = body;

    // Validation
    if (!name || !name.trim()) {
      return NextResponse.json({
        error: 'Tag name is required'
      }, { status: 400 });
    }

    // Check if tag already exists
    const existingTag = await withCache(
      `tags:${JSON.stringify({ name: name.trim() })}`,
      async () => await Tag.findOne({ name: name.trim() }),
      { ttl: 120000, tags: ['tags'] }
    );
    if (existingTag) {
      return NextResponse.json({
        error: 'Tag with this name already exists'
      }, { status: 409 });
    }

    // Create the tag
    const newTag = new Tag({
      name: name.trim(),
      description: description || '',
      color: color || '#3B82F6',
      icon: icon || 'tag'
    });

    await newTag.save();

    return NextResponse.json({
      message: 'Tag created successfully',
      tag: newTag
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating tag:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create tag';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
