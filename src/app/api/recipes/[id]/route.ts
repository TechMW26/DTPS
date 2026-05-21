import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import Recipe from '@/lib/db/models/Recipe';
import User from '@/lib/db/models/User';
import mongoose from 'mongoose';
import { clearCacheByTag } from '@/lib/api/utils';
import { normalizeToArray, normalizeNutritionValue } from '@/lib/recipe-normalize';

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function buildUniqueDuplicateName(baseName: string, userId: string): Promise<string> {
  const trimmedBase = baseName.trim() || 'Untitled Recipe';
  const escapedBase = escapeRegex(trimmedBase);
  const copyNamePattern = new RegExp(`^${escapedBase}\\s*\\(Copy(?:\\s+(\\d+))?\\)$`, 'i');

  const existingRecipes = await Recipe.find({
    createdBy: userId,
    $or: [
      { name: trimmedBase },
      { name: { $regex: copyNamePattern } }
    ]
  }).select('name').lean();

  // First duplicate should be "(Copy)". If that exists, increment: "(Copy 2)", "(Copy 3)", etc.
  let maxCopyNumber = 0;

  for (const item of existingRecipes) {
    const currentName = String(item?.name || '').trim();
    if (currentName.toLowerCase() === trimmedBase.toLowerCase()) {
      maxCopyNumber = Math.max(maxCopyNumber, 0);
      continue;
    }

    const match = currentName.match(copyNamePattern);
    if (!match) continue;

    const parsed = match[1] ? parseInt(match[1], 10) : 1;
    if (!Number.isNaN(parsed)) {
      maxCopyNumber = Math.max(maxCopyNumber, parsed);
    }
  }

  if (maxCopyNumber <= 0) return `${trimmedBase} (Copy)`;
  return `${trimmedBase} (Copy ${maxCopyNumber + 1})`;
}

/**
 * Parse servings string to extract numeric value
 * Examples:
 *   "2.5 SMALL BOWL (500 gm/ml)" -> 2.5
 *   "1/2 TSP ( 2.5 gm/ml )" -> 0.5
 *   "1 GLASS ( 250 ml )" -> 1
 */
function parseServingsToNumber(servingsStr: string | number): number {
  if (typeof servingsStr === 'number') return servingsStr;

  const str = String(servingsStr).trim();

  // Extract quantity (supports decimals and fractions like 1/2, 3/4)
  const match = str.match(/^[\s]*([0-9]+(?:\/[0-9]+)?(?:\.[0-9]+)?)/);
  if (match && match[1]) {
    const qStr = match[1];
    if (qStr.includes('/')) {
      const [numerator, denominator] = qStr.split('/').map(Number);
      if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
        return numerator / denominator;
      }
    } else {
      const num = parseFloat(qStr);
      if (!isNaN(num)) return num;
    }
  }

  return 1; // Default
}

