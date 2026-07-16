import { NextRequest, NextResponse } from 'next/server';

// Group chat functionality is disabled - all endpoints return 403

// GET /api/messages/groups/[groupId]/messages - DISABLED
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  return NextResponse.json(
    { error: 'Group chat functionality is disabled', messages: [] },
    { status: 403 }
  );
}

// POST /api/messages/groups/[groupId]/messages - DISABLED
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  return NextResponse.json(
    { error: 'Group chat functionality is disabled' },
    { status: 403 }
  );
}
