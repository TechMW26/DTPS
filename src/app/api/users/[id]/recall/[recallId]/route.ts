import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import DietaryRecall from '@/lib/db/models/DietaryRecall';

// PUT /api/users/[id]/recall/[recallId] - Update a specific meal in the meals array
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; recallId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { id: userId, recallId } = await params;
    const body = await request.json();

    // Find the dietary recall document
    const recall = await DietaryRecall.findOne({ _id: recallId, userId });

    if (!recall) {
      return NextResponse.json(
        { error: 'Dietary recall not found' },
        { status: 404 }
      );
    }

    // Update or add the meal entry
    const mealIndex = recall.meals.findIndex(
      (meal: any) => meal.mealType === body.mealType
    );

    const mealEntry = {
      mealType: body.mealType,
      hour: body.hour,
      minute: body.minute,
      meridian: body.meridian,
      food: body.food || '',
      amount: body.amount || '',
      notes: body.notes || ''
    };

    if (mealIndex >= 0) {
      // Update existing meal
      recall.meals[mealIndex] = mealEntry;
    } else {
      // Add new meal
      recall.meals.push(mealEntry);
    }

    await recall.save();

    return NextResponse.json({ success: true, recall }, { status: 200 });
  } catch (error) {
    console.error('Error updating dietary recall:', error);
    return NextResponse.json(
      { error: 'Failed to update dietary recall' },
      { status: 500 }
    );
  }
}

// DELETE /api/users/[id]/recall/[recallId] - Delete a specific meal from the meals array
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; recallId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { id: userId, recallId } = await params;
    const { searchParams } = new URL(request.url);
    const mealType = searchParams.get('mealType');

    if (!mealType) {
      return NextResponse.json(
        { error: 'mealType query parameter required' },
        { status: 400 }
      );
    }

    // Find the dietary recall document
    const recall = await DietaryRecall.findOne({ _id: recallId, userId });

    if (!recall) {
      return NextResponse.json(
        { error: 'Dietary recall not found' },
        { status: 404 }
      );
    }

    // Remove the meal from the array
    recall.meals = recall.meals.filter(
      (meal: any) => meal.mealType !== mealType
    );

    await recall.save();

    return NextResponse.json(
      { success: true, message: 'Meal entry deleted' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting meal entry:', error);
    return NextResponse.json(
      { error: 'Failed to delete meal entry' },
      { status: 500 }
    );
  }
}
