import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import Lead from '@/lib/db/models/Lead';

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();

    if (!body.email && !body.phone && !body.name) {
      return NextResponse.json({ error: 'name, email, or phone is required' }, { status: 400 });
    }

    const lead = await Lead.create({
      name: body.name || '',
      email: body.email || '',
      phone: body.phone || '',
      source: body.source || 'external',
      status: body.status || 'new',
      message: body.message || '',
      notes: body.notes || '',
      metadata: body.metadata || {},
      origin: body.origin || 'dtps'
    });

    return NextResponse.json({ lead });
  } catch (error) {
    console.error('Error creating lead:', error);
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
  }
}
