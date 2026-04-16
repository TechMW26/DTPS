import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import Recipe from '@/lib/db/models/Recipe';
import User from '@/lib/db/models/User';
import mongoose from 'mongoose';
import { clearCacheByTag } from '@/lib/api/utils';
import { normalizeToArray, normalizeNutritionValue } from '@/lib/recipe-normalize';

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

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid recipe ID format' }, { status: 400 });
    }

    const [session] = await Promise.all([
      getServerSession(authOptions),
      connectDB(),
    ]);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch recipe with populated creator in a single query
    let recipe = await Recipe.findById(id)
      .populate('createdBy', 'firstName lastName')
      .lean();

    if (!recipe)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });

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

    await Recipe.findByIdAndUpdate(id, { $inc: { views: 1 } });

    return NextResponse.json({ success: true, recipe: recipeData });
  } catch (error: any) {
    console.error('Error fetching recipe:', error?.message || error);
    return NextResponse.json({ error: 'Failed to fetch recipe', details: error?.message }, { status: 500 });
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

    // Allow any dietitian, health_counselor, or admin to edit any recipe (case-insensitive)
    const userRole = (session.user.role || '').toLowerCase();
    const allowedRoles = ['dietitian', 'health_counselor', 'admin'];
    if (!allowedRoles.includes(userRole)) {
      console.log('User role not allowed for recipe edit:', userRole);
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

    // Allow any dietitian, health_counselor, or admin to delete any recipe (case-insensitive)
    const userRole = (session.user.role || '').toLowerCase();
    const allowedRoles = ['dietitian', 'health_counselor', 'admin'];
    if (!allowedRoles.includes(userRole)) {
      console.log('User role not allowed for recipe delete:', userRole);
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
