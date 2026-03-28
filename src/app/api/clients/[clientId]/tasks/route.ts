import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/connection';
import Task from '@/lib/db/models/Task';
import User from '@/lib/db/models/User';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/config';
import { logActivity } from '@/lib/utils/activityLogger';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { socketManager } from '@/lib/realtime/socket-manager';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { clientId } = await params;
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let query: any = { client: clientId };

    // Health counselors can now see all tasks for the client
    // Edit/delete permissions are handled on the frontend based on who created the task

    if (status) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.startDate = {};
      if (startDate) query.startDate.$gte = new Date(startDate);
      if (endDate) query.startDate.$lte = new Date(endDate);
    }

    const tasks = await withCache(
      `clients:clientId:tasks:${JSON.stringify(query)}`,
      async () => await Task.find(query)
      .populate('client', 'firstName lastName email')
      .populate('dietitian', 'firstName lastName email')
      .populate('tags', 'name color icon')
      .sort({ startDate: 1 })
      ,
      { ttl: 60000, tags: ['clients'] }
    );

    return NextResponse.json({
      success: true,
      tasks
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { clientId } = await params;
    const body = await req.json();

    if (Array.isArray(body.tags)) {
      body.tags = body.tags.slice(0, 1);
    }

    // Validate required fields
    if (!body.taskType || !body.startDate || !body.endDate) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Ensure title is always set - use taskType as fallback if title is not provided
    const taskTitle = body.title && body.title.trim() ? body.title.trim() : body.taskType;

    // Determine creator role
    const userRole = session.user?.role?.toLowerCase();
    let creatorRole = 'dietitian';
    if (userRole === 'health_counselor') {
      creatorRole = 'health_counselor';
    } else if (userRole === 'admin') {
      creatorRole = 'admin';
    }

    // Create new task
    const task = new Task({
      ...body,
      title: taskTitle,
      client: clientId,
      dietitian: session.user?.id,
      creatorRole: creatorRole,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      tags: Array.isArray(body.tags) ? body.tags.slice(0, 1) : []
    });

    await task.save();

    // Populate references
    await task.populate('client', 'firstName lastName email');
    await task.populate('dietitian', 'firstName lastName email');
    await task.populate('tags', 'name color icon');

    // Invalidate cached task lists immediately
    clearCacheByTag('clients');

    // Real-time update for dashboards currently open
    try {
      const sessionUser = session.user as unknown as { id?: string; _id?: string };
      const creatorId = String(sessionUser?.id || sessionUser?._id || '');
      const payload = {
        taskId: task._id,
        clientId,
        timestamp: Date.now()
      };

      if (creatorId) {
        socketManager.sendToUser(creatorId, 'task_created', payload);
      }
      socketManager.sendToUser(String(clientId), 'task_created', payload);
    } catch (sseError) {
      console.error('Failed to send task SSE notification:', sseError);
      // Don't fail the request if SSE notification fails
    }

    // Log activity
    const client = await withCache(
      `clients:clientId:tasks:${JSON.stringify(clientId)}`,
      async () => await User.findById(clientId).select('firstName lastName'),
      { ttl: 60000, tags: ['clients'] }
    );
    await logActivity({
      userId: session.user?.id || '',
      userRole: (session.user?.role as any) || 'dietitian',
      userName: session.user?.name || 'Unknown',
      userEmail: session.user?.email || '',
      action: 'Created Task',
      actionType: 'create',
      category: 'task',
      description: `Created task "${taskTitle}" for ${client?.firstName} ${client?.lastName}`,
      targetUserId: clientId,
      targetUserName: client ? `${client.firstName} ${client.lastName}` : undefined,
      resourceId: task._id.toString(),
      resourceType: 'Task',
      resourceName: taskTitle
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Task created successfully',
        task
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating task:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create task' },
      { status: 500 }
    );
  }
}
