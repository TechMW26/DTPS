import { NextRequest, NextResponse } from 'next/server';

// Group chat functionality is disabled - all endpoints return 403

// GET /api/messages/groups/[groupId] - DISABLED
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  return NextResponse.json(
    { error: 'Group chat functionality is disabled' },
    { status: 403 }
  );
}

// PUT /api/messages/groups/[groupId] - DISABLED
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  return NextResponse.json(
    { error: 'Group chat functionality is disabled' },
    { status: 403 }
  );
}

// DELETE /api/messages/groups/[groupId] - DISABLED
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  return NextResponse.json(
    { error: 'Group chat functionality is disabled' },
    { status: 403 }
  );
}

