#!/usr/bin/env node

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dtps';
const REPORTS_DIR = path.join(process.cwd(), 'reports');

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

function toCsvValue(value) {
    const raw = String(value == null ? '' : value);
    if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
        return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
}

function ensureReportsDir() {
    if (!fs.existsSync(REPORTS_DIR)) {
        fs.mkdirSync(REPORTS_DIR, { recursive: true });
    }
}

function writeReports(payload, rows, timestamp) {
    ensureReportsDir();

    const jsonPath = path.join(REPORTS_DIR, `recipe-detail-audit-${timestamp}.json`);
    const csvPath = path.join(REPORTS_DIR, `recipe-detail-audit-${timestamp}.csv`);

    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');

    const header = [
        'issueType',
        '_id',
        'uuid',
        'name',
        'missingName',
        'missingDescription',
        'missingIngredients',
        'missingInstructions',
        'dietaryRestrictions',
        'tags',
    ];

    const csvLines = [header.join(',')];
    rows.forEach((row) => {
        csvLines.push([
            row.issueType,
            row._id,
            row.uuid,
            row.name,
            row.missingName,
            row.missingDescription,
            row.missingIngredients,
            row.missingInstructions,
            row.dietaryRestrictions,
            row.tags,
        ].map(toCsvValue).join(','));
    });

    fs.writeFileSync(csvPath, `${csvLines.join('\n')}\n`, 'utf8');

    return { jsonPath, csvPath };
}

async function run() {
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;
    const timestamp = new Date().toISOString().replace(/[.:]/g, '-');

    const recipes = await db.collection('recipes').find({}, {
        projection: {
            _id: 1,
            uuid: 1,
            name: 1,
            description: 1,
            ingredients: 1,
            instructions: 1,
            dietaryRestrictions: 1,
            tags: 1,
            isActive: 1,
            createdAt: 1,
            updatedAt: 1,
        }
    }).toArray();

    const missingDetail = [];
    const vegConflict = [];
    const reportRows = [];

    const nonVegWords = ['chicken', 'mutton', 'fish', 'egg', 'prawn', 'shrimp', 'beef', 'pork', 'meat'];

    for (const recipe of recipes) {
        const id = String(recipe._id);
        const name = String(recipe.name || '').trim();
        const description = String(recipe.description || '').trim();
        const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
        const instructions = asArray(recipe.instructions);
        const dietary = asArray(recipe.dietaryRestrictions).map(normalize);
        const tags = asArray(recipe.tags).map(normalize);

        const hasMissing =
            !name ||
            !description ||
            ingredients.length === 0 ||
            instructions.length === 0;

        if (hasMissing) {
            const item = {
                _id: id,
                uuid: recipe.uuid || '',
                name,
                missing: {
                    name: !name,
                    description: !description,
                    ingredients: ingredients.length === 0,
                    instructions: instructions.length === 0,
                },
            };

            missingDetail.push(item);
            reportRows.push({
                issueType: 'missing-detail',
                _id: item._id,
                uuid: item.uuid,
                name: item.name,
                missingName: item.missing.name,
                missingDescription: item.missing.description,
                missingIngredients: item.missing.ingredients,
                missingInstructions: item.missing.instructions,
                dietaryRestrictions: '',
                tags: '',
            });
        }

        const hasVegMarker = dietary.includes('vegetarian') || tags.includes('vegetarian') || tags.includes('veg');
        const hasNonVegMarker =
            dietary.includes('non-vegetarian') ||
            tags.includes('non-vegetarian') ||
            hasAny(name, nonVegWords) ||
            ingredients.some((ingredient) => hasAny(ingredient?.name, nonVegWords));

        if (hasVegMarker && hasNonVegMarker) {
            const item = {
                _id: id,
                uuid: recipe.uuid || '',
                name,
                dietaryRestrictions: recipe.dietaryRestrictions || [],
                tags: recipe.tags || [],
            };

            vegConflict.push(item);
            reportRows.push({
                issueType: 'veg-nonveg-conflict',
                _id: item._id,
                uuid: item.uuid,
                name: item.name,
                missingName: false,
                missingDescription: false,
                missingIngredients: false,
                missingInstructions: false,
                dietaryRestrictions: JSON.stringify(item.dietaryRestrictions),
                tags: JSON.stringify(item.tags),
            });
        }
    }

    const payload = {
        generatedAt: new Date().toISOString(),
        totalRecipes: recipes.length,
        counts: {
            missingDetail: missingDetail.length,
            vegConflict: vegConflict.length,
            totalIssues: reportRows.length,
        },
        missingDetail,
        vegConflict,
    };

    const reportPaths = writeReports(payload, reportRows, timestamp);

    console.log('=== Recipe Detail Audit ===');
    console.log(`Total recipes: ${recipes.length}`);
    console.log(`Recipes with missing detail fields: ${missingDetail.length}`);
    console.log(`Recipes with veg/non-veg conflict: ${vegConflict.length}`);
    console.log(`JSON report: ${reportPaths.jsonPath}`);
    console.log(`CSV report: ${reportPaths.csvPath}`);

    if (missingDetail.length > 0) {
        console.log('\n--- Missing Detail (first 25) ---');
        missingDetail.slice(0, 25).forEach((item, idx) => {
            console.log(`${idx + 1}. ${item._id} [${item.uuid}] ${item.name}`);
            console.log(`   Missing -> name:${item.missing.name} description:${item.missing.description} ingredients:${item.missing.ingredients} instructions:${item.missing.instructions}`);
        });
    }

    if (vegConflict.length > 0) {
        console.log('\n--- Veg/Non-Veg Conflict (first 25) ---');
        vegConflict.slice(0, 25).forEach((item, idx) => {
            console.log(`${idx + 1}. ${item._id} [${item.uuid}] ${item.name}`);
            console.log(`   dietaryRestrictions=${JSON.stringify(item.dietaryRestrictions)} tags=${JSON.stringify(item.tags)}`);
        });
    }

    await mongoose.disconnect();
}

run().catch(async (error) => {
    console.error('Audit failed:', error.message);
    try {
        await mongoose.disconnect();
    } catch (_) { }
    process.exit(1);
});
