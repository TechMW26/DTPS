import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connect';
import DietTemplate from '@/lib/db/models/DietTemplate';
import { UserRole } from '@/types';
import { z } from 'zod';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import {
  MEAL_TYPES,
  MEAL_TYPE_KEYS,
  type MealTypeKey
} from '@/lib/mealConfig';

// Get default meal types from canonical config
const getCanonicalMealTypes = () => MEAL_TYPE_KEYS.map(key => ({
  name: MEAL_TYPES[key].label,
  time: MEAL_TYPES[key].time12h
}));

// Validation schema for meal type config
const mealTypeConfigSchema = z.object({
  name: z.string().min(1),
  time: z.string().optional()
});

// Validation schema for diet template (no word limits)
const dietTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional().default(''),
  category: z.enum(['weight-loss', 'weight-gain', 'maintenance', 'muscle-gain', 'diabetes', 'heart-healthy', 'keto', 'vegan', 'custom']),
  duration: z.number().min(1).max(365),
  targetCalories: z.object({
    min: z.number().min(0).max(10000),
    max: z.number().min(0).max(10000)
  }).optional().default({ min: 1200, max: 2500 }),
  targetMacros: z.object({
    protein: z.object({
      min: z.number().min(0),
      max: z.number().min(0)
    }).optional().default({ min: 50, max: 150 }),
    carbs: z.object({
      min: z.number().min(0),
      max: z.number().min(0)
    }).optional().default({ min: 100, max: 300 }),
    fat: z.object({
      min: z.number().min(0),
      max: z.number().min(0)
    }).optional().default({ min: 30, max: 100 })
  }).optional().default({
    protein: { min: 50, max: 150 },
    carbs: { min: 100, max: 300 },
    fat: { min: 30, max: 100 }
  }),
  dietaryRestrictions: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  meals: z.array(z.any()).default([]),
  mealTypes: z.array(mealTypeConfigSchema).optional().default(getCanonicalMealTypes()),
  isPublic: z.boolean().optional().default(false),
  isPremium: z.boolean().optional().default(false),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional().default('intermediate'),
  prepTime: z.object({
    daily: z.number().min(0),
    weekly: z.number().min(0)
  }).optional().default({ daily: 30, weekly: 210 }),
  targetAudience: z.object({
    ageGroup: z.array(z.string()).default([]),
    activityLevel: z.array(z.string()).default([]),
    healthConditions: z.array(z.string()).default([]),
    goals: z.array(z.string()).default([])
  }).optional().default({
    ageGroup: [],
    activityLevel: [],
    healthConditions: [],
    goals: []
  })
});

export async function GET(request: NextRequest) {
  try {

    const session = await getServerSession(authOptions);

    await connectDB();

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const isPublic = searchParams.get('isPublic');
    const search = searchParams.get('search');
    const difficulty = searchParams.get('difficulty');
    const dietaryRestrictions = searchParams.get('dietaryRestrictions');
    const createdByRaw = searchParams.get('createdBy');
    const createdBy = createdByRaw && createdByRaw !== 'undefined' && createdByRaw !== 'null'
      ? createdByRaw
      : null;
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const sortBy = searchParams.get('sortBy') || 'newest';
    const limit = parseInt(searchParams.get('limit') || '10');
    const page = parseInt(searchParams.get('page') || '1');
    const skip = parseInt(searchParams.get('skip') || String((page - 1) * limit));
    const primaryGoal = searchParams.get('primaryGoal');

    // Build query
    const query: any = {};

    if (session?.user) {
      const isAdmin = session.user.role === UserRole.ADMIN;
      const isDietitian = session.user.role === UserRole.DIETITIAN;

      // Admin can opt-in to include archived templates for recycle-bin workflows.
      if (!(isAdmin && includeInactive)) {
        query.isActive = true;
      }

      if (createdBy) {
        query.createdBy = createdBy;
      } else if (isDietitian) {
        // Dietitians should only see their own templates unless an explicit creator filter is provided.
        // Guard against incomplete session payloads to avoid random empty-result glitches.
        if (!session.user.id) {
          return NextResponse.json(
            { success: false, error: 'Invalid session. Please re-login.' },
            { status: 401 }
          );
        }
        query.createdBy = session.user.id;
      }
    } else {
      // No session - only show public active templates
      query.isActive = true;
      query.isPublic = true;
    }

    // Filter by category (which can also serve as primary goal)
    if (category && category !== 'all') {
      query.category = category;
    }

    // Filter by primary goal - match category or targetAudience.goals
    if (primaryGoal && primaryGoal !== 'all') {
      query.$or = [
        { category: primaryGoal },
        { 'targetAudience.goals': primaryGoal }
      ];
    }

    // Duration filter removed — show all diet templates regardless of duration
    // Templates can be mapped to any plan duration via the Date Selection modal

    if (isPublic !== null && isPublic !== undefined) {
      query.isPublic = isPublic === 'true';
    }

    if (difficulty && difficulty !== 'all') {
      query.difficulty = difficulty;
    }

    if (dietaryRestrictions) {
      const restrictions = dietaryRestrictions.split(',').filter(r => r.trim() !== '');
      if (restrictions.length > 0) {
        query.dietaryRestrictions = { $all: restrictions };
      }
    }

    if (search) {
      const searchOr = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];

      // If primaryGoal already set an $or, combine with $and to avoid overwrite
      if (query.$or) {
        query.$and = [
          { $or: query.$or },
          { $or: searchOr }
        ];
        delete query.$or;
      } else {
        query.$or = searchOr;
      }
    }

    // Sort options
    let sortOptions: any = {};
    switch (sortBy) {
      case 'rating':
        sortOptions = { averageRating: -1 };
        break;
      case 'popular':
        sortOptions = { usageCount: -1 };
        break;
      case 'newest':
        sortOptions = { createdAt: -1 };
        break;
      case 'name':
        sortOptions = { name: 1 };
        break;
      default:
        sortOptions = { createdAt: -1 };
    }

    const cacheScope = `${session?.user?.role || 'guest'}:${session?.user?.id || 'anon'}`;
    const templates = await withCache(
      `diet-templates:${cacheScope}:${JSON.stringify(query)}:sort=${sortBy}:limit=${limit}:skip=${skip}`,
      async () => await DietTemplate.find(query)
        .populate('createdBy', 'firstName lastName role')
        .sort(sortOptions)
        .limit(limit)
        .skip(skip)
      ,
      { ttl: 120000, tags: ['diet_templates'] }
    );

    const total = await DietTemplate.countDocuments(query);

    // Get categories for filtering
    const categories = await DietTemplate.distinct('category', { isActive: true });

    return NextResponse.json({
      success: true,
      templates,
      total,
      categories,
      page: Math.floor(skip / limit) + 1,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error('Error in GET /api/diet-templates:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch diet templates' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check if user has permission to create templates
    if (session.user.role !== UserRole.ADMIN && session.user.role !== UserRole.DIETITIAN) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    await connectDB();

    const body = await request.json();

    // Validate input
    const validatedData = dietTemplateSchema.parse(body);
    // Create new diet template
    const template = new DietTemplate({
      ...validatedData,
      createdBy: session.user.id
    });

    await template.save();

    // Clear cached GET responses so the new template appears immediately
    clearCacheByTag('diet_templates');

    // Populate creator info
    await template.populate('createdBy', 'firstName lastName');

    return NextResponse.json({
      success: true,
      message: 'Diet template created successfully',
      template
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating diet template:', error);

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

    // Return more detailed error for debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: `Failed to create diet template: ${errorMessage}` },
      { status: 500 }
    );
  }
}
