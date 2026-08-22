import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Recipe from '../src/lib/db/models/Recipe';
import {
  getStrictRecipeFingerprint,
  recipeCompletenessScore,
  type RecipeQualityInput,
} from '../src/lib/recipe-quality';

dotenv.config({ path: '.env', quiet: true });
dotenv.config({ path: '.env.local', override: true, quiet: true });

function requireMongoUri(): string {
  const value = process.env.MONGODB_URI;
  if (!value) throw new Error('MONGODB_URI is not configured');
  return value;
}

const uri = requireMongoUri();

type RecipeRow = RecipeQualityInput & Record<string, any> & {
  _id: mongoose.Types.ObjectId;
};

function chooseCanonical(group: RecipeRow[]): RecipeRow {
  return [...group].sort((a, b) => {
    const activeDifference = Number(b.isActive !== false) - Number(a.isActive !== false);
    if (activeDifference) return activeDifference;

    const publicDifference = Number(b.isPublic === true) - Number(a.isPublic === true);
    if (publicDifference) return publicDifference;

    const qualityDifference = recipeCompletenessScore(b) - recipeCompletenessScore(a);
    if (qualityDifference) return qualityDifference;

    const engagementA = Number(a.usageCount || 0) + Number(a.favoriteCount || 0);
    const engagementB = Number(b.usageCount || 0) + Number(b.favoriteCount || 0);
    if (engagementA !== engagementB) return engagementB - engagementA;

    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  })[0];
}

function mergedMedia(canonical: RecipeRow, group: RecipeRow[]) {
  const imageCandidates = group
    .flatMap((recipe) => [recipe.image, ...(Array.isArray(recipe.images) ? recipe.images : [])])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  return {
    image: canonical.image || imageCandidates[0] || '',
    images: [...new Set(imageCandidates)],
    videoUrl: canonical.videoUrl || group.find((recipe) => recipe.videoUrl)?.videoUrl || '',
  };
}

async function main() {
  const applyChanges = process.argv.includes('--apply');
  await mongoose.connect(uri);

  const recipes = await Recipe.find({ mergedInto: null }).lean<RecipeRow[]>();
  const groups = new Map<string, RecipeRow[]>();

  for (const recipe of recipes) {
    const fingerprint = getStrictRecipeFingerprint(recipe);
    const group = groups.get(fingerprint) || [];
    group.push(recipe);
    groups.set(fingerprint, group);
  }

  const duplicateGroups = [...groups.values()].filter((group) => group.length > 1);
  const report: Array<Record<string, unknown>> = [];

  for (const group of duplicateGroups) {
    const canonical = chooseCanonical(group);
    const duplicates = group.filter((recipe) => !recipe._id.equals(canonical._id));
    const media = mergedMedia(canonical, group);

    report.push({
      canonical: {
        id: String(canonical._id),
        uuid: canonical.uuid,
        name: canonical.name,
      },
      archived: duplicates.map((recipe) => ({
        id: String(recipe._id),
        uuid: recipe.uuid,
        name: recipe.name,
      })),
    });

    if (!applyChanges) continue;

    const mergedAt = new Date();
    await Recipe.collection.updateOne(
      { _id: canonical._id },
      {
        $set: media,
        $inc: {
          usageCount: duplicates.reduce((sum, recipe) => sum + Number(recipe.usageCount || 0), 0),
          favoriteCount: duplicates.reduce((sum, recipe) => sum + Number(recipe.favoriteCount || 0), 0),
        },
      },
    );

    await Recipe.collection.updateMany(
      { _id: { $in: duplicates.map((recipe) => recipe._id) } },
      {
        $set: {
          isActive: false,
          isPublic: false,
          mergedInto: canonical._id,
          mergedAt,
        },
      },
    );
  }

  console.log(JSON.stringify({
    mode: applyChanges ? 'applied' : 'dry-run',
    duplicateGroups: duplicateGroups.length,
    redundantRecords: duplicateGroups.reduce((sum, group) => sum + group.length - 1, 0),
    report,
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
