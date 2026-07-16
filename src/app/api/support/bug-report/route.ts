import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// Bug report schema
interface BugReport {
  title: string;
  category: 'ui' | 'performance' | 'crash' | 'feature' | 'security' | 'other';
  description: string;
  steps?: string;
  expectedBehavior?: string;
  deviceInfo?: string;
  screenshots: string[];
  userId?: string;
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: Date;
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    const body = await request.json();

    const { 
      title, 
      category, 
      description, 
      steps, 
      expectedBehavior, 
      deviceInfo,
      screenshots = []
    } = body;

    // Validate required fields
    if (!title || !description) {
      return NextResponse.json(
        { error: 'Title and description are required' },
        { status: 400 }
      );
    }

    // Validate category
    const validCategories = ['ui', 'performance', 'crash', 'feature', 'security', 'other'];
    if (category && !validCategories.includes(category)) {
      return NextResponse.json(
        { error: 'Invalid category' },
        { status: 400 }
      );
    }

    // Import mongoose dynamically for the model
    const mongoose = await import('mongoose');
    
    // Define schema if not exists
    const BugReportSchema = new mongoose.Schema({
      title: { type: String, required: true },
      category: { 
        type: String, 
        enum: ['ui', 'performance', 'crash', 'feature', 'security', 'other'],
        default: 'other'
      },
      description: { type: String, required: true },
      steps: { type: String },
      expectedBehavior: { type: String },
      deviceInfo: { type: String },
      screenshots: [{ type: String }],
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      userEmail: { type: String },
      status: { 
        type: String, 
        enum: ['open', 'in-progress', 'resolved', 'closed'],
        default: 'open'
      },
      priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
      },
      assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      resolution: { type: String },
      resolvedAt: { type: Date },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    });

    const BugReport = mongoose.models.BugReport || 
      mongoose.model('BugReport', BugReportSchema);

    // Determine priority based on category
    let priority: 'low' | 'medium' | 'high' | 'critical' = 'medium';
    if (category === 'crash' || category === 'security') {
      priority = 'high';
    } else if (category === 'performance') {
      priority = 'medium';
    } else if (category === 'ui' || category === 'feature') {
      priority = 'low';
    }

    // Create bug report
    const bugReport = await BugReport.create({
      title,
      category: category || 'other',
      description,
      steps: steps || '',
      expectedBehavior: expectedBehavior || '',
      deviceInfo: deviceInfo || '',
      screenshots,
      userId: session?.user?.id || null,
      userEmail: session?.user?.email || null,
      status: 'open',
      priority,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return NextResponse.json({
      success: true,
      message: 'Bug report submitted successfully',
      reportId: bugReport._id,
      priority
    });

  } catch (error) {
    console.error('Error submitting bug report:', error);
    return NextResponse.json(
      { error: 'Failed to submit bug report' },
      { status: 500 }
    );
  }
}

// GET route to fetch bug reports (admin only)
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    
    if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const mongoose = await import('mongoose');
    
    const BugReportSchema = new mongoose.Schema({
      title: { type: String, required: true },
      category: { 
        type: String, 
        enum: ['ui', 'performance', 'crash', 'feature', 'security', 'other'],
        default: 'other'
      },
      description: { type: String, required: true },
      steps: { type: String },
      expectedBehavior: { type: String },
      deviceInfo: { type: String },
      screenshots: [{ type: String }],
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      userEmail: { type: String },
      status: { 
        type: String, 
        enum: ['open', 'in-progress', 'resolved', 'closed'],
        default: 'open'
      },
      priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
      },
      assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      resolution: { type: String },
      resolvedAt: { type: Date },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    });

    const BugReport = mongoose.models.BugReport || 
      mongoose.model('BugReport', BugReportSchema);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const category = searchParams.get('category');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const query: Record<string, unknown> = {};
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (category) query.category = category;

    const reports = await withCache(
      `support:bug-report:${JSON.stringify(query)}:page=${page}:limit=${limit}`,
      async () => await BugReport.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('userId', 'name email')
      .populate('assignedTo', 'name email'),
      { ttl: 120000, tags: ['support'] }
    );

    const total = await BugReport.countDocuments(query);

    // Get stats
    const stats = {
      total: await BugReport.countDocuments({}),
      open: await BugReport.countDocuments({ status: 'open' }),
      inProgress: await BugReport.countDocuments({ status: 'in-progress' }),
      resolved: await BugReport.countDocuments({ status: 'resolved' }),
      critical: await BugReport.countDocuments({ priority: 'critical', status: { $ne: 'closed' } })
    };

    return NextResponse.json({
      reports,
      stats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching bug reports:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bug reports' },
      { status: 500 }
    );
  }
}

// PATCH route to update bug report status (admin only)
export async function PATCH(request: NextRequest) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    
    if (!session?.user || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { reportId, status, priority, resolution, assignedTo } = body;

    if (!reportId) {
      return NextResponse.json(
        { error: 'Report ID is required' },
        { status: 400 }
      );
    }

    const mongoose = await import('mongoose');
    
    const BugReportSchema = new mongoose.Schema({
      title: { type: String, required: true },
      category: { type: String },
      description: { type: String, required: true },
      steps: { type: String },
      expectedBehavior: { type: String },
      deviceInfo: { type: String },
      screenshots: [{ type: String }],
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      userEmail: { type: String },
      status: { type: String, default: 'open' },
      priority: { type: String, default: 'medium' },
      assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      resolution: { type: String },
      resolvedAt: { type: Date },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    });

    const BugReport = mongoose.models.BugReport || 
      mongoose.model('BugReport', BugReportSchema);

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    
    if (status) {
      updateData.status = status;
      if (status === 'resolved') {
        updateData.resolvedAt = new Date();
      }
    }
    if (priority) updateData.priority = priority;
    if (resolution) updateData.resolution = resolution;
    if (assignedTo) updateData.assignedTo = assignedTo;

    const report = await BugReport.findByIdAndUpdate(
      reportId,
      updateData,
      { new: true }
    ).populate('userId', 'name email')
     .populate('assignedTo', 'name email');

    if (!report) {
      return NextResponse.json(
        { error: 'Bug report not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      report
    });

  } catch (error) {
    console.error('Error updating bug report:', error);
    return NextResponse.json(
      { error: 'Failed to update bug report' },
      { status: 500 }
    );
  }
}
