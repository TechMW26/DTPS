import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connect';
import DietTemplate from '@/lib/db/models/DietTemplate';
import { UserRole } from '@/types';
import { z } from 'zod';
import mongoose from 'mongoose';
import { withCache, clearCacheByTag, serverCache } from '@/lib/api/utils';

// Validation schema for meal type config
const mealTypeConfigSchema = z.object({
  name: z.string().min(1),
  time: z.string().optional()
});

const toFiniteNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
};

const sanitizeDietTemplateUpdatePayload = (body: any) => {
  const sanitized = { ...body };

  if ('duration' in sanitized) {
    sanitized.duration = toFiniteNumber(sanitized.duration, 1);
  }

  if ('targetCalories' in sanitized) {
    sanitized.targetCalories = {
      min: toFiniteNumber(sanitized?.targetCalories?.min, 1200),
      max: toFiniteNumber(sanitized?.targetCalories?.max, 2500),
    };
  }

  if ('targetMacros' in sanitized) {
    sanitized.targetMacros = {
      protein: {
        min: toFiniteNumber(sanitized?.targetMacros?.protein?.min, 50),
        max: toFiniteNumber(sanitized?.targetMacros?.protein?.max, 150),
      },
      carbs: {
        min: toFiniteNumber(sanitized?.targetMacros?.carbs?.min, 100),
        max: toFiniteNumber(sanitized?.targetMacros?.carbs?.max, 300),
      },
      fat: {
        min: toFiniteNumber(sanitized?.targetMacros?.fat?.min, 30),
        max: toFiniteNumber(sanitized?.targetMacros?.fat?.max, 100),
      },
    };
  }

  if ('prepTime' in sanitized) {
    sanitized.prepTime = {
      daily: toFiniteNumber(sanitized?.prepTime?.daily, 30),
      weekly: toFiniteNumber(sanitized?.prepTime?.weekly, 210),
    };
  }

  return sanitized;
};

// Validation schema for updating diet template
const updateDietTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name too long').optional(),
  description: z.string().optional(),
  category: z.enum(['weight-loss', 'weight-gain', 'maintenance', 'muscle-gain', 'diabetes', 'heart-healthy', 'keto', 'vegan', 'custom']).optional(),
  duration: z.number().min(1).max(365).optional(),
  targetCalories: z.object({
    min: z.number().min(500).max(6000),
    max: z.number().min(500).max(6000)
  }).optional(),
  targetMacros: z.object({
    protein: z.object({
      min: z.number().min(0),
      max: z.number().min(0)
    }),
    carbs: z.object({
      min: z.number().min(0),
      max: z.number().min(0)
    }),
    fat: z.object({
      min: z.number().min(0),
      max: z.number().min(0)
    })
  }).optional(),
  dietaryRestrictions: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  meals: z.array(z.any()).optional(),
  mealTypes: z.array(mealTypeConfigSchema).optional(),
  isPublic: z.boolean().optional(),
  isPremium: z.boolean().optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  prepTime: z.object({
    daily: z.number().min(0),
    weekly: z.number().min(0)
  }).optional(),
  targetAudience: z.object({
    ageGroup: z.array(z.string()).default([]),
    activityLevel: z.array(z.string()).default([]),
    healthConditions: z.array(z.string()).default([]),
    goals: z.array(z.string()).default([])
  }).optional()
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid template ID' },
        { status: 400 }
      );
    }

    await connectDB();

    const template = await withCache(
      `diet-templates:id:${JSON.stringify({ _id: id, isActive: true })}`,
      async () => await DietTemplate.findOne({ _id: id, isActive: true })
        .populate('createdBy', 'firstName lastName email')
        .populate({
          path: 'meals.breakfast.recipeId',
          select: 'name description nutrition image category'
        })
        .populate({
          path: 'meals.morningSnack.recipeId',
          select: 'name description nutrition image category'
        })
        .populate({
          path: 'meals.lunch.recipeId',
          select: 'name description nutrition image category'
        })
        .populate({
          path: 'meals.afternoonSnack.recipeId',
          select: 'name description nutrition image category'
        })
        .populate({
          path: 'meals.dinner.recipeId',
          select: 'name description nutrition image category'
        })
        .populate({
          path: 'meals.eveningSnack.recipeId',
          select: 'name description nutrition image category'
        })
      ,
      { ttl: 120000, tags: ['diet_templates'] }
    );

    if (!template) {
      return NextResponse.json(
        { success: false, error: 'Diet template not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      template
    });

  } catch (error) {
    console.error('Error fetching diet template:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch diet template' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check permissions
    if (session.user.role !== UserRole.ADMIN && session.user.role !== UserRole.DIETITIAN) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid template ID' },
        { status: 400 }
      );
    }

    await connectDB();

    const body = await request.json();
    const sanitizedBody = sanitizeDietTemplateUpdatePayload(body);
    const validatedData = updateDietTemplateSchema.parse(sanitizedBody);

    // First fetch the template to check ownership
    const existingTemplate = await DietTemplate.findOne({ _id: id, isActive: true });

    if (!existingTemplate) {
      return NextResponse.json(
        { success: false, error: 'Diet template not found' },
        { status: 404 }
      );
    }

    // Check what fields are being updated
    const mealsOnlyFields = ['meals', 'mealTypes'];
    const updatingMetadata = Object.keys(validatedData).some(
      key => !mealsOnlyFields.includes(key)
    );

    // Any dietitian can update meals/recipes and template details
    // No ownership check needed - all dietitians can edit templates

    const template = await DietTemplate.findOneAndUpdate(
      { _id: id, isActive: true },
      { $set: validatedData },
      { new: true, runValidators: true }
    ).populate('createdBy', 'firstName lastName');

    // Clear cached GET responses so next load returns fresh data
    clearCacheByTag('diet_templates');

    return NextResponse.json({
      success: true,
      message: 'Diet template updated successfully',
      template
    });

  } catch (error) {
    console.error('Error updating diet template:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: error.issues
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to update diet template' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Resolve session and params in parallel
    const [session, { id }] = await Promise.all([
      getServerSession(authOptions),
      params,
    ]);

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (session.user.role !== UserRole.ADMIN && session.user.role !== UserRole.DIETITIAN) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid template ID' },
        { status: 400 }
      );
    }

    await connectDB();

    // Single atomic operation: ownership filter built into query for dietitians
    const filter = session.user.role === UserRole.ADMIN
      ? { _id: id }
      : { _id: id, createdBy: session.user.id };

    const deleted = await DietTemplate.findOneAndUpdate(
      filter,
      { $set: { isActive: false } },
      { projection: { _id: 1 } }
    );

    if (!deleted) {
      // Distinguish 404 vs 403 for dietitian
      if (session.user.role !== UserRole.ADMIN) {
        const exists = await DietTemplate.exists({ _id: id });
        if (exists) {
          return NextResponse.json(
            { success: false, error: 'Not authorized to delete this template' },
            { status: 403 }
          );
        }
      }
      return NextResponse.json(
        { success: false, error: 'Diet template not found' },
        { status: 404 }
      );
    }

    // Invalidate by prefix — reliable even after hot-reloads (tagToKeys resets, serverCache does not)
    serverCache.invalidate('diet-templates:');
    clearCacheByTag('diet_templates');

    return NextResponse.json({
      success: true,
      message: 'Diet template deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting diet template:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete diet template' },
      { status: 500 }
    );
  }
}
