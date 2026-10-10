import type {MongoDatabase,DocumentData} from '@/lib/db/mongo-types';
import {hydrateNativeDocument} from '@/lib/storage/native-document';
import {saveStaffRecipe,readStaffRecipe} from './native-staff-recipes';
const FILLER_WORDS = new Set([
  'recipe', 'style', 'homemade', 'home', 'made', 'special', 'classic',
  'traditional', 'authentic', 'easy', 'quick', 'simple', 'best',
  'delicious', 'tasty', 'yummy', 'healthy', 'indian', 'desi',
  'restaurant', 'hotel', 'dhaba', 'street', 'south', 'north',
  'the', 'a', 'an', 'and', 'or', 'with', 'without', 'in', 'on', 'of',
  'ki', 'ka', 'ke', 'wala', 'wali', 'wale', 'type',
]);

/** Common synonym pairs (order-independent) */
const SYNONYMS: Record<string, string> = {
  makhani: 'butter',
  makhanwala: 'butter',
  aloo: 'potato',
  gobi: 'cauliflower',
  palak: 'spinach',
  saag: 'spinach',
  chana: 'chickpea',
  chole: 'chickpea',
  rajma: 'kidney bean',
  bhindi: 'okra',
  baingan: 'eggplant',
  brinjal: 'eggplant',
  jeera: 'cumin',
  dahi: 'curd',
  yogurt: 'curd',
  yoghurt: 'curd',
  chawal: 'rice',
  chapati: 'roti',
  chapatti: 'roti',
  phulka: 'roti',
  fullka: 'roti',
  naan: 'naan',
  nan: 'naan',
  dal: 'dal',
  dhal: 'dal',
  daal: 'dal',
  lentil: 'dal',
  panir: 'paneer',
  keema: 'mince',
  qeema: 'mince',
  gobhi: 'cauliflower',
  shimla: 'capsicum',
  capsicum: 'capsicum',
  bell: 'capsicum',
  methi: 'fenugreek',
  lassi: 'lassi',
  raita: 'raita',
};

/**
 * Normalise a recipe name into a sorted set of canonical tokens.
 *
 *   "Paneer Butter Masala (Restaurant Style)" →  ["butter", "masala", "paneer"]
 *   "Makhani Paneer"                          →  ["butter", "paneer"]
 */
export function normalizeRecipeName(name: string): string[] {
  const cleaned = name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')          // remove parenthesised content
    .replace(/[^a-z0-9\s]/g, ' ')     // remove special chars
    .trim();

  const tokens = cleaned.split(/\s+/).filter(Boolean);

  const canonical = tokens
    .filter((t) => !FILLER_WORDS.has(t))
    .map((t) => SYNONYMS[t] || t);

  // dedupe & sort for order-independent comparison
  return [...new Set(canonical)].sort();
}

/**
 * Jaccard-style overlap ratio between two token arrays.
 * Returns a value 0–1.
 */
