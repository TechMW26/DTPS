import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import EcommerceBlog from '@/lib/db/models/EcommerceBlog';

const isAdmin = (session: any) => session?.user?.role === 'admin';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status');

    const query: any = {};
    if (status && status !== 'all') query.isActive = status === 'active';
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } }
      ];
    }

    // Add pagination support
    const limit = Math.max(parseInt(searchParams.get('limit') || '20', 10), 1);
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
    const skip = (page - 1) * limit;

    const [blogs, total] = await Promise.all([
      EcommerceBlog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      EcommerceBlog.countDocuments(query)
    ]);

    return NextResponse.json({
      blogs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching ecommerce blogs:', error);
    return NextResponse.json({ error: 'Failed to fetch ecommerce blogs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const body = await request.json();
    if (!body.title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const blog = await EcommerceBlog.create(body);
    return NextResponse.json({ blog });
  } catch (error) {
    console.error('Error creating ecommerce blog:', error);
    return NextResponse.json({ error: 'Failed to create ecommerce blog' }, { status: 500 });
  }
}
