import dotenv from 'dotenv';
import {getNativeDatabase} from '../src/lib/db/database';
import {hydrateNativeDocument,prepareNativePatch} from '../src/lib/storage/native-document';
import {nativeDates} from '../src/lib/db/repository/native-plan-editor';
import {nativeCommerceAdmin} from '../src/lib/db/repository/native-staff-ecommerce';
import {
  getRecipePublicationIssues,
  getStrictRecipeFingerprint,
} from '../src/lib/recipe-quality';

dotenv.config({ path: '.env', quiet: true });
dotenv.config({ path: '.env.local', override: true, quiet: true });

const db=getNativeDatabase();
async function loadRecipes(){const rows:Record<string,any>[]=[];let cursor:FirebaseFirestore.QueryDocumentSnapshot|undefined;while(true){let q=db.collection('recipes').orderBy('__name__').limit(100).select('name','uuid','ingredients','instructions','servings','servingSize','isActive','isPublic','mergedInto','image','images','videoUrl','usageCount','favoriteCount','createdAt','tags','_nativeExternalFields');if(cursor)q=q.startAfter(cursor);const snap=await q.get();if(snap.empty)break;for(const row of snap.docs)rows.push({_id:row.id,...nativeDates(await hydrateNativeDocument(row.data()))});cursor=snap.docs[snap.docs.length-1];}return rows;}


async function main() {


  const recipes = await loadRecipes();
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
  const saladSearchResults = recipes.filter(r=>String(r.name||'').toLowerCase().includes('salad')).sort((a,b)=>String(a.name).localeCompare(String(b.name))).slice(0,25);

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
    await db.terminate();
  });
