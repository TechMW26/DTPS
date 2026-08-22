/**
 * API Route: Admin Recipe Import & Update
 * POST /api/admin/recipes/import
 * 
 * Handles bulk recipe imports with:
 * - Duplicate prevention using upsert logic
 * - CSV and JSON support
 * - Graceful error handling for invalid data
 * - Proper array field handling (ingredients, instructions, tags)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import Recipe from '@/lib/db/models/Recipe';
import mongoose from 'mongoose';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface ImportRequest {
  recipes: Array<Record<string, any>>;
  mode?: 'upsert' | 'create-only' | 'update-only';
  identifierField?: '_id' | 'name';
}

interface ImportResult {
  success: boolean;
  message: string;
  stats: {
    total: number;
    created: number;
    updated: number;
    failed: number;
  };
  errors: Array<{
    index: number;
    name?: string;
    error: string;
  }>;
}

// Normalize array fields to handle various input formats
function normalizeArrayField(value: any, fieldName: string): any[] {
  if (Array.isArray(value)) {
    return value;
  }
  
  if (typeof value === 'string') {
    // Handle pipe-delimited or comma-separated strings
    if (fieldName === 'ingredients') {
      // For ingredients, parse pipe-delimited format: quantity|unit|name|remarks
      return value.split('\n')
        .filter(line => line.trim())
        .map(line => {
          const parts = line.split('|').map(p => p.trim());
          if (parts.length >= 3) {
            return {
              name: parts[2],
              quantity: parseFloat(parts[0]) || 1,
              unit: parts[1] || 'piece',
              remarks: parts[3] || ''
            };
          }
          return null;
        })
        .filter(Boolean);
    } else if (fieldName === 'instructions') {
      // For instructions, split by newline or semicolon
      return value.split(/[\n;]/)
        .map(line => line.trim())
        .filter(line => line.length > 0);
    } else {
      // For tags, dietaryRestrictions, allergens, etc.
      return value.split(/[,;]/)
        .map(item => item.trim())
        .filter(item => item.length > 0);
    }
  }
  
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    // Handle object-based array fields
    if (fieldName === 'ingredients' && value.name) {
      // Single ingredient object
      return [{
        name: value.name,
        quantity: value.quantity || 1,
        unit: value.unit || 'piece',
        remarks: value.remarks || ''
      }];
    }
    // Single item for other array fields
    return [value];
  }
  
  return [];
}

// Normalize ingredient objects to ensure consistent structure
function normalizeIngredients(ingredients: any[]): any[] {
  if (!Array.isArray(ingredients)) return [];
  
  return ingredients
    .map(ing => {
      if (typeof ing === 'string') {
        return { name: ing, quantity: 1, unit: 'piece', remarks: '' };
      }
      if (typeof ing === 'object' && ing.name) {
        return {
          name: String(ing.name).trim(),
          quantity: parseFloat(ing.quantity) || 1,
          unit: String(ing.unit || 'piece').trim(),
          remarks: String(ing.remarks || '').trim()
        };
      }
      return null;
    })
    .filter(Boolean);
}

// Normalize nutrition fields
function normalizeNutrition(data: Record<string, any>): Record<string, number> {
  return {
    calories: parseFloat(data.calories) || 0,
    protein: parseFloat(data.protein) || 0,
    carbs: parseFloat(data.carbs) || 0,
    fat: parseFloat(data.fat) || 0
  };
}

// Transform and validate recipe data
function transformRecipeData(rawData: Record<string, any>): Record<string, any> | null {
  try {
    const transformed: Record<string, any> = {};

    // Required fields
    if (!rawData.name || String(rawData.name).trim() === '') {
      return null;
    }
    transformed.name = String(rawData.name).trim();

    // Optional fields
    if (rawData.description) {
      transformed.description = String(rawData.description).trim();
    }

    // Array fields - ingredients and instructions (required)
    transformed.ingredients = normalizeIngredients(
      normalizeArrayField(rawData.ingredients, 'ingredients')
    );

    if (transformed.ingredients.length === 0) {
      return null; // Recipe must have at least one ingredient
    }

    transformed.instructions = normalizeArrayField(
      rawData.instructions || [],
      'instructions'
    );

    if (transformed.instructions.length === 0) {
      return null; // A publishable recipe must contain real preparation steps
    }

    // Time fields
    transformed.prepTime = Math.max(0, parseInt(rawData.prepTime) || 0);
    transformed.cookTime = Math.max(0, parseInt(rawData.cookTime) || 0);
    transformed.totalTime = transformed.prepTime + transformed.cookTime;

    // Servings
    transformed.servings = Math.max(1, parseInt(rawData.servings) || 2);
    if (rawData.servingSize) {
      transformed.servingSize = String(rawData.servingSize).trim();
    }

    // Nutrition fields
    const nutrition = normalizeNutrition(rawData);
    transformed.calories = nutrition.calories;
    transformed.protein = nutrition.protein;
    transformed.carbs = nutrition.carbs;
    transformed.fat = nutrition.fat;

    // Tags and dietary info
    transformed.tags = normalizeArrayField(rawData.tags || [], 'tags');
    transformed.dietaryRestrictions = normalizeArrayField(
      rawData.dietaryRestrictions || [],
      'dietaryRestrictions'
    );
    transformed.allergens = normalizeArrayField(rawData.allergens || [], 'allergens');
    transformed.medicalContraindications = normalizeArrayField(
      rawData.medicalContraindications || [],
      'medicalContraindications'
    );

    // Optional fields
    if (rawData.category) {
      transformed.category = String(rawData.category).trim();
    }
    if (rawData.cuisine) {
      transformed.cuisine = String(rawData.cuisine).trim();
    }
    if (rawData.mealType) {
      transformed.mealType = String(rawData.mealType).trim();
    }
    if (rawData.difficulty) {
      transformed.difficulty = String(rawData.difficulty).trim();
    }
    if (rawData.image) {
      transformed.image = String(rawData.image).trim();
    }

    // Status flags
    transformed.isActive = rawData.isActive !== 'false' && rawData.isActive !== false;
    transformed.isPublic = rawData.isPublic === 'true' || rawData.isPublic === true;
    transformed.isTemplate = rawData.isTemplate === 'true' || rawData.isTemplate === true;

    return transformed;
  } catch (error: any) {
    console.error('Transform error:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Auth check - admin only
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - admin access required' },
        { status: 401 }
      );
    }

    const body: ImportRequest = await request.json();
    const { recipes = [], mode = 'upsert', identifierField = 'name' } = body;

    if (!Array.isArray(recipes) || recipes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No recipes provided' },
        { status: 400 }
      );
    }

    await connectDB();

    const result: ImportResult = {
      success: true,
      message: '',
      stats: { total: recipes.length, created: 0, updated: 0, failed: 0 },
      errors: []
    };

    // Use MongoDB session for transaction support
    const mongoSession = await mongoose.startSession();

    try {
      await mongoSession.withTransaction(async () => {
        for (let i = 0; i < recipes.length; i++) {
          try {
            const rawRecipe = recipes[i];
            const transformed = transformRecipeData(rawRecipe);

            if (!transformed) {
              result.stats.failed++;
              result.errors.push({
                index: i,
                name: rawRecipe.name || `Row ${i + 1}`,
                error: 'Invalid or incomplete recipe data (missing name or ingredients)'
              });
              continue;
            }

            // Determine identifier for upsert
            let filter: Record<string, any> = {};

            if (mode === 'create-only') {
              // Only create if not exists
              filter = { name: transformed.name };
            } else if (mode === 'update-only') {
              // Only update existing
              if (identifierField === '_id' && mongoose.Types.ObjectId.isValid(rawRecipe._id)) {
                filter = { _id: new mongoose.Types.ObjectId(rawRecipe._id) };
              } else {
                filter = { name: transformed.name };
              }
            } else {
              // Upsert mode (default)
              if (identifierField === '_id' && rawRecipe._id && mongoose.Types.ObjectId.isValid(rawRecipe._id)) {
                filter = { _id: new mongoose.Types.ObjectId(rawRecipe._id) };
              } else {
                filter = { name: transformed.name };
              }
            }

            // Use upsert to prevent duplicates
            const existingRecipe = await Recipe.findOne(filter, {}, { session: mongoSession });

            if (existingRecipe) {
              if (mode === 'create-only') {
                result.stats.failed++;
                result.errors.push({
                  index: i,
                  name: transformed.name,
                  error: `Recipe "${transformed.name}" already exists (create-only mode)`
                });
                continue;
              }

              // Update using $set to avoid overwriting unintended fields
              await Recipe.findByIdAndUpdate(
                existingRecipe._id,
                { $set: transformed },
                { 
                  session: mongoSession,
                  new: true,
                  runValidators: true
                }
              );

              result.stats.updated++;
            } else {
              if (mode === 'update-only') {
                result.stats.failed++;
                result.errors.push({
                  index: i,
                  name: transformed.name,
                  error: `Recipe "${transformed.name}" not found (update-only mode)`
                });
                continue;
              }

              // Create new recipe
              const newRecipe = new Recipe(transformed);
              await newRecipe.save({ session: mongoSession });
              result.stats.created++;
            }
          } catch (error: any) {
            result.stats.failed++;
            result.errors.push({
              index: i,
              name: recipes[i]?.name || `Row ${i + 1}`,
              error: error.message || 'Unknown error'
            });
          }
        }
      });

      result.message = `Import completed: ${result.stats.created} created, ${result.stats.updated} updated, ${result.stats.failed} failed`;
    } catch (error: any) {
      console.error('Transaction error:', error);
      result.success = false;
      result.message = `Transaction failed: ${error.message}`;
      result.stats.failed = recipes.length;
      result.errors.push({
        index: 0,
        error: error.message || 'Transaction error'
      });
    } finally {
      await mongoSession.endSession();
    }

    return NextResponse.json(result, {
      status: result.success ? 200 : 400
    });

  } catch (error: any) {
    console.error('Import error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Server error',
        message: error.message,
        stats: { total: 0, created: 0, updated: 0, failed: 0 },
        errors: []
      },
      { status: 500 }
    );
  }
}
