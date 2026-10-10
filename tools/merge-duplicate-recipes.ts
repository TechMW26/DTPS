import {FieldValue} from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import {getNativeDatabase} from '../src/lib/db/database';
import {hydrateNativeDocument,prepareNativePatch} from '../src/lib/storage/native-document';
import {nativeDates} from '../src/lib/db/repository/native-plan-editor';
import {nativeCommerceAdmin} from '../src/lib/db/repository/native-staff-ecommerce';
import {
  getStrictRecipeFingerprint,
  recipeCompletenessScore,
  type RecipeQualityInput,
} from '../src/lib/recipe-quality';

dotenv.config({ path: '.env', quiet: true });
dotenv.config({ path: '.env.local', override: true, quiet: true });

const db=getNativeDatabase();
async function loadRecipes(){const rows:Record<string,any>[]=[];let cursor:FirebaseFirestore.QueryDocumentSnapshot|undefined;while(true){let q=db.collection('recipes').orderBy('__name__').limit(100).select('name','uuid','ingredients','instructions','servings','servingSize','isActive','isPublic','mergedInto','image','images','videoUrl','usageCount','favoriteCount','createdAt','tags','_nativeExternalFields');if(cursor)q=q.startAfter(cursor);const snap=await q.get();if(snap.empty)break;for(const row of snap.docs)rows.push({_id:row.id,...nativeDates(await hydrateNativeDocument(row.data()))});cursor=snap.docs[snap.docs.length-1];}return rows;}


type RecipeRow = RecipeQualityInput & Record<string, any> & {
  _id: string;
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
  const actorId=process.argv.find(v=>v.startsWith('--actor-id='))?.slice(11);
  if(applyChanges){if(!actorId)throw new Error('--actor-id is required when applying changes');await nativeCommerceAdmin(db,actorId);}


  const recipes = (await loadRecipes()).filter(r=>!r.mergedInto) as RecipeRow[];
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
    const duplicates = group.filter((recipe) => recipe._id!==canonical._id);
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

    if(group.length>400)throw new Error('Duplicate group requires a bounded manual review');
    await db.runTransaction(async tx=>{
      await nativeCommerceAdmin(db,actorId!,tx);
      const rows=await tx.getAll(...group.map(r=>db.collection('recipes').doc(r._id)));
      const fresh=await Promise.all(rows.map(async r=>{if(!r.exists||r.get('mergedInto'))throw new Error('Recipe changed; re-run dry-run');return {_id:r.id,...nativeDates(await hydrateNativeDocument(r.data()!))} as RecipeRow;}));
      const fingerprint=getStrictRecipeFingerprint(canonical);
      if(fresh.some(r=>getStrictRecipeFingerprint(r)!==fingerprint))throw new Error('Recipe content changed; re-run dry-run');
      const selected=fresh.find(r=>r._id===canonical._id)!,others=fresh.filter(r=>r._id!==canonical._id),now=new Date();
      const canonicalRow=rows.find(r=>r.id===canonical._id)!;
      tx.update(canonicalRow.ref,await prepareNativePatch(canonicalRow.data()!,{...mergedMedia(selected,fresh),usageCount:fresh.reduce((sum,r)=>sum+Number(r.usageCount||0),0),favoriteCount:fresh.reduce((sum,r)=>sum+Number(r.favoriteCount||0),0),updatedAt:now}));
      for(const row of rows)if(row.id!==canonical._id)tx.update(row.ref,{isActive:false,isPublic:false,mergedInto:canonical._id,_nativeAdminUuid:FieldValue.delete(),mergedAt:now,updatedAt:now});
    });
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
    await db.terminate();
  });
