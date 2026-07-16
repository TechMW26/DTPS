import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import Recipe from '@/lib/db/models/Recipe';
import { UserRole } from '@/types';
import { clearCacheByTag } from '@/lib/api/utils';
import { batchFindDuplicates, findSimilarRecipes, compareIngredients, mergeRecipeData } from '@/lib/recipe-dedup';
import OpenAI from 'openai';

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

const AVAILABLE_DIETARY_RESTRICTIONS = [
  'Vegetarian', 'Vegan', 'Gluten-Free', 'Non-Vegetarian', 'Dairy-Free',
  'Keto', 'Low-Carb', 'Low-Fat', 'High-Protein', 'Paleo', 'Mediterranean'
];

const AVAILABLE_MEDICAL_CONTRAINDICATIONS = [
  'Diabetes', 'High Blood Pressure', 'Heart Disease', 'Kidney Disease',
  'Liver Disease', 'High Cholesterol', 'Thyroid Disorders', 'Gout',
  'Acid Reflux/GERD', 'IBS (Irritable Bowel Syndrome)', 'Celiac Disease',
  'Lactose Intolerance', 'Gallbladder Disease', 'Osteoporosis', 'Anemia',
  'Food Allergies', 'Pregnancy', 'Breastfeeding'
];

const VALID_UNITS = [
  'grams', 'kg', 'ounces', 'pounds', 'ml', 'liters', 'cups',
  'tablespoons', 'teaspoons', 'pieces', 'slices', 'cloves', 'bunches'
];

const PORTION_SIZES = [
  '1 TSP ( 5 gm/ml )', '1.5 TSP ( 7.5 gm/ml )', '1/2 TSP ( 2.5 gm/ml )',
  '2 TSP ( 10 gm/ml )', '2.5 TSP ( 15 gm/ml )', '1 TBSP ( 15 gm/ml )',
  '1.5 TBSP ( 22.5 gm/ml )', '2 TBSP ( 30 gm/ml )',
  '1/2 SMALL BOWL ( 100 gm/ml )', '1 SMALL BOWL ( 200 gm/ml )',
  '1.5 SMALL BOWL ( 300 gm/ml )', '2.5 SMALL BOWL ( 500 gm/ml )',
  '1 LARGE BOWL ( 300 gm/ml )', '1.5 LARGE BOWL ( 150 gm/ml )',
  '2 LARGE BOWL ( 600 gm/ml )', '1/2 GLASS ( 125 ml )',
  '1 GLASS ( 250 ml )', '1 LARGE GLASS ( 300 ml )',
  '1/2 CUP ( 75 ml )', '1 CUP ( 150 ml )',
  '1 SMALL KATORI ( 100 gm/ml )', '1 MEDIUM KATORI ( 180 gm/ml )',
  '1 LARGE KATORI ( 250 gm/ml )', '1 PLATE ( 100 gm )',
  '1 MEDIUM PLATE ( 160 gm )', '1 LARGE PLATE ( 220 gm )',
  'GRAM', 'ML', 'EGG WHOLE ( 50 GM WHOLE )', 'EGG WHITE ( 33 GM )',
  '1 DATES ( 10 GM )', 'FIG (ANJEER) ( 15 gm )',
  'SEASONAL FRUIT ( 100 gm )', 'SEASONAL FRUIT ( 200 gm )',
  'ROTI ( 35 GM )', 'FULLKA ( 25 GM )', 'STUFFED ROTI ( 50 GM )',
  'PARATHA ( 45 GM )', 'STUFFED PARATHA ( 80 GM )',
  'BREAD (SMALL) ( 25 GM )', 'BREAD (MEDIUM) ( 35 GM )', 'BREAD (LARGE) ( 45 GM )'
];

// ---- Helpers ----

