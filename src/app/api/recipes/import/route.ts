import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import Recipe from '@/lib/db/models/Recipe';
import { UserRole } from '@/types';

/**
 * POST /api/recipes/import
 * Bulk import recipes from JSON/CSV format
 * 
 * Expected format:
 * {
 *   recipes: [
 *     {
 *       name: "Recipe Name",
 *       description: "...",
 *       ingredients: [
 *         { name: "rice", quantity: 2, unit: "cups", remarks: "optional" },
 *         ...
 *       ],
 *       instructions: ["Step 1", "Step 2"],
 *       prepTime: 15,
 *       cookTime: 30,
 *       servings: 4,
 *       calories: 250,
 *       protein: 10,
 *       carbs: 40,
 *       fat: 8,
 *       tags: ["vegetarian"],
 *       dietaryRestrictions: [],
 *       allergens: [],
 *       medicalContraindications: []
 *     }
 *   ]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({
        error: 'Unauthorized',
        message: 'Please log in to import recipes'
      }, { status: 401 });
    }

    // Only dietitians, health counselors, and admins can import recipes
    if (session.user.role !== UserRole.DIETITIAN && session.user.role !== UserRole.HEALTH_COUNSELOR && session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({
        error: 'Forbidden',
        message: 'Only dietitians, health counselors, and admins can import recipes'
      }, { status: 403 });
    }

    const body = await request.json();
    if (!body.recipes || !Array.isArray(body.recipes)) {
      return NextResponse.json({
        error: 'Invalid format',
        message: 'Please provide recipes as an array'
      }, { status: 400 });
    }

    await connectDB();

    // Transform and validate recipes
    const transformedRecipes = body.recipes.map((r: any) => {
      const name = typeof r.name === 'string' ? r.name.trim() : '';
      if (!name) {
        throw new Error('Every imported recipe must have a name');
      }

      // Validate ingredients - ensure they are objects
      const ingredients = Array.isArray(r.ingredients)
        ? r.ingredients
            .filter((ing: any) => ing && ing.name && ing.name.trim() !== '')
            .map((ing: any) => ({
              name: ing.name.trim(),
              quantity: Number(ing.quantity) || 0,
              unit: ing.unit || '',
              remarks: ing.remarks || ''
            }))
        : [];

      if (ingredients.length === 0) {
        throw new Error(`Recipe "${r.name}" must have at least one ingredient`);
      }

      // Validate instructions
      const instructions = Array.isArray(r.instructions)
        ? r.instructions.filter((inst: any) => inst && String(inst).trim() !== '')
        : [];

      if (instructions.length === 0) {
        throw new Error(`Recipe "${r.name}" must have at least one instruction`);
      }

      return {
        name,
        description: r.description || '',
        ingredients,
        instructions,
        prepTime: Number(r.prepTime) || 0,
        cookTime: Number(r.cookTime) || 0,
        totalTime: (Number(r.prepTime) || 0) + (Number(r.cookTime) || 0),
        servings: Number(r.servings) || 2,
        servingSize: r.servingSize || `${Number(r.servings) || 2} servings`,
        // Nutrition
        calories: Number(r.calories) || 0,
        protein: Number(r.protein) || 0,
        carbs: Number(r.carbs) || 0,
        fat: Number(r.fat) || 0,
        // Tags and restrictions
        tags: Array.isArray(r.tags) ? r.tags.filter((t: any) => t) : [],
        dietaryRestrictions: Array.isArray(r.dietaryRestrictions) ? r.dietaryRestrictions.filter((d: any) => d) : [],
        allergens: Array.isArray(r.allergens) ? r.allergens.filter((a: any) => a) : [],
        medicalContraindications: Array.isArray(r.medicalContraindications) ? r.medicalContraindications.filter((m: any) => m) : [],
        // Meta
        createdBy: session.user.id,
        isActive: r.isActive !== false,
        isPublic: r.isPublic === true,
        isTemplate: r.isTemplate === true
      };
    });

    // Bulk insert recipes
    const result = await Recipe.insertMany(transformedRecipes, { ordered: false });

    return NextResponse.json({
      success: true,
      message: `Successfully imported ${result.length} recipes`,
      imported: result.length,
      recipes: result.map(r => ({
        _id: r._id,
        name: r.name,
        uuid: r.uuid
      }))
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error importing recipes:', error?.message || error);

    // Handle MongoDB duplicate key error
    if ((error as any).code === 11000) {
      const field = Object.keys((error as any).keyPattern || {})[0];
      return NextResponse.json({
        error: 'Duplicate entry',
        message: `A recipe with the same ${field} already exists. Each user must have unique recipe names.`,
        details: error.message
      }, { status: 409 });
    }

    // Handle validation errors
    if ((error as any).name === 'ValidationError') {
      return NextResponse.json({
        error: 'Validation failed',
        message: 'Some recipes contain invalid data',
        details: error.message
      }, { status: 400 });
    }

    return NextResponse.json({
      error: 'Import failed',
      message: 'Failed to import recipes. Please check your data and try again.',
      details: error.message
    }, { status: 500 });
  }
}
