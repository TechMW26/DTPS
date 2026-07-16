import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import mongoose from 'mongoose';
import Task from '@/lib/db/models/Task';
import { logHistoryServer } from '@/lib/server/history';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/users/[id]/tasks/[taskId] - Get a specific task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, taskId } = await params;
    await connectDB();

    const task = await withCache(
      `users:id:tasks:taskId:${id}:${taskId}`,
      async () => await Task.findOne({
      _id: new mongoose.Types.ObjectId(taskId),
      client: new mongoose.Types.ObjectId(id)
    })
      .populate('dietitian', 'firstName lastName email')
      .populate('tags', 'name color icon')
      ,
      { ttl: 60000, tags: ['users'] }
    );

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch (error) {
    console.error('Error fetching task:', error);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
}

// PATCH /api/users/[id]/tasks/[taskId] - Update a task
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, taskId } = await params;
    const body = await request.json();

    if (Array.isArray(body.tags)) {
      body.tags = body.tags.slice(0, 1);
    }
    
    await connectDB();

    const task = await withCache(
      `users:id:tasks:taskId:${JSON.stringify({
      _id: new mongoose.Types.ObjectId(taskId),
      client: new mongoose.Types.ObjectId(id)
    })}`,
      async () => await Task.findOne({
      _id: new mongoose.Types.ObjectId(taskId),
      client: new mongoose.Types.ObjectId(id)
    }),
      { ttl: 60000, tags: ['users'] }
    );

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Update allowed fields
    const allowedFields = [
      'taskType', 'title', 'description', 'startDate', 'endDate',
      'allottedTime', 'repeatFrequency', 'notifyClientOnChat',
      'notifyDieticianOnCompletion', 'status', 'tags'
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'startDate' || field === 'endDate') {
          (task as any)[field] = new Date(body[field]);
        } else if (field === 'tags' && Array.isArray(body[field])) {
          (task as any)[field] = body[field].slice(0, 1);
        } else {
          (task as any)[field] = body[field];
        }
      }
    }

    await task.save();

    // Populate for response
    const updatedTask = await withCache(
      `users:id:tasks:taskId:${JSON.stringify(task._id)}`,
      async () => await Task.findById(task._id)
      .populate('dietitian', 'firstName lastName email')
      .populate('tags', 'name color icon')
      ,
      { ttl: 60000, tags: ['users'] }
    );

    // Log history
    await logHistoryServer({
      userId: id,
      action: 'update',
      category: 'other',
      description: `Task "${task.taskType}" updated`,
      performedById: session.user.id,
      metadata: {
        taskId: task._id.toString(),
        updatedFields: Object.keys(body)
      }
    });

    return NextResponse.json({ 
      message: 'Task updated successfully',
      task: updatedTask
    });
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

// DELETE /api/users/[id]/tasks/[taskId] - Delete a task
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, taskId } = await params;
    await connectDB();

    // Build delete query - HC and dietitian can only delete their own tasks (admin can delete any)
    const deleteQuery: any = {
      _id: new mongoose.Types.ObjectId(taskId),
      client: new mongoose.Types.ObjectId(id)
    };

    const userRole = session.user.role?.toLowerCase();
    // Both health_counselor and dietitian can only delete tasks they created
    if (userRole === 'health_counselor' || userRole === 'dietitian') {
      deleteQuery.dietitian = new mongoose.Types.ObjectId(session.user.id);
    }

    const task = await Task.findOneAndDelete(deleteQuery);

    if (!task) {
      return NextResponse.json({ error: 'Task not found or you do not have permission to delete it' }, { status: 404 });
    }

    // Log history
    await logHistoryServer({
      userId: id,
      action: 'delete',
      category: 'other',
      description: `Task "${task.taskType}" deleted`,
      performedById: session.user.id,
      metadata: {
        taskId: taskId,
        taskType: task.taskType
      }
    });

    return NextResponse.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
