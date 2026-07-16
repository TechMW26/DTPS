import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connection';
import Blog from '@/lib/db/models/Blog';
import { withCache } from '@/lib/api/utils';

// GET - Fetch all active blogs for public display
export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const featured = searchParams.get('featured');
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search');

    // Build query - only active blogs
    const query: Record<string, unknown> = { isActive: true };
    
    if (category && category !== 'all') {
      query.category = category.toLowerCase();
    }
    if (featured === 'true') {
      query.isFeatured = true;
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Include limit in cache key to differentiate between homepage (limit=5) and full page
    const cacheKey = `client:blogs:${limit}:${JSON.stringify(query)}`;
    
    const blogs = await withCache(
      cacheKey,
      async () => await Blog.find(query)
      .select('uuid slug title description category featuredImage thumbnailImage author readTime tags isFeatured publishedAt createdAt views likes')
      .sort({ isFeatured: -1, displayOrder: 1, publishedAt: -1 })
      .limit(limit)
      ,
      { ttl: 60000, tags: ['client', 'blogs'] }  // Reduced TTL to 60 seconds for fresher data
    );

    // Get unique categories for filtering
    const categories = await Blog.distinct('category', { isActive: true });

    return NextResponse.json({ 
      blogs,
      categories,
      total: blogs.length
    });
  } catch (error) {
    console.error('Error fetching blogs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch blogs' },
      { status: 500 }
    );
  }
}
