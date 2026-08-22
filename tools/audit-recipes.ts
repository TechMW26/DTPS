import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Recipe from '../src/lib/db/models/Recipe';
import {
  getRecipePublicationIssues,
  getStrictRecipeFingerprint,
} from '../src/lib/recipe-quality';

dotenv.config({ path: '.env', quiet: true });
dotenv.config({ path: '.env.local', override: true, quiet: true });

function requireMongoUri(): string {
  const value = process.env.MONGODB_URI;
  if (!value) throw new Error('MONGODB_URI is not configured');
  return value;
}

const uri = requireMongoUri();

async function main() {
  await mongoose.connect(uri);

  const recipes = await Recipe.find({}).lean();
  const saladRecipes = recipes.filter((recipe) => /^salad$/i.test(String(recipe.name || '').trim()));
  const blankRecipes = recipes.filter((recipe) => getRecipePublicationIssues(recipe).length > 0);

  const fingerprintGroups = new Map<string, typeof recipes>();
  recipes.filter((recipe) => !recipe.mergedInto).forEach((recipe) => {
    const fingerprint = getStrictRecipeFingerprint(recipe);
    const group = fingerprintGroups.get(fingerprint) || [];
    group.push(recipe);
    fingerprintGroups.set(fingerprint, group);
  });
  const strictDuplicateGroups = [...fingerprintGroups.values()].filter((group) => group.length > 1);
  const saladSearchResults = await Recipe.find({ $text: { $search: 'Salad' } })
    .sort({ name: 1 })
    .limit(25)
    .select({ name: 1, ingredients: 1, instructions: 1 })
    .lean();

  console.log(JSON.stringify({
    totals: {
      recipes: recipes.length,
      blankRecipes: blankRecipes.length,
      activeBlankRecipes: blankRecipes.filter((recipe) => recipe.isActive !== false).length,
      strictDuplicateGroups: strictDuplicateGroups.length,
      strictDuplicateRecords: strictDuplicateGroups.reduce((sum, group) => sum + group.length - 1, 0),
    },
    saladRecipes: saladRecipes.map((recipe) => ({
      id: String(recipe._id),
      uuid: recipe.uuid || null,
      name: recipe.name,
      active: recipe.isActive !== false,
      public: recipe.isPublic === true,
      ingredientCount: recipe.ingredients?.length || 0,
      instructionCount: recipe.instructions?.length || 0,
      tags: recipe.tags || [],
      issues: getRecipePublicationIssues(recipe),
      createdAt: recipe.createdAt,
    })),
    saladSearchResults: saladSearchResults.map((recipe) => ({
      id: String(recipe._id),
      name: recipe.name,
      ingredientCount: recipe.ingredients?.length || 0,
      instructionCount: recipe.instructions?.length || 0,
    })),
    blankSample: blankRecipes.slice(0, 30).map((recipe) => ({
      id: String(recipe._id),
      uuid: recipe.uuid || null,
      name: recipe.name,
      active: recipe.isActive !== false,
      public: recipe.isPublic === true,
      issues: getRecipePublicationIssues(recipe),
    })),
    strictDuplicateGroups: strictDuplicateGroups.slice(0, 50).map((group) =>
      group.map((recipe) => ({
        id: String(recipe._id),
        uuid: recipe.uuid || null,
        name: recipe.name,
        active: recipe.isActive !== false,
        public: recipe.isPublic === true,
        createdAt: recipe.createdAt,
      })),
    ),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
