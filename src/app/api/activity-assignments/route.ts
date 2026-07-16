import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import ActivityAssignment from '@/lib/db/models/ActivityAssignment';
import { UserRole } from '@/types';
import mongoose from 'mongoose';
import { format } from 'date-fns';
import { logHistoryServer } from '@/lib/server/history';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// Helper to get date without time
const getDateOnly = (date: Date | string): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Helper to check if user has permission
const checkPermission = (session: any, clientId?: string): boolean => {
  const userRole = session?.user?.role;
  if ([UserRole.ADMIN, UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR].includes(userRole)) {
    return true;
  }
  if (userRole === UserRole.CLIENT) {
    return !clientId || clientId === session?.user?.id;
  }
  return false;
};

// GET /api/activity-assignments - Get assignments for a client
export async function GET(request: NextRequest) {
  try {
    const [session] = await Promise.all([
      getServerSession(authOptions),
      connectDB(),
    ]);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId') || session.user.id;
    const dateParam = searchParams.get('date');
    const status = searchParams.get('status'); // 'pending', 'partial', 'completed', 'all'

    if (!checkPermission(session, clientId)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const clientObjectId = new mongoose.Types.ObjectId(clientId);

    // Build query
    const query: any = { client: clientObjectId };

    if (dateParam) {
      const filterDate = getDateOnly(dateParam);
      query.date = filterDate;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    const assignments = await withCache(
      `activity-assignments:${JSON.stringify(query)}`,
      async () => await ActivityAssignment.find(query)
        .populate('assignedBy', 'firstName lastName')
        .sort({ date: -1, createdAt: -1 }),
      { ttl: 120000, tags: ['activity_assignments'] }
    );

    return NextResponse.json({
      success: true,
      assignments,
      count: assignments.length
    });

  } catch (error) {
    console.error('Error fetching activity assignments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activity assignments' },
      { status: 500 }
    );
  }
}

// POST /api/activity-assignments - Create new assignment
export async function POST(request: NextRequest) {
  try {
    const [session, body] = await Promise.all([
      getServerSession(authOptions),
      request.json(),
    ]);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only dietitians, admins, and health counselors can create assignments
    const allowedRoles = [UserRole.ADMIN, UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR];
    if (!allowedRoles.includes(session.user.role as UserRole)) {
      return NextResponse.json({ error: 'Only dietitians can assign activities' }, { status: 403 });
    }

    const { clientId, date, targets, notes } = body;

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 });
    }

    if (!targets || !Array.isArray(targets) || targets.length === 0) {
      return NextResponse.json({ error: 'At least one target is required' }, { status: 400 });
    }

    await connectDB();

    const assignmentDate = date ? getDateOnly(date) : getDateOnly(new Date());
    const clientObjectId = new mongoose.Types.ObjectId(clientId);

    // Check if an assignment already exists for this client and date
    let existingAssignment = await ActivityAssignment.findOne({
      client: clientObjectId,
      date: assignmentDate
    });

    if (existingAssignment) {
      // Add new targets to existing assignment
      existingAssignment.targets.push(...targets.map((t: any) => ({
        ...t,
        isCompleted: false
      })));
      await existingAssignment.save();

      // Log history
      await logHistoryServer({
        userId: clientId,
        action: 'update',
        category: 'assignment',
        description: `Activity targets updated: ${targets.map((t: any) => t.type).join(', ')}`,
        performedById: session.user.id,
        metadata: {
          assignmentId: existingAssignment._id.toString(),
          targets: targets.map((t: any) => t.type),
          date: format(assignmentDate, 'yyyy-MM-dd')
        }
      });

      return NextResponse.json({
        success: true,
        assignment: existingAssignment,
        message: 'Targets added to existing assignment'
      });
    }

    // Create new assignment
    const newAssignment = new ActivityAssignment({
      client: clientObjectId,
      assignedBy: new mongoose.Types.ObjectId(session.user.id),
      date: assignmentDate,
      targets: targets.map((t: any) => ({
        ...t,
        isCompleted: false
      })),
      notes,
      status: 'pending'
    });

    await newAssignment.save();

    // Log history
    await logHistoryServer({
      userId: clientId,
      action: 'create',
      category: 'assignment',
      description: `Activity assigned: ${targets.map((t: any) => t.type).join(', ')}`,
      performedById: session.user.id,
      metadata: {
        assignmentId: newAssignment._id.toString(),
        targets: targets.map((t: any) => t.type),
        date: format(assignmentDate, 'yyyy-MM-dd')
      }
    });

    return NextResponse.json({
      success: true,
      assignment: newAssignment,
      message: 'Activity assigned successfully'
    });

  } catch (error) {
    console.error('Error creating activity assignment:', error);
    return NextResponse.json(
      { error: 'Failed to create activity assignment' },
      { status: 500 }
    );
  }
}

