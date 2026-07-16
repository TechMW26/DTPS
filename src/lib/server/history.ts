import { History } from '@/lib/db/models/History';
import User from '@/lib/db/models/User';
import connectDB from '../db/connection';

export type HistoryAction = 'create' | 'update' | 'delete' | 'upload' | 'assign' | 'download' | 'view';
export type HistoryCategory = 'profile' | 'medical' | 'lifestyle' | 'diet' | 'payment' | 'appointment' | 'document' | 'assignment' | 'other' | 'journal' | 'plan';

interface HistoryLogInput {
  userId: string;
  action: HistoryAction;
  category: HistoryCategory;
  description: string;
  performedById?: string;
  performedByName?: string;
  performedByEmail?: string;
  performedByRole?: string;
  changeDetails?: Array<{ fieldName: string; oldValue: any; newValue: any }>;
  metadata?: Record<string, any>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function logHistoryServer(input: HistoryLogInput) {
  try {
    await connectDB();

    let performerName = input.performedByName;
    let performerEmail = input.performedByEmail;
    let performerRole = input.performedByRole;

    if (input.performedById && (!performerName || !performerRole)) {
      const performer = await User.findById(input.performedById)
        .select('firstName lastName email role')
        .lean();

      const performerDoc = performer as { firstName?: string; lastName?: string; email?: string; role?: string } | null;

      if (performerDoc) {
        performerName = `${performerDoc.firstName || ''} ${performerDoc.lastName || ''}`.trim();
        performerEmail = performerDoc.email;
        performerRole = performerDoc.role;
      }
    }

    await History.create({
      userId: input.userId,
      action: input.action,
      category: input.category,
      description: input.description,
      changeDetails: input.changeDetails || [],
      performedBy: input.performedById
        ? {
            userId: input.performedById,
            name: performerName,
            email: performerEmail,
            role: performerRole,
          }
        : undefined,
      metadata: input.metadata,
      ipAddress: input.ipAddress || undefined,
      userAgent: input.userAgent || undefined,
    });
  } catch (error) {
    console.error('Failed to log history (server):', error);
  }
}
