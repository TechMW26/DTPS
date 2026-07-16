import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { socketManager } from '@/lib/realtime/socket-manager';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId, event, data } = await req.json();

    if (!userId || !event) {
      return NextResponse.json({ error: 'Missing userId or event' }, { status: 400 });
    }

    // Send to a single user (can be extended to multiple)
    socketManager.sendToUser(userId, event, {
      ...data,
      from: session.user.id,
      timestamp: Date.now(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Realtime send error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

