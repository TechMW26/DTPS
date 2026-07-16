import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import MessageGroup from '@/lib/db/models/MessageGroup';
import GroupMessage from '@/lib/db/models/GroupMessage';
import User from '@/lib/db/models/User';
import mongoose from 'mongoose';
import { z } from 'zod';

// Group chat functionality is disabled
// All group-related routes return 403 Forbidden

const createGroupSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(100),
  description: z.string().max(500).optional(),
  memberIds: z.array(z.string().min(1)).min(1, 'At least one member is required')
});

// GET /api/messages/groups - DISABLED: Group chat is not available
export async function GET(request: NextRequest) {
  return NextResponse.json(
    { error: 'Group chat functionality is disabled', groups: [] },
    { status: 403 }
  );
  
  // Original implementation kept for reference but disabled
  /*
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const userId = new mongoose.Types.ObjectId(session.user.id);

    const groups = await MessageGroup.aggregate([
      {
        $match: {
          'members.user': userId,
          isActive: true
        }
      },
      {
        $lookup: {
          from: 'groupmessages',
          let: { groupId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$group', '$$groupId'] } } },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
            {
              $lookup: {
                from: 'users',
                localField: 'sender',
                foreignField: '_id',
                as: 'senderInfo',
                pipeline: [{ $project: { firstName: 1, lastName: 1, avatar: 1 } }]
              }
            },
            { $unwind: { path: '$senderInfo', preserveNullAndEmptyArrays: true } }
          ],
          as: 'lastMessages'
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'members.user',
          foreignField: '_id',
          as: 'memberDetails',
          pipeline: [{ $project: { firstName: 1, lastName: 1, avatar: 1, role: 1 } }]
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: '_id',
          as: 'creatorDetails',
          pipeline: [{ $project: { firstName: 1, lastName: 1, avatar: 1 } }]
        }
      },
      {
        $addFields: {
          lastMessage: { $arrayElemAt: ['$lastMessages', 0] },
          creator: { $arrayElemAt: ['$creatorDetails', 0] },
          memberCount: { $size: '$members' },
          // Calculate unread count for current user
          unreadCount: {
            $let: {
              vars: {
                currentMember: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$members',
                        cond: { $eq: ['$$this.user', userId] }
                      }
                    },
                    0
                  ]
                }
              },
              in: {
                $cond: {
                  if: { $and: [{ $gt: [{ $size: '$lastMessages' }, 0] }, '$$currentMember.lastReadAt'] },
                  then: 0, // Simplified; real count done in separate query
                  else: 0
                }
              }
            }
          }
        }
      },
      {
        $project: {
          name: 1,
          description: 1,
          avatar: 1,
          createdBy: 1,
          creator: 1,
          members: 1,
          memberDetails: 1,
          memberCount: 1,
          lastMessage: 1,
          lastMessageAt: 1,
          createdAt: 1,
          updatedAt: 1
        }
      },
      { $sort: { lastMessageAt: -1, createdAt: -1 } }
    ]);

    // Calculate actual unread counts per group
    for (const group of groups) {
      const member = group.members.find((m: any) => m.user.toString() === session.user.id);
      const lastReadAt = member?.lastReadAt;
      
      if (lastReadAt) {
        group.unreadCount = await GroupMessage.countDocuments({
          group: group._id,
          createdAt: { $gt: lastReadAt },
          sender: { $ne: userId }
        });
      } else {
        // Never read - count all messages not sent by user
        group.unreadCount = await GroupMessage.countDocuments({
          group: group._id,
          sender: { $ne: userId }
        });
      }
    }

    return NextResponse.json({ groups });

  } catch (error) {
    console.error('Error fetching groups:', error);
    return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 });
  }
  */
}

// POST /api/messages/groups - DISABLED: Group chat is not available
export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: 'Group chat functionality is disabled' },
    { status: 403 }
  );
}
