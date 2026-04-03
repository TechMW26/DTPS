import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { socketManager } from '@/lib/realtime/socket-manager';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// BMI Calculation Helper
function calculateBMI(weightKg: number, heightCm: number): { bmi: string; bmiCategory: string } {
  if (weightKg <= 0 || heightCm <= 0) {
    return { bmi: '', bmiCategory: '' };
  }

  const heightM = heightCm / 100;
  const bmiValue = weightKg / (heightM * heightM);
  const bmi = bmiValue.toFixed(1);

  let bmiCategory: string;
  if (bmiValue < 18.5) {
    bmiCategory = 'Underweight';
  } else if (bmiValue < 25) {
    bmiCategory = 'Normal';
  } else if (bmiValue < 30) {
    bmiCategory = 'Overweight';
  } else {
    bmiCategory = 'Obese';
  }

  return { bmi, bmiCategory };
}

// GET - Get BMI data for the current user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const user = await withCache(
      `client:bmi:${JSON.stringify(session.user.id)}`,
      async () => await User.findById(session.user.id)
        .select('weightKg heightCm bmi bmiCategory'),
      { ttl: 120000, tags: ['client'] }
    );

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const weightKg = parseFloat(user.weightKg || '0');
    const heightCm = parseFloat(user.heightCm || '0');

    // Recalculate BMI if weight and height are available
    let bmiData = { bmi: user.bmi || '', bmiCategory: user.bmiCategory || '' };

    if (weightKg > 0 && heightCm > 0) {
      bmiData = calculateBMI(weightKg, heightCm);

      // Update user if BMI has changed
      if (bmiData.bmi !== user.bmi || bmiData.bmiCategory !== user.bmiCategory) {
        await User.findByIdAndUpdate(session.user.id, {
          bmi: bmiData.bmi,
          bmiCategory: bmiData.bmiCategory
        });
      }
    }

    return NextResponse.json({
      weightKg: user.weightKg || '',
      heightCm: user.heightCm || '',
      bmi: bmiData.bmi,
      bmiCategory: bmiData.bmiCategory
    });
  } catch (error) {
    console.error('BMI GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch BMI data' }, { status: 500 });
  }
}

// PUT - Update weight/height and recalculate BMI
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const data = await request.json();

    const { weightKg, heightCm } = data;

    const updateData: Record<string, any> = {};

    if (heightCm !== undefined) {
      updateData.heightCm = String(heightCm);
    }

    // Get current user data to calculate BMI
    const currentUser = await withCache(
      `client:bmi:${JSON.stringify(session.user.id)}`,
      async () => await User.findById(session.user.id).select('weightKg heightCm firstWeight'),
      { ttl: 120000, tags: ['client'] }
    );

    if (weightKg !== undefined) {
      const incomingWeight = parseFloat(String(weightKg));
      if (!Number.isFinite(incomingWeight) || incomingWeight <= 0) {
        return NextResponse.json({ error: 'Weight must be a positive number' }, { status: 400 });
      }

      const firstWeightValue = Number(currentUser?.firstWeight?.value || 0);
      const legacyWeightValue = parseFloat(String(currentUser?.weightKg || '0'));
      const hasBaseline = (Number.isFinite(firstWeightValue) && firstWeightValue > 0)
        || (Number.isFinite(legacyWeightValue) && legacyWeightValue > 0);

      if (hasBaseline) {
        const baseline = (Number.isFinite(firstWeightValue) && firstWeightValue > 0)
          ? firstWeightValue
          : legacyWeightValue;

        if (Math.abs(incomingWeight - baseline) > 0.0001) {
          return NextResponse.json(
            { error: 'Your starting weight is locked. Please contact your dietitian to update it.' },
            { status: 403 }
          );
        }

        if (!(Number.isFinite(firstWeightValue) && firstWeightValue > 0) && Number.isFinite(legacyWeightValue) && legacyWeightValue > 0) {
          updateData.firstWeight = {
            value: legacyWeightValue,
            setBy: 'client',
            setDate: new Date(),
            isLocked: true,
            lastUpdatedBy: 'client',
            lastUpdateDate: new Date(),
          };
        }
      } else {
        updateData.firstWeight = {
          value: incomingWeight,
          setBy: 'client',
          setDate: new Date(),
          isLocked: true,
          lastUpdatedBy: 'client',
          lastUpdateDate: new Date(),
        };
      }

      updateData.weightKg = String(incomingWeight);
      updateData.weight = incomingWeight;
    }

    const finalWeightKg = parseFloat(weightKg !== undefined ? String(weightKg) : currentUser?.weightKg || '0');
    const finalHeightCm = parseFloat(heightCm !== undefined ? String(heightCm) : currentUser?.heightCm || '0');

    // Calculate BMI if both weight and height are available
    if (finalWeightKg > 0 && finalHeightCm > 0) {
      const bmiData = calculateBMI(finalWeightKg, finalHeightCm);
      updateData.bmi = bmiData.bmi;
      updateData.bmiCategory = bmiData.bmiCategory;
    }

    const user = await User.findByIdAndUpdate(
      session.user.id,
      updateData,
      { new: true, runValidators: true }
    ).select('weightKg heightCm bmi bmiCategory');

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const responseData = {
      weightKg: user.weightKg || '',
      heightCm: user.heightCm || '',
      bmi: user.bmi || '',
      bmiCategory: user.bmiCategory || ''
    };

    // Send SSE update to the user for real-time BMI display
    try {
      socketManager.sendToUser(session.user.id, 'bmi_update', {
        ...responseData,
        timestamp: Date.now()
      });
    } catch (sseError) {
      console.warn('SSE notification failed:', sseError);
    }

    return NextResponse.json({
      success: true,
      ...responseData
    });
  } catch (error) {
    console.error('BMI PUT error:', error);
    return NextResponse.json({ error: 'Failed to update BMI data' }, { status: 500 });
  }
}