/* -------- GET SINGLE -------- */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let { id } = await params;

    // Strip any extra quotes from the ID (handles malformed URLs)
    id = id.replace(/^["']+|["']+$/g, '').trim();

    const isObjectId = mongoose.Types.ObjectId.isValid(id);

    const [session] = await Promise.all([
      getServerSession(authOptions),
      connectDB(),
    ]);
    if (!session) return jsonNoStore({ error: 'Unauthorized' }, { status: 401 });

    const numericId = Number(id);
    let recipe: Record<string, unknown> | null = null;

    if (isObjectId) {
      recipe = await Recipe.findById(id)
        .populate('createdBy', 'firstName lastName')
        .lean();
    } else {
      // IMPORTANT: Use raw collection query to avoid Mongoose schema casting `uuid`
      // to string, because legacy rows may store uuid as numbers.
      const normalizedNoLeadingZeros = id.replace(/^0+/, '') || '0';
      const escapedOriginal = escapeRegex(id);
      const escapedNormalized = escapeRegex(normalizedNoLeadingZeros);

      const uuidOrConditions: Array<Record<string, unknown>> = [
        { uuid: id },
        { uuid: normalizedNoLeadingZeros },
        { uuid: { $regex: `^0*${escapedOriginal}$`, $options: 'i' } },
        { uuid: { $regex: `^0*${escapedNormalized}$`, $options: 'i' } }
      ];

      if (!Number.isNaN(numericId)) {
        uuidOrConditions.push({ uuid: numericId });
      }

      const rawRecipe = await Recipe.collection.findOne(
        { $or: uuidOrConditions },
        { projection: { _id: 1 } }
      );

      if (rawRecipe?._id) {
        recipe = await Recipe.findById(rawRecipe._id)
          .populate('createdBy', 'firstName lastName')
          .lean();
      }
    }

    if (!recipe)
      return jsonNoStore({ error: 'Not found' }, { status: 404 });

    // Ensure proper typing for recipe data
    const recipeData = recipe as Record<string, any>;

    // Fallback if populate didn't resolve
    if (!recipeData.createdBy || typeof recipeData.createdBy === 'string') {
      recipeData.createdBy = { firstName: 'Unknown', lastName: 'User' };
    }

    // Add flat nutrition values
    const flatNutrition = {
      calories: recipeData.calories || 0,
      protein: recipeData.protein || 0,
      carbs: recipeData.carbs || 0,
      fat: recipeData.fat || 0
    };
    recipeData.flatNutrition = flatNutrition;

    // Build nutrition object for detail page compatibility
    if (!recipeData.nutrition) {
      recipeData.nutrition = {
        calories: recipeData.calories || 0,
        protein: recipeData.protein || 0,
        carbs: recipeData.carbs || 0,
        fat: recipeData.fat || 0,
      };
    }

    // Normalize array fields to ensure they render safely (handles string values from AI)
    recipeData.dietaryRestrictions = normalizeToArray(recipeData.dietaryRestrictions);
    recipeData.medicalContraindications = normalizeToArray(recipeData.medicalContraindications);
    recipeData.allergens = normalizeToArray(recipeData.allergens);
    recipeData.tags = normalizeToArray(recipeData.tags);

    await Recipe.findByIdAndUpdate((recipeData._id as mongoose.Types.ObjectId | string).toString(), { $inc: { views: 1 } });

    return jsonNoStore({ success: true, recipe: recipeData });
  } catch (error: any) {
    console.error('Error fetching recipe:', error?.message || error);
    return jsonNoStore({ error: 'Failed to fetch recipe', details: error?.message }, { status: 500 });
  }
}

