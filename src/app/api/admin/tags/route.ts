import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import Tag from '@/lib/db/models/Tag';
import { withConditionalCache, errorResponse, withCache, clearCacheByTag } from '@/lib/api/utils';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    // Allow admin, dietitian, and health_counselor to view tags
    if (!session || !['admin', 'dietitian', 'health_counselor'].includes(session.user?.role || '')) {
      return errorResponse('Unauthorized. Staff access required.', 403, 'STAFF_REQUIRED');
    }

    await connectDB();

    // Get query params to filter by tag type
    const { searchParams } = new URL(req.url);
    const tagType = searchParams.get('tagType');
    const userRole = session.user.role;

    // Build query - filter by tag type if provided
    let query: any = {};
    if (tagType && ['dietitian', 'health_counselor', 'general'].includes(tagType)) {
      query.tagType = tagType;
    } else if (userRole === 'dietitian') {
      // Dietitians see their tags and general tags
      query.tagType = { $in: ['dietitian', 'general'] };
    } else if (userRole === 'health_counselor') {
      // Health counselors see their tags and general tags
      query.tagType = { $in: ['health_counselor', 'general'] };
    }
    // Admin sees all tags

    const cacheKey = `admin:tags:${userRole}:${tagType || 'all'}`;
    
    // Use server memory cache for tags (static data)
    const tags = await withCache(
      cacheKey,
      async () => {
        return await Tag.find(query).sort({ tagType: 1, name: 1 }).lean();
      },
      { ttl: 300000, tags: ['tags'] } // Cache for 5 minutes
    );

    // Use conditional caching for tags (relatively static data)
    return withConditionalCache(tags, req, {
      maxAge: 60, // Cache for 60 seconds
      private: true,
    });
  } catch (error: any) {
    console.error('Error fetching tags:', error);
    return errorResponse(
      error.message || 'Failed to fetch tags',
      500,
      'FETCH_ERROR'
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, description = '', color = '#3B82F6', icon = 'tag', tagType = 'general' } = body;

    // Validate required fields
    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Tag name is required' },
        { status: 400 }
      );
    }

    // Validate tagType
    if (!['dietitian', 'health_counselor', 'general'].includes(tagType)) {
      return NextResponse.json(
        { error: 'Invalid tag type. Must be dietitian, health_counselor, or general' },
        { status: 400 }
      );
    }

    await connectDB();

    // Check if tag already exists with same name and type
    const existingTag = await Tag.findOne({ name: name.trim(), tagType });
    if (existingTag) {
      return NextResponse.json(
        { error: `Tag "${name}" already exists for ${tagType === 'general' ? 'general use' : tagType + 's'}` },
        { status: 409 }
      );
    }

    // Create new tag
    const newTag = new Tag({
      name: name.trim(),
      description: description.trim(),
      color,
      icon,
      tagType,
      createdBy: session.user.id
    });

    await newTag.save();
    
    // Clear tags cache on create
    clearCacheByTag('tags');

    return NextResponse.json(newTag, { status: 201 });
  } catch (error) {
    console.error('Error creating tag:', error);
    return NextResponse.json(
      { error: 'Failed to create tag' },
      { status: 500 }
    );
  }
}
