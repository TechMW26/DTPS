import { NextRequest, NextResponse } from 'next/server';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

const WP_BASE = process.env.WP_BASE || 'https://your-wordpress-site.com';
const WP_KEY = process.env.WP_API_KEY || 'dtps_live_7JpQ6QfE2w3r9T1L';
const WP_SECRET = process.env.WP_API_SECRET || 'dtps_secret_bS8mN2kL5xP0vY4R';
const API_BASE = `${WP_BASE}/wp-json/dtps/v1`;

// GET - Fetch media from WordPress
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const perPage = searchParams.get('per_page') || '24';
    const page = searchParams.get('page') || '1';

    const res = await fetch(`${API_BASE}/media?per_page=${perPage}&page=${page}`, {
      headers: {
        'X-Api-Key': WP_KEY,
        'X-Api-Secret': WP_SECRET,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('WordPress API error:', text);
      return NextResponse.json(
        { error: text || 'Failed to fetch media' },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error fetching WordPress media:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch media' },
      { status: 500 }
    );
  }
}

// POST - Upload media to WordPress
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const title = formData.get('title') as string | null;
    const alt = formData.get('alt') as string | null;
    const caption = formData.get('caption') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Create new FormData for WordPress API
    const wpFormData = new FormData();
    
    // Convert File to Blob
    const bytes = await file.arrayBuffer();
    const blob = new Blob([bytes], { type: file.type });
    wpFormData.append('file', blob, file.name);
    
    if (title) wpFormData.append('title', title);
    if (alt) wpFormData.append('alt', alt);
    if (caption) wpFormData.append('caption', caption);
    const res = await fetch(`${API_BASE}/media`, {
      method: 'POST',
      headers: {
        'X-Api-Key': WP_KEY,
        'X-Api-Secret': WP_SECRET,
      },
      body: wpFormData,
    });

    const text = await res.text();
    
    if (!res.ok) {
      console.error('WordPress upload error:', text);
      return NextResponse.json(
        { error: text || 'Upload failed' },
        { status: res.status }
      );
    }

    const data = JSON.parse(text);
    
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error uploading to WordPress:', error);
    return NextResponse.json(
      { error: error.message || 'Upload failed' },
      { status: 500 }
    );
  }
}