/* -------- DUPLICATE -------- */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let { id } = await params;

    // Strip any extra quotes from the ID
    id = id.replace(/^["']+|["']+$/g, '').trim();

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid recipe ID format' }, { status: 400 });
    }

    const [session] = await Promise.all([
      getServerSession(authOptions),
      connectDB(),
    ]);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Allow any dietitian, health counselor, or admin to duplicate recipes
    const normalizedRole = (session.user.role || '').toLowerCase().replace(/[\s-]+/g, '_');
    const canManageRecipes =
      normalizedRole === 'dietitian' ||
      normalizedRole === 'health_counselor' ||
      normalizedRole.includes('admin');
    if (!canManageRecipes) {
      return NextResponse.json({ error: 'Forbidden', message: 'You do not have permission to duplicate recipes' }, { status: 403 });
    }

    const sourceRecipe = await Recipe.findById(id).lean();
    if (!sourceRecipe) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const duplicateName = await buildUniqueDuplicateName(String(sourceRecipe.name || ''), session.user.id);

    const duplicateData: Record<string, any> = {
      ...sourceRecipe,
      name: duplicateName,
      createdBy: session.user.id,
      rating: 0,
      ratingCount: 0,
      usageCount: 0,
      favoriteCount: 0,
      isPublic: false,
      isPremium: false,
    };

    delete duplicateData._id;
    delete duplicateData.__v;
    delete duplicateData.uuid;
    delete duplicateData.createdAt;
    delete duplicateData.updatedAt;

    const duplicatedRecipe = await Recipe.create(duplicateData);
    await duplicatedRecipe.populate('createdBy', 'firstName lastName');

    clearCacheByTag('recipes');

    return NextResponse.json(
      {
        success: true,
        message: 'Recipe duplicated successfully',
        recipe: duplicatedRecipe,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error duplicating recipe:', error?.message || error);

    if ((error as any).code === 11000) {
      return NextResponse.json({
        error: 'Duplicate recipe',
        message: 'A recipe with this name already exists. Please try duplicating again.',
      }, { status: 409 });
    }

    return NextResponse.json({ error: 'Failed to duplicate recipe', details: error?.message }, { status: 500 });
  }
}

/* -------- UPDATE -------- */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let { id } = await params;

    // Strip any extra quotes from the ID
    id = id.replace(/^["']+|["']+$/g, '').trim();

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid recipe ID format' }, { status: 400 });
    }

    const [session, , data] = await Promise.all([
      getServerSession(authOptions),
      connectDB(),
      req.json(),
    ]);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const recipe = await Recipe.findById(id);
    if (!recipe)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Allow any dietitian, health counselor, or admin to edit any recipe
    const normalizedRole = (session.user.role || '').toLowerCase().replace(/[\s-]+/g, '_');
    const canManageRecipes =
      normalizedRole === 'dietitian' ||
      normalizedRole === 'health_counselor' ||
      normalizedRole.includes('admin');
    if (!canManageRecipes) {
      console.log('User role not allowed for recipe edit:', normalizedRole);
      return NextResponse.json({ error: 'Forbidden', message: 'You do not have permission to edit recipes' }, { status: 403 });
    }

    // Transform ingredients if provided - ensure they are objects
    if (data.ingredients && Array.isArray(data.ingredients)) {
      data.ingredients = data.ingredients
        .filter((ing: any) => ing.name && ing.name.trim() !== '')
        .map((ing: any) => ({
          name: ing.name.trim(),
          quantity: ing.quantity || 0,
          unit: ing.unit || '',
          remarks: ing.remarks || ''
        }));
    }

    // Transform nutrition if provided
    if (data.nutrition && typeof data.nutrition === 'object') {
      data.calories = data.nutrition.calories || 0;
      data.protein = data.nutrition.protein || 0;
      data.carbs = data.nutrition.carbs || 0;
      data.fat = data.nutrition.fat || 0;
    }

    // Parse servings: extract number for calculations, keep full string for display
    if (data.servings !== undefined) {
      const servingsInput = data.servings;
      data.servings = parseServingsToNumber(servingsInput);
      data.servingSize = typeof servingsInput === 'string' ? servingsInput.trim() : `${servingsInput} serving${servingsInput !== 1 ? 's' : ''}`;
    }

    // Calculate total time if times changed
    if (data.prepTime !== undefined || data.cookTime !== undefined) {
      data.totalTime = (data.prepTime || recipe.prepTime || 0) + (data.cookTime || recipe.cookTime || 0);
    }

    // Clear cache for this recipe
    clearCacheByTag('recipes');

    const updated = await Recipe.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true
    });

    return NextResponse.json({ success: true, recipe: updated });
  } catch (error: any) {
    console.error('Error updating recipe:', error?.message || error);
    return NextResponse.json({ error: 'Failed to update recipe', details: error?.message }, { status: 500 });
  }
}

/* -------- DELETE -------- */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let { id } = await params;

    // Strip any extra quotes from the ID
    id = id.replace(/^["']+|["']+$/g, '').trim();

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid recipe ID format' }, { status: 400 });
    }

    const [session] = await Promise.all([
      getServerSession(authOptions),
      connectDB(),
    ]);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const recipe = await Recipe.findById(id);
    if (!recipe)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Allow any dietitian, health counselor, or admin to delete any recipe
    const normalizedRole = (session.user.role || '').toLowerCase().replace(/[\s-]+/g, '_');
    const canManageRecipes =
      normalizedRole === 'dietitian' ||
      normalizedRole === 'health_counselor' ||
      normalizedRole.includes('admin');
    if (!canManageRecipes) {
      console.log('User role not allowed for recipe delete:', normalizedRole);
      return NextResponse.json({ error: 'Forbidden', message: 'You do not have permission to delete recipes' }, { status: 403 });
    }

    // Clear cache for recipes
    clearCacheByTag('recipes');

    await Recipe.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting recipe:', error?.message || error);
    return NextResponse.json({ error: 'Failed to delete recipe', details: error?.message }, { status: 500 });
  }
}
