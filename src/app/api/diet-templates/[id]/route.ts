import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connect';
import DietTemplate from '@/lib/db/models/DietTemplate';
import { UserRole } from '@/types';
import { z } from 'zod';
import mongoose from 'mongoose';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// Validation schema for meal type config
const mealTypeConfigSchema = z.object({
  name: z.string().min(1),
  time: z.string().optional()
});

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
    const validatedData = updateDietTemplateSchema.parse(body);

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

    // First fetch the template to check ownership
    const existingTemplate = await DietTemplate.findById(id);

    if (!existingTemplate) {
      return NextResponse.json(
        { success: false, error: 'Diet template not found' },
        { status: 404 }
      );
    }

    // Check if user owns the template or is admin
    if (existingTemplate.createdBy.toString() !== session.user.id && session.user.role !== UserRole.ADMIN) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to delete this template' },
        { status: 403 }
      );
    }

    // Soft delete by setting isActive to false
    existingTemplate.isActive = false;
    await existingTemplate.save();

    // Clear cached GET responses so deleted template disappears immediately
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
