import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import Task from '@/lib/db/models/Task';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/config';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string; taskId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { taskId } = await params;

    const task = await withCache(
      `clients:clientId:tasks:taskId:${JSON.stringify(taskId)}`,
      async () => await Task.findById(taskId)
      .populate('client', 'firstName lastName email')
      .populate('dietitian', 'firstName lastName email')
      .populate('tags', 'name color icon'),
      { ttl: 60000, tags: ['clients'] }
    );

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      task
    });
  } catch (error) {
    console.error('Error fetching task:', error);
    return NextResponse.json(
      { error: 'Failed to fetch task' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string; taskId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { taskId } = await params;
    const body = await req.json();

    if (Array.isArray(body.tags)) {
      body.tags = body.tags.slice(0, 1);
    }

    // Find the task first to check ownership
    const existingTask = await withCache(
      `clients:clientId:tasks:taskId:${JSON.stringify(taskId)}`,
      async () => await Task.findById(taskId),
      { ttl: 60000, tags: ['clients'] }
    );
    
    if (!existingTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Health counselors and dietitians can only edit tasks they created
    const userRole = session.user?.role?.toLowerCase();
    if (userRole === 'health_counselor' || userRole === 'dietitian') {
      if (existingTask.dietitian?.toString() !== session.user?.id) {
        return NextResponse.json(
          { error: 'You can only edit tasks you created' },
          { status: 403 }
        );
      }
    }

    const task = await Task.findByIdAndUpdate(
      taskId,
      {
        ...body,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined
      },
      { new: true, runValidators: true }
    )
      .populate('client', 'firstName lastName email')
      .populate('dietitian', 'firstName lastName email')
      .populate('tags', 'name color icon');

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Task updated successfully',
      task
    });
  } catch (error: any) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update task' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string; taskId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { taskId } = await params;

    // Find the task first to check ownership
    const task = await withCache(
      `clients:clientId:tasks:taskId:${JSON.stringify(taskId)}`,
      async () => await Task.findById(taskId),
      { ttl: 60000, tags: ['clients'] }
    );
    
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Health counselors and dietitians can only delete tasks they created
    const userRole = session.user?.role?.toLowerCase();
    if (userRole === 'health_counselor' || userRole === 'dietitian') {
      if (task.dietitian?.toString() !== session.user?.id) {
        return NextResponse.json(
          { error: 'You can only delete tasks you created' },
          { status: 403 }
        );
      }
    }

    await Task.findByIdAndDelete(taskId);

    return NextResponse.json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting task:', error);
    return NextResponse.json(
      { error: 'Failed to delete task' },
      { status: 500 }
    );
  }
}
