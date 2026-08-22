import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import mongoose from 'mongoose';
import { logHistoryServer } from '@/lib/server/history';
import { NOTE_TOPIC_TYPES } from '@/lib/constants/notes';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import ClientNote from '@/lib/db/models/ClientNote';

// GET /api/users/[id]/notes - Get all notes for a client
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

    // If user is a client, only show notes marked as showToClient
    const isClient = session.user.role === 'client';
    const query: any = { client: clientObjectId };

    if (isClient) {
      query.showToClient = true;
    }
    // HC and Dietitian can see ALL notes but can only delete their own (handled in DELETE)

    const notes = await withCache(
      `users:id:notes:${JSON.stringify(query)}`,
      async () => await ClientNote.find(query)
        .populate('createdBy', 'firstName lastName')
        .sort({ createdAt: -1 })
      ,
      {
        ttl: 120000,
        tags: ['users', `users:id:${id}`, `users:id:notes:${id}`, 'client', `client:${id}`]
      }
    );

    return NextResponse.json({
      success: true,
      notes: notes.map((note: any) => ({
        _id: note._id.toString(),
        topicType: note.topicType || 'General',
        date: note.date,
        content: note.content,
        showToClient: note.showToClient,
        attachments: note.attachments || [],
        createdAt: note.createdAt,
        createdBy: note.createdBy ? {
          _id: note.createdBy._id?.toString(),
          firstName: note.createdBy.firstName,
          lastName: note.createdBy.lastName
        } : null
      })),
      topicTypes: NOTE_TOPIC_TYPES
    });

  } catch (error) {
    console.error('Error fetching notes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notes' },
      { status: 500 }
    );
  }
}

// POST /api/users/[id]/notes - Create a new note
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Admins, dietitians, and health counselors can create notes
    const allowedRoles = ['admin', 'dietitian', 'health_counselor'];
    const userRole = session.user.role?.toLowerCase();
    if (!allowedRoles.includes(userRole)) {
      return NextResponse.json({ error: 'Access denied. Only admin, dietitian, and health counselor can create notes.' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { topicType, date, content, showToClient, attachments } = body;

    if (!content) {
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      );
    }

    await connectDB();

    const clientObjectId = new mongoose.Types.ObjectId(id);
    const createdByObjectId = new mongoose.Types.ObjectId(session.user.id);
    const rawOperationId = request.headers.get('x-idempotency-key')?.trim();
    const operationId = rawOperationId && /^[a-zA-Z0-9._:-]{8,128}$/.test(rawOperationId)
      ? rawOperationId
      : undefined;

    if (operationId) {
      const existingNote = await ClientNote.findOne({
        client: clientObjectId,
        createdBy: createdByObjectId,
        operationId,
      }).populate('createdBy', 'firstName lastName');
      if (existingNote) {
        return NextResponse.json({ success: true, note: existingNote, replayed: true });
      }
    }

    const newNote = new ClientNote({
      client: clientObjectId,
      createdBy: createdByObjectId,
      topicType: topicType || 'General',
      date: date ? new Date(date) : new Date(),
      content,
      showToClient: showToClient || false,
      attachments: attachments || [],
      operationId,
    });

    await newNote.save();
    await newNote.populate('createdBy', 'firstName lastName');

    await clearCacheByTag('users');
    await clearCacheByTag(`users:id:${id}`);
    await clearCacheByTag(`users:id:notes:${id}`);
    await clearCacheByTag('client');
    await clearCacheByTag(`client:${id}`);

    // Log history for note creation
    await logHistoryServer({
      userId: id,
      action: 'create',
      category: 'other',
      description: `Note created: ${topicType || 'General'}`,
      performedById: session.user.id,
      metadata: {
        noteId: newNote._id,
        topicType: topicType || 'General',
        hasAttachments: (attachments || []).length > 0,
        attachmentCount: (attachments || []).length
      }
    });

    return NextResponse.json({
      success: true,
      note: {
        _id: newNote._id.toString(),
        topicType: newNote.topicType,
        date: newNote.date,
        content: newNote.content,
        showToClient: newNote.showToClient,
        attachments: newNote.attachments || [],
        createdAt: newNote.createdAt,
        createdBy: newNote.createdBy ? {
          _id: (newNote.createdBy as any)._id?.toString?.() || '',
          firstName: (newNote.createdBy as any).firstName || '',
          lastName: (newNote.createdBy as any).lastName || ''
        } : null
      }
    });

  } catch (error) {
    console.error('Error creating note:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create note';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