// PUT /api/activity-assignments - Update assignment (mark as complete)
export async function PUT(request: NextRequest) {
  try {
    const [session, body] = await Promise.all([
      getServerSession(authOptions),
      request.json(),
    ]);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { assignmentId, targetId, isCompleted, completedValue, notes } = body;

    if (!assignmentId) {
      return NextResponse.json({ error: 'Assignment ID is required' }, { status: 400 });
    }

    await connectDB();

    const assignment = await withCache(
      `activity-assignments:${JSON.stringify(assignmentId)}`,
      async () => await ActivityAssignment.findById(assignmentId),
      { ttl: 120000, tags: ['activity_assignments'] }
    );

    if (!assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    // Check permission - client can only update their own, dietitian can update any
    const isOwnAssignment = assignment.client.toString() === session.user.id;
    const isDietitian = [UserRole.ADMIN, UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR].includes(session.user.role as UserRole);

    if (!isOwnAssignment && !isDietitian) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (targetId) {
      // Update specific target
      const target = assignment.targets.id(targetId);
      if (target) {
        target.isCompleted = isCompleted;
        if (isCompleted) {
          target.completedAt = new Date();
          if (completedValue !== undefined) {
            target.completedValue = completedValue;
          }
        } else {
          target.completedAt = undefined;
          target.completedValue = undefined;
        }
        if (notes) {
          target.notes = notes;
        }
      }
    }

    // Update overall status
    const completedCount = assignment.targets.filter((t: any) => t.isCompleted).length;
    if (completedCount === 0) {
      assignment.status = 'pending';
    } else if (completedCount === assignment.targets.length) {
      assignment.status = 'completed';
    } else {
      assignment.status = 'partial';
    }

    await assignment.save();

    // Log history
    await logHistoryServer({
      userId: assignment.client.toString(),
      action: 'update',
      category: 'assignment',
      description: `Activity target ${isCompleted ? 'completed' : 'unmarked'}: ${assignment.targets.id(targetId)?.type || 'Unknown'}`,
      performedById: session.user.id,
      metadata: {
        assignmentId: assignment._id.toString(),
        targetId,
        isCompleted,
        completedValue,
        status: assignment.status
      }
    });

    return NextResponse.json({
      success: true,
      assignment,
      message: isCompleted ? 'Target marked as completed' : 'Target unmarked'
    });

  } catch (error) {
    console.error('Error updating activity assignment:', error);
    return NextResponse.json(
      { error: 'Failed to update activity assignment' },
      { status: 500 }
    );
  }
}

// DELETE /api/activity-assignments - Delete assignment or target
export async function DELETE(request: NextRequest) {
  try {
    const [session] = await Promise.all([
      getServerSession(authOptions),
      connectDB(),
    ]);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only dietitians can delete assignments
    const allowedRoles = [UserRole.ADMIN, UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR];
    if (!allowedRoles.includes(session.user.role as UserRole)) {
      return NextResponse.json({ error: 'Only dietitians can delete assignments' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const assignmentId = searchParams.get('assignmentId');
    const targetId = searchParams.get('targetId');

    if (!assignmentId) {
      return NextResponse.json({ error: 'Assignment ID is required' }, { status: 400 });
    }

    if (targetId) {
      // Delete specific target
      const assignment = await withCache(
        `activity-assignments:${JSON.stringify(assignmentId)}`,
        async () => await ActivityAssignment.findById(assignmentId),
        { ttl: 120000, tags: ['activity_assignments'] }
      );
      if (!assignment) {
        return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
      }

      assignment.targets.pull(targetId);

      // If no targets left, delete the whole assignment
      if (assignment.targets.length === 0) {
        await ActivityAssignment.findByIdAndDelete(assignmentId);
        return NextResponse.json({
          success: true,
          message: 'Assignment deleted (no targets remaining)'
        });
      }

      await assignment.save();
      return NextResponse.json({
        success: true,
        assignment,
        message: 'Target deleted'
      });
    }

    // Delete entire assignment
    const deleted = await ActivityAssignment.findByIdAndDelete(assignmentId);
    if (!deleted) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    // Log history
    await logHistoryServer({
      userId: deleted.client.toString(),
      action: 'delete',
      category: 'assignment',
      description: 'Activity assignment deleted',
      performedById: session.user.id,
      metadata: {
        assignmentId,
        date: format(deleted.date, 'yyyy-MM-dd')
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Assignment deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting activity assignment:', error);
    return NextResponse.json(
      { error: 'Failed to delete activity assignment' },
      { status: 500 }
    );
  }
}
