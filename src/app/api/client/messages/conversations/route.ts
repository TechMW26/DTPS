import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import Message from '@/lib/db/models/Message';
import User from '@/lib/db/models/User';

type DietitianSummary = {
  _id: unknown;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  role?: string;
};

type ClientWithDietitian = {
  assignedDietitian?: DietitianSummary | null;
};

// A client can only use their primary dietitian chat. Querying that one pair is
// considerably cheaper than grouping the client's complete message history.
export async function GET() {
  try {
    const [session] = await Promise.all([
      getServerSession(authOptions),
      connectDB(),
    ]);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await User.findById(session.user.id)
      .select('assignedDietitian')
      .populate('assignedDietitian', 'firstName lastName avatar role')
      .lean<ClientWithDietitian | null>();

    const dietitian = client?.assignedDietitian;
    if (!dietitian?._id) {
      return NextResponse.json({ conversations: [], hasDietitian: false });
    }

    const clientId = session.user.id;
    const dietitianId = String(dietitian._id);
    const conversationQuery = {
      deletedAt: { $exists: false },
      $or: [
        { sender: clientId, receiver: dietitianId },
        { sender: dietitianId, receiver: clientId },
      ],
    };

    const [lastMessage, unreadCount] = await Promise.all([
      Message.findOne(conversationQuery)
        .select('content type createdAt isRead sender receiver')
        .sort({ createdAt: -1, _id: -1 })
        .lean(),
      Message.countDocuments({
        sender: dietitianId,
        receiver: clientId,
        isRead: false,
        deletedAt: { $exists: false },
      }),
    ]);

    return NextResponse.json({
      conversations: [
        {
          _id: dietitian._id,
          user: {
            _id: dietitian._id,
            firstName: dietitian.firstName,
            lastName: dietitian.lastName,
            avatar: dietitian.avatar,
            role: dietitian.role,
          },
          lastMessage,
          unreadCount,
        },
      ],
      hasDietitian: true,
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 },
    );
  }
}
