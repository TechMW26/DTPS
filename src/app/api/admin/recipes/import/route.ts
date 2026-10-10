import {nativeResponseJson} from '@/lib/api/native-response';
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
import {getNativeDatabase} from '@/lib/db/database';
import {recipeActor,saveStaffRecipe} from '@/lib/db/repository/native-staff-recipes';
import {NativeStaffClientError} from '@/lib/db/repository/native-staff-client';



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

export async function POST(req:NextRequest){try{
 const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeStaffClientError('Unauthorized',401);const db=getNativeDatabase(),actor=await recipeActor(db,session.user.id,true);if(actor.get('role')!=='admin')throw new NativeStaffClientError('Admin access required',403);
 const {recipes,mode='upsert',identifierField='name'}=await req.json();if(!Array.isArray(recipes)||!recipes.length||recipes.length>500||!['upsert','create-only','update-only'].includes(mode)||!['_id','name'].includes(identifierField))throw new NativeStaffClientError('Invalid recipe import');const stats={total:recipes.length,created:0,updated:0,failed:0},errors=[];
 for(const [index,raw] of recipes.entries()){try{const data=transformRecipeData(raw);if(!data)throw new NativeStaffClientError('Invalid or incomplete recipe');let existing:FirebaseFirestore.DocumentSnapshot|undefined;
  if(identifierField==='_id'&&raw._id){if(!/^[a-f0-9]{24}$/.test(raw._id))throw new NativeStaffClientError('Invalid recipe ID');existing=await db.collection('recipes').doc(raw._id).get();}else {const rows=await db.collection('recipes').where('name','==',data.name).limit(2).get();if(rows.size>1)throw new NativeStaffClientError('Ambiguous recipe name; supply _id',409);existing=rows.docs[0];}
  if(existing?.exists&&mode==='create-only')throw new NativeStaffClientError('Recipe already exists',409);if(!existing?.exists&&mode==='update-only')throw new NativeStaffClientError('Recipe not found',404);
  await saveStaffRecipe(db,session.user.id,{...data,...(existing?.exists?{_nativeExpectedUpdatedAt:existing.get('updatedAt')?.toDate?.().toISOString()??null}:{})},existing?.exists?existing.id:undefined);if(existing?.exists)stats.updated++;else stats.created++;
 }catch(e){stats.failed++;errors.push({index,name:raw?.name||`Row ${index+1}`,error:e instanceof NativeStaffClientError?e.message:'Invalid recipe fields'});}}
 return nativeResponseJson({success:!stats.failed,message:`Created ${stats.created}, updated ${stats.updated}, failed ${stats.failed}`,stats,errors},{status:stats.failed?207:200});
 }catch(e){return nativeResponseJson({success:false,error:e instanceof NativeStaffClientError?e.message:'Unable to import recipes'},{status:e instanceof NativeStaffClientError?e.status:e instanceof SyntaxError?400:500});}}
