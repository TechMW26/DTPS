import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { onlineStatusManager, typingManager } from '@/lib/realtime/online-status';

// GET /api/realtime/status - Get online status and typing indicators
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userIds = searchParams.get('userIds')?.split(',') || [];
    const checkTyping = searchParams.get('checkTyping') === 'true';

    let result: any = {};

    if (userIds.length > 0) {
      // Get status for specific users
      result.users = onlineStatusManager.getBulkOnlineStatus(userIds);
      
      if (checkTyping) {
        result.typing = {};
        userIds.forEach(userId => {
          result.typing[userId] = typingManager.isUserTyping(userId, session.user.id);
        });
      }
    } else {
      // Get all online users
      result.onlineUsers = onlineStatusManager.getOnlineUsers();
      result.onlineCount = onlineStatusManager.getOnlineUsersCount();
      
      if (checkTyping) {
        result.usersTypingToMe = typingManager.getUsersTypingTo(session.user.id);
      }
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('Error fetching online status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch online status' },
      { status: 500 }
    );
  }
}

// POST /api/realtime/status - Update user's last seen
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }


    let action: string | undefined;
    
    try {
      const body = await request.json();
      action = body?.action;
    } catch {
      // Some callers occasionally send an empty body; treat it as a heartbeat.
      action = 'heartbeat';
    }

    if (!action) action = 'heartbeat';

    switch (action) {
      case 'heartbeat':
        // Update last seen time
        onlineStatusManager.updateLastSeen(session.user.id);
        break;
        
      case 'away':
        // Mark user as away (but still online)
        onlineStatusManager.updateLastSeen(session.user.id);
        break;
        
      case 'back':
        // Mark user as back and active
        onlineStatusManager.updateLastSeen(session.user.id);
        break;
        
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error updating online status:', error);
    return NextResponse.json(
      { error: 'Failed to update online status' },
      { status: 500 }
    );
  }
}
