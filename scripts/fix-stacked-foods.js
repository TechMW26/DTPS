#!/usr/bin/env node
/**
 * ============================================================================
 *  DTPS — Fix Stacked Foods → Single Food Options Migration
 * ============================================================================
 *
 *  OLD format (stacked foods array):
 *    foodOption: {
 *      food: "quinoa + Quinoa Vegetable Rice",
 *      unit: "Multiple",
 *      cal: "1",
 *      foods: [
 *        { food: "quinoa", unit: "200 gm", cal: "", ... },
 *        { food: "Quinoa Vegetable Rice", unit: "1 serving", cal: "1", ... }
 *      ]
 *    }
 *
 *  NEW format (individual food options):
 *    foodOption1: { food: "quinoa", unit: "200 gm", cal: "", ... }
 *    foodOption2: { food: "Quinoa Vegetable Rice", unit: "1 serving", cal: "1", ... }
 *
 *  What this script does:
 *  1. Scans all DietTemplate documents for food options with a `foods` array
 *  2. For SINGLE-item stacked (foods.length === 1):
 *     - Copies the data from foods[0] into the parent foodOption
 *     - Removes the foods array
 *  3. For MULTI-item stacked (foods.length >= 2):
 *     - Splits the single foodOption into multiple individual foodOptions
 *     - Each inherits the parent's label, isAlternative flag
 *     - Removes the foods array
 *
 *  Usage:
 *    node scripts/fix-stacked-foods.js              # dry run (preview)
 *    node scripts/fix-stacked-foods.js --apply      # apply changes to DB
 *
 *  Requires: MONGODB_URI in env or .env.local
 * ============================================================================
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Load .env.local
// ---------------------------------------------------------------------------
const envPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) return;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
    });
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dtps';
const doApply = process.argv.includes('--apply');

// Colors
const C = {
    reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
    yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m',
    dim: '\x1b[2m', bold: '\x1b[1m',
};
function c(color, text) { return `${C[color]}${text}${C.reset}`; }

function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

async function main() {
    console.log(c('bold', '\n╔══════════════════════════════════════════════════╗'));
    console.log(c('bold', '║  Fix Stacked Foods → Single Food Options         ║'));
    console.log(c('bold', `║  Mode: ${doApply ? c('red', 'APPLY (will modify DB)') : c('yellow', 'DRY RUN (preview only)')}        ║`));
    console.log(c('bold', '╚══════════════════════════════════════════════════╝\n'));

    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;
    const col = db.collection('diettemplates');
    const docs = await col.find({}).toArray();

    let totalTemplatesFixed = 0;
    let totalSingleUnstacked = 0;
    let totalMultiFlattened = 0;
    let totalNewFoodOptions = 0;

    for (const doc of docs) {
        if (!doc.meals || !Array.isArray(doc.meals)) continue;

        let docChanged = false;
        const updatedMeals = JSON.parse(JSON.stringify(doc.meals));

        for (const dayPlan of updatedMeals) {
            if (!dayPlan.meals || typeof dayPlan.meals !== 'object') continue;

            for (const [mealKey, meal] of Object.entries(dayPlan.meals)) {
                if (!meal || !meal.foodOptions || !Array.isArray(meal.foodOptions)) continue;

                const newFoodOptions = [];

                for (const fo of meal.foodOptions) {
                    if (!fo.foods || !Array.isArray(fo.foods) || fo.foods.length === 0) {
                        // Already single format — keep as-is
                        newFoodOptions.push(fo);
                        continue;
                    }

                    docChanged = true;

                    if (fo.foods.length === 1) {
                        // SINGLE STACKED: Copy foods[0] data into parent, remove foods array
                        const singleFood = fo.foods[0];
                        const flattenedOption = {
                            id: fo.id || generateId(),
                            label: fo.label || '',
                            food: singleFood.food || fo.food || '',
                            unit: singleFood.unit || fo.unit || '',
                            cal: singleFood.cal || fo.cal || '',
                            carbs: singleFood.carbs || fo.carbs || '',
                            fats: singleFood.fats || fo.fats || '',
                            protein: singleFood.protein || fo.protein || '',
                            isAlternative: fo.isAlternative || false,
                        };
                        // Preserve recipeUuid if it exists
                        if (singleFood.recipeUuid) {
                            flattenedOption.recipeUuid = singleFood.recipeUuid;
                        } else if (fo.recipeUuid) {
                            flattenedOption.recipeUuid = fo.recipeUuid;
                        }
                        // Preserve fiber if it exists and is non-empty
                        if (singleFood.fiber && singleFood.fiber !== '') {
                            flattenedOption.fiber = singleFood.fiber;
                        } else if (fo.fiber && fo.fiber !== '') {
                            flattenedOption.fiber = fo.fiber;
                        }

                        newFoodOptions.push(flattenedOption);
                        totalSingleUnstacked++;

                    } else {
                        // MULTI STACKED: Split into individual food options
                        for (let i = 0; i < fo.foods.length; i++) {
                            const foodItem = fo.foods[i];
                            const individualOption = {
                                id: generateId(),
                                label: fo.label || '',
                                food: foodItem.food || '',
                                unit: foodItem.unit || '',
                                cal: foodItem.cal || '',
                                carbs: foodItem.carbs || '',
                                fats: foodItem.fats || '',
                                protein: foodItem.protein || '',
                                isAlternative: fo.isAlternative || false,
                            };
                            if (foodItem.recipeUuid) {
                                individualOption.recipeUuid = foodItem.recipeUuid;
                            }
                            if (foodItem.fiber && foodItem.fiber !== '') {
                                individualOption.fiber = foodItem.fiber;
                            }
                            newFoodOptions.push(individualOption);
                            totalNewFoodOptions++;
                        }
                        totalMultiFlattened++;
                    }
                }

                // Replace the meal's foodOptions
                meal.foodOptions = newFoodOptions;
            }
        }

        if (docChanged) {
            totalTemplatesFixed++;
            const name = doc.name || '<unnamed>';

            if (doApply) {
                await col.updateOne({ _id: doc._id }, { $set: { meals: updatedMeals } });
                console.log(`  ${c('green', '✓')} Fixed "${name}"`);
            } else {
                console.log(`  ${c('yellow', '○')} Would fix "${name}"`);
            }
        }
    }

    // Summary
    console.log(c('bold', '\n══════════════════════════════════════════════════'));
    console.log(c('bold', '  Summary'));
    console.log(c('bold', '══════════════════════════════════════════════════\n'));
    console.log(`  Templates ${doApply ? 'fixed' : 'to fix'}:          ${c('cyan', String(totalTemplatesFixed))}`);
    console.log(`  Single-item unstacked:      ${c('green', String(totalSingleUnstacked))} (foods[1] → single food)`);
    console.log(`  Multi-item flattened:       ${c('green', String(totalMultiFlattened))} (foods[2+] → individual options)`);
    console.log(`  New food options created:   ${c('blue', String(totalNewFoodOptions))} (from multi-item splits)`);
    console.log('');

    if (!doApply && totalTemplatesFixed > 0) {
        console.log(c('yellow', '  This was a DRY RUN. No changes were made.'));
        console.log(c('yellow', '  Run with --apply to save changes to the database.\n'));
    } else if (doApply && totalTemplatesFixed > 0) {
        console.log(c('green', '  All changes have been applied to the database! ✓\n'));
    } else {
        console.log(c('green', '  No templates need fixing — all food options are already in single format. ✓\n'));
    }

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error(c('red', '\nFatal error:'), err);
    mongoose.disconnect();
    process.exit(1);
});
