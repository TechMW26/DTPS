/**
 * API Route: Sync Payment Status (Legacy compatibility)
 * PUT /api/admin/payments/sync-status
 * 
 * With UnifiedPayment, this endpoint is mostly deprecated since payment and purchase
 * are now the same record. This endpoint is kept for backward compatibility.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';

export const runtime = 'nodejs';

interface SyncResult {
  processed: number;
  updated: number;
  failed: number;
  errors: Array<{
    paymentId: string;
    error: string;
  }>;
}

export async function PUT(request: NextRequest) {
  try {
    // Auth check - admin only
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await connectDB();

    const result: SyncResult = {
      processed: 0,
      updated: 0,
      failed: 0,
      errors: []
    };

    // With UnifiedPayment, we just need to ensure status fields are consistent
    // Find payments where status and paymentStatus might be out of sync
    const paymentsToSync: any[] = await UnifiedPayment.find({
      $or: [
        { paymentStatus: 'paid', status: { $ne: 'paid' } },
        { paymentStatus: 'completed', status: { $ne: 'paid' } },
        { status: 'paid', paymentStatus: { $ne: 'paid' } }
      ]
    }).lean();

    console.log(`[Payment Sync] Found ${paymentsToSync.length} payments to sync`);

    // Process each payment
    for (const payment of paymentsToSync) {
      result.processed++;

      try {
        const paymentId = (payment as any)._id?.toString() || 'unknown';

        // Sync status fields
        const isPaid = payment.paymentStatus === 'paid' || payment.paymentStatus === 'completed' || payment.status === 'paid';

        // Fetch and save (triggers pre-save hook which auto-sets expectedStartDate/expectedEndDate)
        const doc = await UnifiedPayment.findById(payment._id);
        if (doc) {
          doc.status = isPaid ? 'paid' : doc.status;
          doc.paymentStatus = isPaid ? 'paid' : doc.paymentStatus;
          await doc.save();
          result.updated++;
          console.log(`[Payment Sync] ✓ Updated UnifiedPayment ${paymentId}`);
        } else {
          result.failed++;
          result.errors.push({
            paymentId,
            error: 'Payment not found'
          });
        }
      } catch (error: any) {
        result.failed++;
        result.errors.push({
          paymentId: (payment as any)._id?.toString() || 'unknown',
          error: error.message || 'Unknown error'
        });
        console.error(`[Payment Sync] ✗ Error syncing payment ${(payment as any)._id}:`, error);
      }
    }

    console.log(`[Payment Sync] Complete - Processed: ${result.processed}, Updated: ${result.updated}, Failed: ${result.failed}`);

    return NextResponse.json({
      success: true,
      message: `Synced ${result.updated} payment records`,
      result
    });

  } catch (error: any) {
    console.error('Payment sync error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Server error',
        message: error.message
      },
      { status: 500 }
    );
  }
}
