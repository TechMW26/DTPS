import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import SystemAlert from '@/lib/db/models/SystemAlert';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/system-alerts/[id] - Get single system alert
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    await connectDB();

    const alert = await withCache(
      `system-alerts:id:${JSON.stringify(id)}`,
      async () => await SystemAlert.findById(id)
      .populate('createdBy', 'firstName lastName email')
      .populate('resolvedBy', 'firstName lastName email')
      ,
      { ttl: 120000, tags: ['system_alerts'] }
    );

    if (!alert) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    return NextResponse.json({ alert });
  } catch (error) {
    console.error('Error fetching system alert:', error);
    return NextResponse.json(
      { error: 'Failed to fetch system alert' },
      { status: 500 }
    );
  }
}

// PATCH /api/system-alerts/[id] - Update system alert (acknowledge, resolve, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    await connectDB();

    const body = await request.json();
    const { status, resolution, isRead } = body;

    const updateData: any = {};

    if (status) {
      updateData.status = status;
      if (status === 'resolved') {
        updateData.resolvedBy = session.user.id;
        updateData.resolvedAt = new Date();
      }
    }

    if (resolution) {
      updateData.resolution = resolution;
    }

    if (typeof isRead === 'boolean') {
      updateData.isRead = isRead;
    }

    const alert = await SystemAlert.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    )
      .populate('createdBy', 'firstName lastName email')
      .populate('resolvedBy', 'firstName lastName email')
      .lean();

    if (!alert) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    return NextResponse.json({ alert });
  } catch (error) {
    console.error('Error updating system alert:', error);
    return NextResponse.json(
      { error: 'Failed to update system alert' },
      { status: 500 }
    );
  }
}

// DELETE /api/system-alerts/[id] - Delete a system alert
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    await connectDB();

    const alert = await SystemAlert.findByIdAndDelete(id);

    if (!alert) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Alert deleted successfully' });
  } catch (error) {
    console.error('Error deleting system alert:', error);
    return NextResponse.json(
      { error: 'Failed to delete system alert' },
      { status: 500 }
    );
  }
}