export function tokenOverlap(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

// ──────────────────────────────────────────────
// Ingredient comparison
// ──────────────────────────────────────────────

/** Protein / main-ingredient keywords that differentiate dishes */
const PRIMARY_INGREDIENT_KEYWORDS = new Set([
  'chicken', 'mutton', 'lamb', 'fish', 'prawn', 'shrimp', 'egg',
  'paneer', 'tofu', 'soya', 'mushroom', 'potato', 'cauliflower',
  'spinach', 'dal', 'chickpea', 'kidney bean', 'eggplant', 'okra',
  'rice', 'roti', 'naan', 'bread',
]);

/**
 * Extract the set of primary ingredient names from an ingredient array.
 */
function extractPrimaryIngredients(ingredients: { name: string }[]): Set<string> {
  const result = new Set<string>();
  for (const ing of ingredients) {
    const low = ing.name.toLowerCase().trim();
    const normalised = SYNONYMS[low] || low;
    // Check if any primary keyword appears in the name
    for (const keyword of PRIMARY_INGREDIENT_KEYWORDS) {
      if (normalised.includes(keyword) || low.includes(keyword)) {
        result.add(keyword);
      }
    }
  }
  return result;
}

/**
 * Compare two ingredient lists.
 * Returns { similar: boolean, overlap: number, primaryMatch: boolean }
 *
 *  - `overlap`  : Jaccard of all ingredient names (0–1)
 *  - `primaryMatch` : true when primary proteins / main ingredients overlap
 *  - `similar`  : true when the recipes are "the same dish"
 */
export function compareIngredients(
  a: { name: string }[],
  b: { name: string }[],
): { similar: boolean; overlap: number; primaryMatch: boolean } {
  if (a.length === 0 || b.length === 0) {
    // Blank records are invalid recipes, not evidence that two dishes are
    // duplicates. Publication validation handles them separately.
    return { similar: false, overlap: 0, primaryMatch: false };
  }

  const namesA = a.map((i) => (SYNONYMS[i.name.toLowerCase().trim()] || i.name.toLowerCase().trim()));
  const namesB = b.map((i) => (SYNONYMS[i.name.toLowerCase().trim()] || i.name.toLowerCase().trim()));

  const setA = new Set(namesA);
  const setB = new Set(namesB);
  let intersection = 0;
  for (const n of setA) if (setB.has(n)) intersection++;
  const union = new Set([...namesA, ...namesB]).size;
  const overlap = union === 0 ? 0 : intersection / union;

  const primaryA = extractPrimaryIngredients(a);
  const primaryB = extractPrimaryIngredients(b);

  let primaryOverlap = 0;
  for (const p of primaryA) if (primaryB.has(p)) primaryOverlap++;
  const primaryUnion = new Set([...primaryA, ...primaryB]).size;
  const primaryMatch = primaryUnion === 0 || primaryOverlap / primaryUnion >= 0.5;

  // Consider similar if ingredient overlap >= 50% AND primary ingredients match
  const similar = overlap >= 0.4 && primaryMatch;

  return { similar, overlap, primaryMatch };
}

export async function findNativeSimilarRecipes(db:MongoDatabase,name:string,limit=5){const tokens=normalizeRecipeName(name);if(!tokens.length)return [];const rows=await db.collection('recipes').select('name','ingredients','mergedInto','deletedAt','_nativeExternalFields').get();const matches=rows.docs.filter(d=>!d.get('mergedInto')&&!d.get('deletedAt')).map(d=>({row:d,overlap:tokenOverlap(tokens,normalizeRecipeName(d.get('name')||''))})).filter(d=>d.overlap>=0.4).sort((a,b)=>b.overlap-a.overlap).slice(0,limit);return Promise.all(matches.map(async ({row})=>{const data=row.data();if(data._nativeExternalFields)data._nativeExternalFields=data._nativeExternalFields.filter((r:any)=>r.path?.[0]==='ingredients');return {_id:row.id,...await hydrateNativeDocument(data)} as DocumentData;}));}
export async function nativeRecipeDuplicateMap(db:MongoDatabase,names:string[]){const rows=await db.collection('recipes').select('name','mergedInto','deletedAt').get(),map=new Map<string,{existingName:string}>();for(const name of names){const tokens=normalizeRecipeName(name);const found=rows.docs.find(d=>!d.get('mergedInto')&&!d.get('deletedAt')&&tokenOverlap(tokens,normalizeRecipeName(d.get('name')||''))>=0.8);if(found)map.set(name,{existingName:found.get('name')});}return map;}
export async function mergeNativeRecipe(db:MongoDatabase,actor:string,id:string,data:DocumentData){for(let attempt=0;attempt<4;attempt++){const existing=await readStaffRecipe(db,actor,id),patch:DocumentData={_nativeExpectedUpdatedAt:existing.updatedAt??null};for(const key of ['description','prepTime','cookTime','calories','protein','carbs','fat','instructions'])if(!existing[key]||(Array.isArray(existing[key])&&!existing[key].length))if(data[key]!==undefined)patch[key]=data[key];const names=new Set((existing.ingredients||[]).map((i:any)=>String(i.name).trim().toLowerCase()));patch.ingredients=[...(existing.ingredients||[]),...(data.ingredients||[]).filter((i:any)=>!names.has(String(i.name).trim().toLowerCase()))];for(const key of ['dietaryRestrictions','medicalContraindications'])patch[key]=[...new Set([...(existing[key]||[]),...(data[key]||[])])];try{return await saveStaffRecipe(db,actor,patch,id);}catch(e:any){if(e.status!==409||!e.message.includes('changed'))throw e;}}throw new Error('Recipe changed during merge');}
