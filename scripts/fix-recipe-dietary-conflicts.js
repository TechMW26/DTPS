#!/usr/bin/env node

const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dtps';
const APPLY_MODE = process.argv.includes('--apply');

function asArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null || value === '') return [];
    if (typeof value === 'string') {
        return value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return [String(value)];
}

function normalize(value) {
    return String(value || '').trim().toLowerCase();
}

function hasAny(text, terms) {
    const lower = normalize(text);
    return terms.some((term) => {
        const escaped = String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`\\b${escaped}\\b`, 'i');
        return pattern.test(lower);
    });
}

function uniquePreserveCase(values) {
    const seen = new Set();
    const output = [];

    values.forEach((value) => {
        const key = normalize(value);
        if (!key || seen.has(key)) return;
        seen.add(key);
        output.push(String(value).trim());
    });

    return output;
}

function removeVegMarkers(values) {
    return values.filter((value) => {
        const v = normalize(value);
        return v !== 'vegetarian' && v !== 'veg';
    });
}

function ensureNonVegMarker(values) {
    const normalized = values.map(normalize);
    if (normalized.includes('non-vegetarian')) {
        return values;
    }
    return [...values, 'Non-Vegetarian'];
}

async function run() {
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;

    const nonVegWords = ['chicken', 'mutton', 'fish', 'egg', 'prawn', 'shrimp', 'beef', 'pork', 'meat'];

    const recipes = await db.collection('recipes').find({}, {
        projection: {
            _id: 1,
            uuid: 1,
            name: 1,
            ingredients: 1,
            dietaryRestrictions: 1,
            tags: 1,
            updatedAt: 1,
        }
    }).toArray();

    const candidates = [];

    recipes.forEach((recipe) => {
        const name = String(recipe.name || '');
        const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
        const dietaryRestrictions = uniquePreserveCase(asArray(recipe.dietaryRestrictions));
        const tags = uniquePreserveCase(asArray(recipe.tags));

        const dietaryNormalized = dietaryRestrictions.map(normalize);
        const tagNormalized = tags.map(normalize);

        const hasVegMarker = dietaryNormalized.includes('vegetarian') || tagNormalized.includes('vegetarian') || tagNormalized.includes('veg');
        const hasNonVegMarker =
            dietaryNormalized.includes('non-vegetarian') ||
            tagNormalized.includes('non-vegetarian') ||
            hasAny(name, nonVegWords) ||
            ingredients.some((ingredient) => hasAny(ingredient && ingredient.name, nonVegWords));

        if (!(hasVegMarker && hasNonVegMarker)) {
            return;
        }

        const nextDietary = ensureNonVegMarker(removeVegMarkers(dietaryRestrictions));
        const nextTags = removeVegMarkers(tags);

        const changedDietary = JSON.stringify(nextDietary) !== JSON.stringify(dietaryRestrictions);
        const changedTags = JSON.stringify(nextTags) !== JSON.stringify(tags);

        if (!changedDietary && !changedTags) {
            return;
        }

        candidates.push({
            _id: recipe._id,
            uuid: recipe.uuid || '',
            name,
            prevDietary: dietaryRestrictions,
            nextDietary,
            prevTags: tags,
            nextTags,
        });
    });

    console.log('=== Recipe Dietary Conflict Fix ===');
    console.log(`Mode: ${APPLY_MODE ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`Total recipes scanned: ${recipes.length}`);
    console.log(`Conflict candidates to fix: ${candidates.length}`);

    if (candidates.length > 0) {
        console.log('\n--- Planned changes (first 25) ---');
        candidates.slice(0, 25).forEach((item, index) => {
            console.log(`${index + 1}. ${String(item._id)} [${item.uuid}] ${item.name}`);
            console.log(`   dietary: ${JSON.stringify(item.prevDietary)} -> ${JSON.stringify(item.nextDietary)}`);
            console.log(`   tags: ${JSON.stringify(item.prevTags)} -> ${JSON.stringify(item.nextTags)}`);
        });
    }

    if (APPLY_MODE && candidates.length > 0) {
        const bulkOps = candidates.map((item) => ({
            updateOne: {
                filter: { _id: item._id },
                update: {
                    $set: {
                        dietaryRestrictions: item.nextDietary,
                        tags: item.nextTags,
                        updatedAt: new Date(),
                    }
                }
            }
        }));

        const result = await db.collection('recipes').bulkWrite(bulkOps, { ordered: false });
        console.log('\n--- Apply result ---');
        console.log(`matchedCount: ${result.matchedCount}`);
        console.log(`modifiedCount: ${result.modifiedCount}`);
    }

    await mongoose.disconnect();
}

run().catch(async (error) => {
    console.error('Fix script failed:', error.message);
    try {
        await mongoose.disconnect();
    } catch (_) { }
    process.exit(1);
});