function parseServingsToNumber(servingsStr: string): number {
  const str = String(servingsStr).trim();
  const match = str.match(/^[\s]*([0-9]+(?:\/[0-9]+)?(?:\.[0-9]+)?)/);
  if (match && match[1]) {
    const qStr = match[1];
    if (qStr.includes('/')) {
      const [num, den] = qStr.split('/').map(Number);
      if (!isNaN(num) && !isNaN(den) && den !== 0) return num / den;
    } else {
      const n = parseFloat(qStr);
      if (!isNaN(n)) return n;
    }
  }
  return 1;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry with exponential backoff for rate limits
async function generateRecipeWithRetry(recipeName: string, maxRetries = 4): Promise<any> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await generateRecipeFromAI(recipeName);
    } catch (err: any) {
      lastError = err;
      const isRateLimit =
        err?.status === 429 ||
        err?.code === 'rate_limit_exceeded' ||
        err?.error?.type === 'tokens' ||
        err?.message?.toLowerCase()?.includes('rate limit') ||
        err?.status === 503;

      if (isRateLimit && attempt < maxRetries) {
        // Exponential backoff: 2s, 4s, 8s, 16s + jitter
        const backoffMs = Math.pow(2, attempt + 1) * 1000 + Math.random() * 1000;
        console.log(`Rate limited on "${recipeName}", retrying in ${(backoffMs / 1000).toFixed(1)}s (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(backoffMs);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

async function generateRecipeFromAI(recipeName: string) {
  const prompt = `You are a professional Indian nutritionist and chef. Given a recipe name, provide detailed nutritional and ingredient information. While the focus is Indian cuisine, handle any cuisine type accurately.

Recipe Name: "${recipeName}"

Respond with ONLY a valid JSON object (no markdown, no code blocks) with this exact structure:
{
  "description": "A brief 1-2 sentence description of the dish",
  "prepTime": <number in minutes>,
  "cookTime": <number in minutes>,
  "portionSize": "<exactly one of the portion sizes listed below>",
  "ingredients": [
    {
      "name": "<ingredient name>",
      "quantity": <number>,
      "unit": "<one of: ${VALID_UNITS.join(', ')}>",
      "remarks": "<optional prep instructions>"
    }
  ],
  "nutrition": {
    "calories": <total calories per serving, integer>,
    "protein": <grams, number with up to 1 decimal>,
    "carbs": <grams, number with up to 1 decimal>,
    "fat": <grams, number with up to 1 decimal>
  },
  "dietaryRestrictions": [<from: ${AVAILABLE_DIETARY_RESTRICTIONS.join(', ')}>],
  "medicalContraindications": [<from: ${AVAILABLE_MEDICAL_CONTRAINDICATIONS.join(', ')}>],
  "instructions": [<array of step-by-step cooking instructions>]
}

Available portion sizes (pick the MOST appropriate one):
${PORTION_SIZES.map(p => `"${p}"`).join(', ')}

Rules:
- For curries/dals/gravies: use BOWL or KATORI sizes
- For rotis/chapatis: use ROTI/FULLKA/PARATHA sizes
- For rice dishes: use PLATE sizes
- For drinks: use GLASS sizes
- For chutneys/sauces: use TSP/TBSP sizes
- Calculate nutrition based on the portion size selected
- Include 4-8 ingredients, 4-8 steps
- Non-veg items must include "Non-Vegetarian" tag
- Be accurate with nutritional values`;

  const completion = await getOpenAIClient().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a nutrition expert and professional chef specializing in Indian cuisine. Always respond with valid JSON only. No markdown formatting, no code blocks, just raw JSON.'
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 2000,
  });

  const responseText = completion.choices[0]?.message?.content?.trim();
  if (!responseText) throw new Error('Empty AI response');

  let cleanJson = responseText;
  if (cleanJson.startsWith('```')) {
    cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const data = JSON.parse(cleanJson);

  const portionSize = PORTION_SIZES.includes(data.portionSize)
    ? data.portionSize
    : '1 SMALL BOWL ( 200 gm/ml )';

  return {
    description: typeof data.description === 'string' ? data.description : '',
    prepTime: Math.max(0, parseInt(data.prepTime) || 0),
    cookTime: Math.max(0, parseInt(data.cookTime) || 0),
    portionSize,
    servings: parseServingsToNumber(portionSize),
    ingredients: Array.isArray(data.ingredients)
      ? data.ingredients
          .filter((ing: any) => ing.name && typeof ing.name === 'string')
          .map((ing: any) => ({
            name: ing.name.trim(),
            quantity: Math.max(0, parseFloat(ing.quantity) || 0),
            unit: VALID_UNITS.includes(ing.unit) ? ing.unit : 'grams',
            remarks: typeof ing.remarks === 'string' ? ing.remarks.trim() : '',
          }))
      : [],
    nutrition: {
      calories: Math.max(0, parseInt(data.nutrition?.calories) || 0),
      protein: Math.max(0, parseFloat(Number(data.nutrition?.protein).toFixed(1)) || 0),
      carbs: Math.max(0, parseFloat(Number(data.nutrition?.carbs).toFixed(1)) || 0),
      fat: Math.max(0, parseFloat(Number(data.nutrition?.fat).toFixed(1)) || 0),
    },
    dietaryRestrictions: Array.isArray(data.dietaryRestrictions)
      ? data.dietaryRestrictions.filter((r: string) => AVAILABLE_DIETARY_RESTRICTIONS.includes(r))
      : [],
    medicalContraindications: Array.isArray(data.medicalContraindications)
      ? data.medicalContraindications.filter((c: string) => AVAILABLE_MEDICAL_CONTRAINDICATIONS.includes(c))
      : [],
    instructions: Array.isArray(data.instructions)
      ? data.instructions.filter((i: any) => typeof i === 'string' && i.trim())
      : [],
  };
}

// ---- Streaming SSE endpoint ----

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for large batches

export async function POST(request: Request) {
  // Auth check
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const role = session.user.role;
  if (role !== UserRole.DIETITIAN && role !== UserRole.HEALTH_COUNSELOR && role !== UserRole.ADMIN) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { recipeNames } = body;

  if (!recipeNames || typeof recipeNames !== 'string' || recipeNames.trim().length < 2) {
    return new Response(JSON.stringify({ error: 'Please provide comma-separated recipe names' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parse names and deduplicate
  const namesSet = new Set<string>();
  const names: string[] = [];
  for (const raw of recipeNames.split(',')) {
    const trimmed = raw.trim();
    if (trimmed.length >= 2) {
      const key = trimmed.toLowerCase();
      if (!namesSet.has(key)) {
        namesSet.add(key);
        names.push(trimmed);
      }
    }
  }

  if (names.length === 0) {
    return new Response(JSON.stringify({ error: 'No valid recipe names provided' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (names.length > 500) {
    return new Response(JSON.stringify({ error: 'Maximum 500 recipes per batch' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userId = session.user.id;
  const totalCount = names.length;
  // Concurrency: 3 at a time, delay between batches to pace API calls
  const BATCH_SIZE = 3;
  const BATCH_DELAY_MS = 500;

  // Create a streaming SSE response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        await connectDB();

        // ── Pre-check: batch find all duplicates BEFORE calling AI ──
        const duplicateMap = await batchFindDuplicates(names);
        const namesToGenerate: string[] = [];
        const skippedResults: { index: number; name: string; existingName: string }[] = [];

        for (let i = 0; i < names.length; i++) {
          const dup = duplicateMap.get(names[i]);
          if (dup) {
            skippedResults.push({ index: i, name: names[i], existingName: dup.existingName });
          } else {
            namesToGenerate.push(names[i]);
          }
        }

        const skippedCount = skippedResults.length;

        send('init', {
          total: totalCount,
          names,
          skipped: skippedCount,
          generating: namesToGenerate.length,
        });

        let successCount = 0;
        let mergedCount = 0;
        let errorCount = 0;
        let processedCount = 0;

        // ── Immediately report all pre-checked duplicates ──
        for (const sk of skippedResults) {
          processedCount++;
          send('recipe', {
            index: sk.index, name: sk.name, status: 'skipped',
            message: `Already exists as "${sk.existingName}"`,
            progress: processedCount, total: totalCount,
          });
        }

        // ── Process only new names in batches ──
        for (let batchStart = 0; batchStart < namesToGenerate.length; batchStart += BATCH_SIZE) {
          const batch = namesToGenerate.slice(batchStart, batchStart + BATCH_SIZE);

          const batchPromises = batch.map(async (recipeName) => {
            const index = names.indexOf(recipeName);
            try {
              // AI generation with automatic retry on rate limits
              const aiData = await generateRecipeWithRetry(recipeName);

              // ── Post-generation dedup: check if AI ingredients match an existing recipe ──
              const similarRecipes = await findSimilarRecipes(recipeName, 3);
              let merged = false;
              for (const sim of similarRecipes) {
                const cmp = compareIngredients(aiData.ingredients, sim.ingredients || []);
                if (cmp.similar) {
                  // Merge into existing recipe instead of creating duplicate
                  await mergeRecipeData(sim._id.toString(), {
                    description: aiData.description,
                    prepTime: aiData.prepTime,
                    cookTime: aiData.cookTime,
                    servings: aiData.servings,
                    servingSize: aiData.portionSize,
                    calories: aiData.nutrition.calories,
                    protein: aiData.nutrition.protein,
                    carbs: aiData.nutrition.carbs,
                    fat: aiData.nutrition.fat,
                    ingredients: aiData.ingredients,
                    instructions: aiData.instructions,
                    dietaryRestrictions: aiData.dietaryRestrictions,
                    medicalContraindications: aiData.medicalContraindications,
                  });
                  mergedCount++;
                  processedCount++;
                  send('recipe', {
                    index, name: recipeName, status: 'merged',
                    message: `Merged into "${sim.name}"`,
                    id: sim._id.toString(),
                    progress: processedCount, total: totalCount,
                  });
                  merged = true;
                  break;
                }
              }
              if (merged) return;

              // No similar recipe — create new
              const recipeDoc: any = {
                name: recipeName,
                description: aiData.description,
                prepTime: aiData.prepTime,
                cookTime: aiData.cookTime,
                totalTime: aiData.prepTime + aiData.cookTime,
                servings: aiData.servings,
                servingSize: aiData.portionSize,
                calories: aiData.nutrition.calories,
                protein: aiData.nutrition.protein,
                carbs: aiData.nutrition.carbs,
                fat: aiData.nutrition.fat,
                ingredients: aiData.ingredients,
                instructions: aiData.instructions,
                dietaryRestrictions: aiData.dietaryRestrictions,
                medicalContraindications: aiData.medicalContraindications,
                isActive: true,
                createdBy: userId,
                tags: [],
              };

              const recipe = new Recipe(recipeDoc);
              await recipe.save();

              successCount++;
              processedCount++;
              send('recipe', {
                index, name: recipeName, status: 'success',
                id: recipe._id.toString(),
                progress: processedCount, total: totalCount,
              });
            } catch (err: any) {
              console.error(`Error creating "${recipeName}":`, err?.message || err);
              errorCount++;
              processedCount++;
              send('recipe', {
                index, name: recipeName, status: 'error',
                message: err?.message?.substring(0, 100) || 'Failed to generate',
                progress: processedCount, total: totalCount,
              });
            }
          });

          await Promise.all(batchPromises);

          // Pace between batches
          if (batchStart + BATCH_SIZE < namesToGenerate.length) {
            await sleep(BATCH_DELAY_MS);
          }
        }

        // Clear recipe cache
        try { await clearCacheByTag('recipes'); } catch {}

        const parts: string[] = [];
        if (successCount > 0) parts.push(`${successCount} created`);
        if (mergedCount > 0) parts.push(`${mergedCount} merged`);
        if (skippedCount > 0) parts.push(`${skippedCount} skipped`);
        if (errorCount > 0) parts.push(`${errorCount} failed`);

        send('done', {
          successCount, mergedCount, skippedCount, errorCount, total: totalCount,
          message: parts.join(', ') || 'No recipes processed',
        });

      } catch (err: any) {
        console.error('Bulk stream error:', err);
        send('error', { message: err?.message || 'Unexpected error' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
