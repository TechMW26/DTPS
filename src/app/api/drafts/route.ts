import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import mongoose from 'mongoose';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || process.env.npm_package_version || '1.0.0';

// Draft Schema
const DraftSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  type: { type: String, required: true, index: true },
  draftId: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  lastSaved: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
});

// Compound index for efficient lookups
DraftSchema.index({ userId: 1, type: 1, draftId: 1 }, { unique: true });

// TTL index - auto-delete drafts after 7 days
DraftSchema.index({ lastSaved: 1 }, { expireAfterSeconds: 604800 });

// Get or create model
const Draft = mongoose.models.Draft || mongoose.model('Draft', DraftSchema);

// Standard headers
function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'X-App-Version': APP_VERSION,
  };
}

/**
 * GET /api/drafts - Get a draft
 */
export async function GET(request: NextRequest) {
  try {
    const [session] = await Promise.all([
      getServerSession(authOptions),
      connectDB(),
    ]);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: getHeaders() }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const id = searchParams.get('id');

    if (!type || !id) {
      return NextResponse.json(
        { error: 'Missing type or id parameter' },
        { status: 400, headers: getHeaders() }
      );
    }

    const draft = await Draft.findOne({
      userId: session.user.id,
      type,
      draftId: id,
    }).lean() as { draftId: string; type: string; data: any; lastSaved: Date } | null;

    if (!draft) {
      return NextResponse.json(
        { draft: null },
        { status: 200, headers: getHeaders() }
      );
    }

    return NextResponse.json(
      {
        draft: {
          id: draft.draftId,
          type: draft.type,
          data: draft.data,
          lastSaved: draft.lastSaved,
        }
      },
      { status: 200, headers: getHeaders() }
    );
  } catch (error: any) {
    console.error('GET /api/drafts error:', error);
    return NextResponse.json(
      { error: 'Failed to get draft' },
      { status: 500, headers: getHeaders() }
    );
  }
}

/**
 * POST /api/drafts - Save a draft
 */
export async function POST(request: NextRequest) {
  try {
    const [session, body] = await Promise.all([
      getServerSession(authOptions),
      request.json(),
    ]);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: getHeaders() }
      );
    }

    const { type, id, data } = body;

    if (!type || !id || !data) {
      return NextResponse.json(
        { error: 'Missing required fields: type, id, data' },
        { status: 400, headers: getHeaders() }
      );
    }

    await connectDB();

    // Upsert the draft
    const draft = await Draft.findOneAndUpdate(
      {
        userId: session.user.id,
        type,
        draftId: id,
      },
      {
        $set: {
          data,
          lastSaved: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
      }
    );

    return NextResponse.json(
      {
        success: true,
        draft: {
          id: draft.draftId,
          type: draft.type,
          lastSaved: draft.lastSaved,
        }
      },
      { status: 200, headers: getHeaders() }
    );
  } catch (error: any) {
    console.error('POST /api/drafts error:', error);
    return NextResponse.json(
      { error: 'Failed to save draft' },
      { status: 500, headers: getHeaders() }
    );
  }
}

/**
 * DELETE /api/drafts - Delete a draft
 */
export async function DELETE(request: NextRequest) {
  try {
    const [session] = await Promise.all([
      getServerSession(authOptions),
      connectDB(),
    ]);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: getHeaders() }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const id = searchParams.get('id');

    if (!type || !id) {
      return NextResponse.json(
        { error: 'Missing type or id parameter' },
        { status: 400, headers: getHeaders() }
      );
    }

    await Draft.deleteOne({
      userId: session.user.id,
      type,
      draftId: id,
    });

    return NextResponse.json(
      { success: true },
      { status: 200, headers: getHeaders() }
    );
  } catch (error: any) {
    console.error('DELETE /api/drafts error:', error);
    return NextResponse.json(
      { error: 'Failed to delete draft' },
      { status: 500, headers: getHeaders() }
    );
  }
}
