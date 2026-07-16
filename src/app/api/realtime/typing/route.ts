import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { socketManager } from '@/lib/realtime/socket-manager';
import { typingManager } from '@/lib/realtime/online-status';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { receiverId, isTyping } = await request.json();
    
    if (!receiverId) {
      return NextResponse.json({ error: 'Receiver ID is required' }, { status: 400 });
    }

    const eventType = isTyping ? 'typing_start' : 'typing_stop';

    // Update typing manager
    if (isTyping) {
      typingManager.setUserTyping(session.user.id, receiverId);
    } else {
      typingManager.setUserNotTyping(session.user.id);
    }

    // For health counselors, show "Dietitian" instead of their actual role
    // This hides the health counselor role from clients
    const displayRole = session.user.role === 'health_counselor' ? 'Dietitian' : session.user.role;
    const displayName = session.user.role === 'health_counselor' 
      ? 'Dietitian' // Show generic "Dietitian" to clients
      : `${session.user.firstName} ${session.user.lastName}`;

    // Send typing indicator to the receiver
    socketManager.sendToUser(receiverId, eventType, {
      userId: session.user.id,
      userName: displayName,
      userRole: displayRole,
      // Also send real info for internal use (dietitian/admin can see who is actually typing)
      actualUserId: session.user.id,
      actualUserName: `${session.user.firstName} ${session.user.lastName}`,
      actualUserRole: session.user.role,
      timestamp: Date.now()
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Typing indicator error:', error);
    return NextResponse.json(
      { error: 'Failed to send typing indicator' },
      { status: 500 }
    );
  }
}
