import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import SystemAlert from '@/lib/db/models/SystemAlert';
import { UserRole } from '@/types';

// POST /api/system-alerts/bulk - Bulk actions on system alerts
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectDB();

    const body = await request.json();
    const { action, alertIds, status, resolution } = body;

    if (!action || !alertIds || !Array.isArray(alertIds) || alertIds.length === 0) {
      return NextResponse.json(
        { error: 'Action and alertIds are required' },
        { status: 400 }
      );
    }

    let result;

    switch (action) {
      case 'markRead':
        result = await SystemAlert.updateMany(
          { _id: { $in: alertIds } },
          { $set: { isRead: true } }
        );
        break;

      case 'markUnread':
        result = await SystemAlert.updateMany(
          { _id: { $in: alertIds } },
          { $set: { isRead: false } }
        );
        break;

      case 'acknowledge':
        result = await SystemAlert.updateMany(
          { _id: { $in: alertIds } },
          { $set: { status: 'acknowledged', isRead: true } }
        );
        break;

      case 'resolve':
        result = await SystemAlert.updateMany(
          { _id: { $in: alertIds } },
          {
            $set: {
              status: 'resolved',
              resolvedBy: session.user.id,
              resolvedAt: new Date(),
              resolution: resolution || 'Bulk resolved',
              isRead: true
            }
          }
        );
        break;

      case 'ignore':
        result = await SystemAlert.updateMany(
          { _id: { $in: alertIds } },
          { $set: { status: 'ignored', isRead: true } }
        );
        break;

      case 'delete':
        result = await SystemAlert.deleteMany(
          { _id: { $in: alertIds } }
        );
        break;

      case 'updateStatus':
        if (!status) {
          return NextResponse.json(
            { error: 'Status is required for updateStatus action' },
            { status: 400 }
          );
        }
        const updateData: any = { status };
        if (status === 'resolved') {
          updateData.resolvedBy = session.user.id;
          updateData.resolvedAt = new Date();
          if (resolution) {
            updateData.resolution = resolution;
          }
        }
        result = await SystemAlert.updateMany(
          { _id: { $in: alertIds } },
          { $set: updateData }
        );
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

    let modifiedCount = 0;
    if (action === 'delete' && 'deletedCount' in result) {
      modifiedCount = result.deletedCount || 0;
    } else if ('modifiedCount' in result) {
      modifiedCount = result.modifiedCount || 0;
    }

    return NextResponse.json({
      message: `Successfully performed ${action} on ${alertIds.length} alerts`,
      modifiedCount
    });
  } catch (error) {
    console.error('Error performing bulk action:', error);
    return NextResponse.json(
      { error: 'Failed to perform bulk action' },
      { status: 500 }
    );
  }
}
