/**
 * API Route: Admin Recipe Update (Optimized)
 * PATCH /api/admin/recipes/update
 * 
 * Update existing recipes only using:
 * - $set for scalar fields
 * - $push/$addToSet for array fields
 * - Transaction support for consistency
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import Recipe from '@/lib/db/models/Recipe';
import mongoose from 'mongoose';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface UpdateOperation {
  _id?: string;
  name?: string;
  updates: Record<string, any>;
}

interface UpdateResult {
  success: boolean;
  message: string;
  stats: {
    total: number;
    updated: number;
    notFound: number;
    failed: number;
  };
  errors: Array<{
    identifier: string;
    error: string;
  }>;
}

export async function PATCH(request: NextRequest) {
  try {
    // Auth check - admin only
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const operations: UpdateOperation[] = Array.isArray(body) ? body : [body];

    if (operations.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No update operations provided' },
        { status: 400 }
      );
    }

    await connectDB();

    const result: UpdateResult = {
      success: true,
      message: '',
      stats: { total: operations.length, updated: 0, notFound: 0, failed: 0 },
      errors: []
    };

    // Use MongoDB session for transaction
    const mongoSession = await mongoose.startSession();

    try {
      await mongoSession.withTransaction(async () => {
        for (const op of operations) {
          try {
            const identifier = op._id || op.name || 'unknown';

            // Build query filter
            let filter: Record<string, any> = {};
            if (op._id && mongoose.Types.ObjectId.isValid(op._id)) {
              filter = { _id: new mongoose.Types.ObjectId(op._id) };
            } else if (op.name) {
              filter = { name: op.name };
            } else {
              result.stats.failed++;
              result.errors.push({
                identifier,
                error: 'No valid identifier (_id or name) provided'
              });
              continue;
            }

            // Find existing recipe
            const existing = await Recipe.findOne(filter, {}, { session: mongoSession });

            if (!existing) {
              result.stats.notFound++;
              result.errors.push({
                identifier,
                error: `Recipe not found`
              });
              continue;
            }

            // Prepare updates - separate scalar and array operations
            const scalarUpdates: Record<string, any> = {};
            const arrayOps: Record<string, any> = {};

            for (const [field, value] of Object.entries(op.updates)) {
              // Skip internal fields
              if (['_id', 'createdAt', 'uuid'].includes(field)) continue;

              // Handle array fields
              if (['ingredients', 'instructions', 'tags', 'dietaryRestrictions', 'allergens', 'medicalContraindications'].includes(field)) {
                if (Array.isArray(value)) {
                  // Replace entire array
                  scalarUpdates[field] = value;
                } else if (typeof value === 'object' && value.mode) {
                  // Support $push or $addToSet operations
                  if (value.mode === 'push') {
                    arrayOps[field] = { $push: { [field]: { $each: Array.isArray(value.items) ? value.items : [value.items] } } };
                  } else if (value.mode === 'addToSet') {
                    arrayOps[field] = { $addToSet: { [field]: { $each: Array.isArray(value.items) ? value.items : [value.items] } } };
                  }
                }
              } else {
                // Scalar field
                scalarUpdates[field] = value;
              }
            }

            // Apply scalar updates using $set
            if (Object.keys(scalarUpdates).length > 0) {
              scalarUpdates.updatedAt = new Date();
              
              await Recipe.findByIdAndUpdate(
                existing._id,
                { $set: scalarUpdates },
                {
                  session: mongoSession,
                  new: true,
                  runValidators: true
                }
              );
            }

            // Apply array operations
            for (const [field, operation] of Object.entries(arrayOps)) {
              await Recipe.findByIdAndUpdate(
                existing._id,
                operation,
                {
                  session: mongoSession,
                  new: true
                }
              );
            }

            if (Object.keys(scalarUpdates).length > 0 || Object.keys(arrayOps).length > 0) {
              result.stats.updated++;
            } else {
              result.stats.failed++;
              result.errors.push({
                identifier,
                error: 'No valid updates provided'
              });
            }

          } catch (error: any) {
            result.stats.failed++;
            result.errors.push({
              identifier: op._id || op.name || 'unknown',
              error: error.message || 'Unknown error'
            });
          }
        }
      });

      result.message = `Update completed: ${result.stats.updated} updated, ${result.stats.notFound} not found, ${result.stats.failed} failed`;
    } catch (error: any) {
      console.error('Transaction error:', error);
      result.success = false;
      result.message = `Transaction failed: ${error.message}`;
      result.stats.failed = operations.length;
      result.errors.push({
        identifier: 'transaction',
        error: error.message || 'Transaction failed'
      });
    } finally {
      await mongoSession.endSession();
    }

    return NextResponse.json(result, {
      status: result.success ? 200 : 400
    });

  } catch (error: any) {
    console.error('Update error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Server error',
        message: error.message,
        stats: { total: 0, updated: 0, notFound: 0, failed: 0 },
        errors: []
      },
      { status: 500 }
    );
  }
}
