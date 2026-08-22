  import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import mongoose from 'mongoose';
import Task from '@/lib/db/models/Task';
import '@/lib/db/models/Tag';
import { logHistoryServer } from '@/lib/server/history';
import { TASK_TYPES, TIME_OPTIONS } from '@/lib/constants/tasks';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// GET /api/users/[id]/tasks - Get all tasks for a client
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await connectDB();

    const clientObjectId = new mongoose.Types.ObjectId(id);

    // Get tasks for this client
    const tasks = await withCache(
      `users:id:tasks:${JSON.stringify({ client: clientObjectId })}`,
      async () => await Task.find({ client: clientObjectId })
      .populate('dietitian', 'firstName lastName email')
      .populate('tags', 'name color icon')
      .sort({ createdAt: -1 })
      ,
      { ttl: 60000, tags: ['users'] }
    );

    return NextResponse.json({ 
      tasks,
      count: tasks.length
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

// POST /api/users/[id]/tasks - Create a new task for a client
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    if (Array.isArray(body.tags)) {
      body.tags = body.tags.slice(0, 1);
    }
    
    await connectDB();

    const {
      taskType,
      title,
      description,
      startDate,
      endDate,
      allottedTime,
      repeatFrequency,
      notifyClientOnChat,
      notifyDieticianOnCompletion,
      tags
    } = body;

    // Validation
    if (!taskType || !startDate || !endDate) {
      return NextResponse.json({ 
        error: 'Task type, start date, and end date are required' 
      }, { status: 400 });
    }

    // Ensure title is provided or use taskType as default
    const taskTitle = title && title.trim() ? title.trim() : taskType;

    const clientObjectId = new mongoose.Types.ObjectId(id);
    const dietitianObjectId = new mongoose.Types.ObjectId(session.user.id);
    const rawOperationId = request.headers.get('x-idempotency-key')?.trim();
    const operationId = rawOperationId && /^[a-zA-Z0-9._:-]{8,128}$/.test(rawOperationId)
      ? rawOperationId
      : undefined;

    if (operationId) {
      const existingTask = await Task.findOne({
        client: clientObjectId,
        dietitian: dietitianObjectId,
        operationId,
      })
        .populate('dietitian', 'firstName lastName email')
        .populate('tags', 'name color icon');
      if (existingTask) {
        return NextResponse.json({ message: 'Task already created', task: existingTask, replayed: true });
      }
    }

    // Create the task
    const newTask = new Task({
      client: clientObjectId,
      dietitian: dietitianObjectId,
      taskType,
      title: taskTitle,
      description: description || '',
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      allottedTime: allottedTime || '12:00 AM',
      repeatFrequency: repeatFrequency || 0,
      notifyClientOnChat: notifyClientOnChat || false,
      notifyDieticianOnCompletion: notifyDieticianOnCompletion || '',
      status: 'pending',
      tags: Array.isArray(tags) ? tags.slice(0, 1) : [],
      operationId,
    });

    await newTask.save();

    // Populate the task for response
    const populatedTask = await withCache(
      `users:id:tasks:${JSON.stringify(newTask._id)}`,
      async () => await Task.findById(newTask._id)
      .populate('dietitian', 'firstName lastName email')
      .populate('tags', 'name color icon')
      ,
      { ttl: 60000, tags: ['users'] }
    );

    // Log history
    try {
      await logHistoryServer({
        userId: id,
        action: 'create',
        category: 'other',
        description: `Task "${taskType}" created for client`,
        performedById: session.user.id,
        metadata: {
          taskId: newTask._id.toString(),
          taskType,
          startDate,
          endDate
        }
      });
    } catch (historyError) {
      console.error('Error logging history:', historyError);
      // Continue even if history logging fails
    }

    return NextResponse.json({ 
      message: 'Task created successfully',
      task: populatedTask
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating task:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create task';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

