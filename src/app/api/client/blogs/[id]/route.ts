import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db/connection';
import Blog from '@/lib/db/models/Blog';
import mongoose from 'mongoose';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET - Get single blog by ID or slug for public display
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await dbConnect();

    let blog;

    // Check if id is a valid MongoDB ObjectId or a slug
    if (mongoose.Types.ObjectId.isValid(id)) {
      blog = await Blog.findOne({ _id: id, isActive: true }).lean() as any;
    } else {
      // Try to find by slug
      blog = await Blog.findOne({ slug: id, isActive: true }).lean() as any;
    }

    if (!blog) {
      return NextResponse.json({ error: 'Blog not found' }, { status: 404 });
    }

    // Increment views
    await Blog.findByIdAndUpdate(blog._id, { $inc: { views: 1 } });

    // Get related blogs (same category, excluding current)
    const relatedBlogs = await withCache(
      `client:blogs:id:${JSON.stringify({
      _id: { $ne: blog._id },
      category: blog.category,
      isActive: true
    })}`,
      async () => await Blog.find({
      _id: { $ne: blog._id },
      category: blog.category,
      isActive: true
    })
      .select('uuid slug title description category thumbnailImage author readTime publishedAt')
      .sort({ publishedAt: -1 })
      .limit(3)
      ,
      { ttl: 120000, tags: ['client'] }
    );

    return NextResponse.json({ 
      blog,
      relatedBlogs
    });
  } catch (error) {
    console.error('Error fetching blog:', error);
    return NextResponse.json(
      { error: 'Failed to fetch blog' },
      { status: 500 }
    );
  }
}

// POST - Like/Unlike a blog
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { action } = await request.json();
    
    await dbConnect();

    const blog = await withCache(
      `client:blogs:id:${JSON.stringify(id)}`,
      async () => await Blog.findById(id),
      { ttl: 120000, tags: ['client'] }
    );
    if (!blog) {
      return NextResponse.json({ error: 'Blog not found' }, { status: 404 });
    }

    if (action === 'like') {
      blog.likes += 1;
    } else if (action === 'unlike' && blog.likes > 0) {
      blog.likes -= 1;
    }

    await blog.save();

    return NextResponse.json({ 
      success: true, 
      likes: blog.likes 
    });
  } catch (error) {
    console.error('Error updating blog likes:', error);
    return NextResponse.json(
      { error: 'Failed to update likes' },
      { status: 500 }
    );
  }
}
