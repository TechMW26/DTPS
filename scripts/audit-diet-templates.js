#!/usr/bin/env node
/**
 * ============================================================================
 *  DTPS — Diet Template Audit & Migration Script
 * ============================================================================
 *
 *  What this script does:
 *  1. Connects to MongoDB and reads ALL documents from both collections
 *     (diettemplates & mealplantemplates).
 *  2. Compares every document field-by-field against the CURRENT Mongoose
 *     schema definitions (DietTemplate.ts & MealPlanTemplate.ts).
 *  3. Reports issues:  missing fields, wrong types, unknown/extra fields,
 *     bad enum values, invalid meal-type keys, empty meals, etc.
 *  4. Optionally FIXes the documents in-place (--fix flag).
 *  5. Prints a full sample of a healthy template at the end.
 *
 *  Usage:
 *    node scripts/audit-diet-templates.js              # audit only (read-only)
 *    node scripts/audit-diet-templates.js --fix        # audit + apply fixes
 *    node scripts/audit-diet-templates.js --sample     # just print a sample
 *    node scripts/audit-diet-templates.js --fix --dry  # show fixes without saving
 *
 *  Requires:  MONGODB_URI in env or .env.local  (falls back to localhost)
 * ============================================================================
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Load .env.local if present
// ---------------------------------------------------------------------------
const envPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  });
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dtps';

// ---------------------------------------------------------------------------
// Canonical schema definitions (mirrors DietTemplate.ts & MealPlanTemplate.ts)
// ---------------------------------------------------------------------------

const VALID_CATEGORIES = [
  'weight-loss', 'weight-gain', 'maintenance', 'muscle-gain',
  'diabetes', 'heart-healthy', 'keto', 'vegan', 'custom'
];

const VALID_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];

const VALID_MEAL_TYPE_KEYS = [
  'EARLY_MORNING', 'BREAKFAST', 'MID_MORNING', 'LUNCH',
  'MID_EVENING', 'EVENING', 'DINNER', 'PAST_DINNER'
];

const CANONICAL_MEAL_LABELS = {
  EARLY_MORNING: 'Early Morning',
  BREAKFAST: 'Breakfast',
  MID_MORNING: 'Mid Morning',
  LUNCH: 'Lunch',
  MID_EVENING: 'Mid Evening',
  EVENING: 'Evening',
  DINNER: 'Dinner',
  PAST_DINNER: 'Post Dinner',
};

const CANONICAL_MEAL_TIMES = {
  EARLY_MORNING: '06:00 AM',
  BREAKFAST: '09:00 AM',
  MID_MORNING: '11:00 AM',
  LUNCH: '01:00 PM',
  MID_EVENING: '04:00 PM',
  EVENING: '06:00 PM',
  DINNER: '07:00 PM',
  PAST_DINNER: '09:00 PM',
};

// All label→key mapping (lowercase → canonical key)
const LABEL_TO_KEY = {};
for (const [key, label] of Object.entries(CANONICAL_MEAL_LABELS)) {
  LABEL_TO_KEY[label.toLowerCase()] = key;
  LABEL_TO_KEY[key.toLowerCase()] = key;
  // Also handle common variations
  LABEL_TO_KEY[label.toLowerCase().replace(/\s+/g, '_')] = key;
  LABEL_TO_KEY[label.toLowerCase().replace(/\s+/g, '')] = key;
}
// Extra aliases
LABEL_TO_KEY['morning snack'] = 'MID_MORNING';
LABEL_TO_KEY['morningsnack'] = 'MID_MORNING';
LABEL_TO_KEY['afternoon snack'] = 'MID_EVENING';
LABEL_TO_KEY['afternoonsnack'] = 'MID_EVENING';
LABEL_TO_KEY['evening snack'] = 'PAST_DINNER';
LABEL_TO_KEY['eveningsnack'] = 'PAST_DINNER';
LABEL_TO_KEY['post dinner'] = 'PAST_DINNER';
LABEL_TO_KEY['postdinner'] = 'PAST_DINNER';
LABEL_TO_KEY['past_dinner'] = 'PAST_DINNER';
LABEL_TO_KEY['mid_morning'] = 'MID_MORNING';
LABEL_TO_KEY['mid_evening'] = 'MID_EVENING';
LABEL_TO_KEY['early_morning'] = 'EARLY_MORNING';
LABEL_TO_KEY['pre breakfast'] = 'EARLY_MORNING';
LABEL_TO_KEY['prebreakfast'] = 'EARLY_MORNING';
LABEL_TO_KEY['snack'] = 'MID_EVENING';
LABEL_TO_KEY['supper'] = 'DINNER';
LABEL_TO_KEY['brunch'] = 'MID_MORNING';

function normalizeMealKey(input) {
  if (!input) return null;
  const lower = String(input).toLowerCase().trim();
  return LABEL_TO_KEY[lower] || null;
}

// ---------------------------------------------------------------------------
// DietTemplate expected fields  (top-level)
// ---------------------------------------------------------------------------
const DIET_TEMPLATE_FIELDS = {
  uuid: { type: 'string', required: false },
  name: { type: 'string', required: true },
  description: { type: 'string', required: false },
  category: { type: 'enum', values: VALID_CATEGORIES, required: true },
  duration: { type: 'number', required: true, min: 1, max: 365 },
  targetCalories: { type: 'object', required: false, shape: { min: 'number', max: 'number' } },
  targetMacros: {
    type: 'object', required: false, shape: {
      protein: { min: 'number', max: 'number' },
      carbs: { min: 'number', max: 'number' },
      fat: { min: 'number', max: 'number' },
    }
  },
  dietaryRestrictions: { type: 'array', required: false },
  tags: { type: 'array', required: false },
  meals: { type: 'array', required: false },
  mealTypes: { type: 'array', required: false },
  isPublic: { type: 'boolean', required: false, default: false },
  isPremium: { type: 'boolean', required: false, default: false },
  isActive: { type: 'boolean', required: false, default: true },
  difficulty: { type: 'enum', values: VALID_DIFFICULTIES, required: false, default: 'intermediate' },
  prepTime: { type: 'object', required: false, shape: { daily: 'number', weekly: 'number' } },
  targetAudience: { type: 'object', required: false },
  createdBy: { type: 'objectId', required: true },
  usageCount: { type: 'number', required: false, default: 0 },
  averageRating: { type: 'number', required: false },
  reviews: { type: 'array', required: false },
};

// Mongo system fields to ignore
const SYSTEM_FIELDS = new Set(['_id', '__v', 'createdAt', 'updatedAt', 'id']);

// ---------------------------------------------------------------------------
// Audit functions
// ---------------------------------------------------------------------------

function auditDietTemplate(doc) {
  const issues = [];
  const fixes = {};
  const raw = doc.toObject ? doc.toObject() : doc;

  // 1. Check required fields
  for (const [field, spec] of Object.entries(DIET_TEMPLATE_FIELDS)) {
    const val = raw[field];
    if (spec.required && (val === undefined || val === null || val === '')) {
      issues.push({ field, issue: 'MISSING_REQUIRED', detail: `Required field "${field}" is missing` });
    }
  }

  // 2. Check category enum
  if (raw.category && !VALID_CATEGORIES.includes(raw.category)) {
    issues.push({ field: 'category', issue: 'INVALID_ENUM', detail: `"${raw.category}" not in ${VALID_CATEGORIES.join(',')}` });
    // Try to fix common misspellings
    const lower = raw.category.toLowerCase().replace(/\s+/g, '-');
    if (VALID_CATEGORIES.includes(lower)) {
      fixes.category = lower;
    } else {
      fixes.category = 'custom';
    }
  }

  // 3. Check difficulty enum
  if (raw.difficulty && !VALID_DIFFICULTIES.includes(raw.difficulty)) {
    issues.push({ field: 'difficulty', issue: 'INVALID_ENUM', detail: `"${raw.difficulty}" not in ${VALID_DIFFICULTIES.join(',')}` });
    fixes.difficulty = 'intermediate';
  }

  // 4. Check duration
  if (raw.duration !== undefined) {
    if (typeof raw.duration !== 'number' || raw.duration < 1 || raw.duration > 365) {
      issues.push({ field: 'duration', issue: 'INVALID_VALUE', detail: `duration=${raw.duration} (expected 1-365)` });
      if (typeof raw.duration === 'string') fixes.duration = parseInt(raw.duration) || 7;
    }
  }

  // 5. Check targetCalories
  if (raw.targetCalories) {
    if (typeof raw.targetCalories !== 'object') {
      issues.push({ field: 'targetCalories', issue: 'WRONG_TYPE', detail: `Expected object, got ${typeof raw.targetCalories}` });
      fixes.targetCalories = { min: 1200, max: 2500 };
    } else {
      if (raw.targetCalories.min === undefined || raw.targetCalories.min === null) {
        issues.push({ field: 'targetCalories.min', issue: 'MISSING', detail: 'min not set' });
        if (!fixes.targetCalories) fixes.targetCalories = { ...raw.targetCalories };
        fixes.targetCalories.min = 1200;
      }
      if (raw.targetCalories.max === undefined || raw.targetCalories.max === null) {
        issues.push({ field: 'targetCalories.max', issue: 'MISSING', detail: 'max not set' });
        if (!fixes.targetCalories) fixes.targetCalories = { ...raw.targetCalories };
        fixes.targetCalories.max = 2500;
      }
    }
  } else {
    issues.push({ field: 'targetCalories', issue: 'MISSING', detail: 'No targetCalories set, using defaults' });
    fixes.targetCalories = { min: 1200, max: 2500 };
  }

  // 6. Check targetMacros
  if (raw.targetMacros) {
    for (const macro of ['protein', 'carbs', 'fat']) {
      if (!raw.targetMacros[macro]) {
        issues.push({ field: `targetMacros.${macro}`, issue: 'MISSING', detail: `${macro} macro range not set` });
        if (!fixes.targetMacros) fixes.targetMacros = { ...raw.targetMacros };
        fixes.targetMacros[macro] = { min: macro === 'protein' ? 50 : macro === 'carbs' ? 100 : 30, max: macro === 'protein' ? 150 : macro === 'carbs' ? 300 : 100 };
      }
    }
  } else {
    issues.push({ field: 'targetMacros', issue: 'MISSING', detail: 'No targetMacros set, using defaults' });
    fixes.targetMacros = {
      protein: { min: 50, max: 150 },
      carbs: { min: 100, max: 300 },
      fat: { min: 30, max: 100 }
    };
  }

  // 7. Check mealTypes
  if (raw.mealTypes && Array.isArray(raw.mealTypes)) {
    const fixedMealTypes = [];
    let needsFix = false;
    for (const mt of raw.mealTypes) {
      if (!mt.name) {
        issues.push({ field: 'mealTypes', issue: 'EMPTY_NAME', detail: 'mealType entry has no name' });
        needsFix = true;
        continue;
      }
      const key = normalizeMealKey(mt.name);
      if (!key) {
        issues.push({ field: 'mealTypes', issue: 'UNKNOWN_MEAL_TYPE', detail: `"${mt.name}" is not a recognized meal type` });
        fixedMealTypes.push(mt); // keep as-is, it's custom
      } else {
        const canonicalLabel = CANONICAL_MEAL_LABELS[key];
        const canonicalTime = CANONICAL_MEAL_TIMES[key];
        if (mt.name !== canonicalLabel) {
          issues.push({ field: 'mealTypes', issue: 'NON_CANONICAL_NAME', detail: `"${mt.name}" → should be "${canonicalLabel}"` });
          needsFix = true;
        }
        fixedMealTypes.push({ name: canonicalLabel, time: mt.time || canonicalTime });
      }
    }
    if (needsFix) fixes.mealTypes = fixedMealTypes;
  } else if (!raw.mealTypes || raw.mealTypes.length === 0) {
    issues.push({ field: 'mealTypes', issue: 'MISSING', detail: 'No mealTypes defined, using defaults' });
    fixes.mealTypes = VALID_MEAL_TYPE_KEYS.map(k => ({
      name: CANONICAL_MEAL_LABELS[k],
      time: CANONICAL_MEAL_TIMES[k]
    }));
  }

  // 8. Check meals (day plans)
  if (raw.meals && Array.isArray(raw.meals)) {
    if (raw.meals.length === 0) {
      issues.push({ field: 'meals', issue: 'EMPTY', detail: 'meals array is empty (no day plans)' });
    } else {
      let fixedMeals = null;
      raw.meals.forEach((dayPlan, dayIdx) => {
        // Check day plan structure
        if (!dayPlan.id && !dayPlan.day) {
          issues.push({ field: `meals[${dayIdx}]`, issue: 'NO_ID_OR_DAY', detail: 'Day plan has no id or day field' });
        }

        // Check meals object within day plan
        if (dayPlan.meals && typeof dayPlan.meals === 'object') {
          const mealKeys = Object.keys(dayPlan.meals);
          if (mealKeys.length === 0) {
            issues.push({ field: `meals[${dayIdx}].meals`, issue: 'EMPTY', detail: 'Day plan has empty meals object' });
          }

          for (const mealKey of mealKeys) {
            const meal = dayPlan.meals[mealKey];
            const normalizedKey = normalizeMealKey(mealKey);

            if (!normalizedKey && !VALID_MEAL_TYPE_KEYS.includes(mealKey)) {
              issues.push({
                field: `meals[${dayIdx}].meals.${mealKey}`,
                issue: 'UNKNOWN_MEAL_KEY',
                detail: `"${mealKey}" is not a recognized meal type key`
              });
            }

            // Check meal structure
            if (meal && typeof meal === 'object') {
              if (!meal.name && !meal.id) {
                issues.push({
                  field: `meals[${dayIdx}].meals.${mealKey}`,
                  issue: 'NO_NAME_OR_ID',
                  detail: 'Meal has no name or id'
                });
              }

              // Check food options
              if (meal.foodOptions && Array.isArray(meal.foodOptions)) {
                meal.foodOptions.forEach((fo, foIdx) => {
                  // cal should be string but check for NaN
                  if (fo.cal !== undefined && fo.cal !== '' && isNaN(parseFloat(fo.cal))) {
                    issues.push({
                      field: `meals[${dayIdx}].meals.${mealKey}.foodOptions[${foIdx}].cal`,
                      issue: 'INVALID_CAL',
                      detail: `cal="${fo.cal}" is not a valid number`
                    });
                  }
                  // Check for stacked foods
                  if (fo.foods && Array.isArray(fo.foods)) {
                    fo.foods.forEach((sf, sfIdx) => {
                      if (!sf.food && !sf.id) {
                        issues.push({
                          field: `meals[${dayIdx}].meals.${mealKey}.foodOptions[${foIdx}].foods[${sfIdx}]`,
                          issue: 'EMPTY_STACKED_FOOD',
                          detail: 'Stacked food item has no food name or id'
                        });
                      }
                    });
                  }
                });
              }
            }
          }
        } else if (!dayPlan.meals) {
          issues.push({ field: `meals[${dayIdx}].meals`, issue: 'MISSING', detail: 'Day plan has no meals object' });
          // Set empty meals object as fix
          if (!fixedMeals) fixedMeals = JSON.parse(JSON.stringify(raw.meals));
          fixedMeals[dayIdx].meals = {};
        }
      });
      if (fixedMeals) fixes.meals = fixedMeals;
    }
  }

  // 9. Check boolean fields have correct type
  for (const boolField of ['isPublic', 'isPremium', 'isActive']) {
    if (raw[boolField] !== undefined && typeof raw[boolField] !== 'boolean') {
      issues.push({ field: boolField, issue: 'WRONG_TYPE', detail: `Expected boolean, got ${typeof raw[boolField]} (${raw[boolField]})` });
      fixes[boolField] = !!raw[boolField];
    }
  }

  // 10. Check for extra/unknown fields
  for (const key of Object.keys(raw)) {
    if (!SYSTEM_FIELDS.has(key) && !DIET_TEMPLATE_FIELDS[key]) {
      issues.push({ field: key, issue: 'UNKNOWN_FIELD', detail: `Field "${key}" is not defined in the schema` });
    }
  }

  // 11. Ensure default values for missing optional fields
  if (raw.isActive === undefined) {
    issues.push({ field: 'isActive', issue: 'MISSING_DEFAULT', detail: 'isActive not set, should default to true' });
    fixes.isActive = true;
  }
  if (raw.usageCount === undefined) {
    issues.push({ field: 'usageCount', issue: 'MISSING_DEFAULT', detail: 'usageCount not set, defaulting to 0' });
    fixes.usageCount = 0;
  }
  if (!raw.difficulty) {
    issues.push({ field: 'difficulty', issue: 'MISSING_DEFAULT', detail: 'difficulty not set, defaulting to "intermediate"' });
    fixes.difficulty = 'intermediate';
  }

  return { issues, fixes };
}

// ---------------------------------------------------------------------------
// Pretty printers
// ---------------------------------------------------------------------------

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

function c(color, text) { return `${COLORS[color]}${text}${COLORS.reset}`; }

function printTemplateHeader(doc) {
  const name = doc.name || '<no name>';
  const id = doc._id?.toString()?.slice(-6) || '?';
  const uuid = doc.uuid || '-';
  return `${c('bold', name)} ${c('dim', `(id:…${id}  uuid:${uuid})`)}`;
}

function printIssues(issues) {
  if (issues.length === 0) {
    console.log(`   ${c('green', '✓ No issues found')}`);
    return;
  }
  for (const iss of issues) {
    const color = iss.issue.startsWith('MISSING') || iss.issue === 'EMPTY' ? 'yellow' : 'red';
    console.log(`   ${c(color, `✗ [${iss.issue}]`)} ${c('dim', iss.field)} — ${iss.detail}`);
  }
}

function printSampleTemplate(doc) {
  const raw = doc.toObject ? doc.toObject() : doc;
  console.log(c('cyan', '\n═══════════════════════════════════════════════════════'));
  console.log(c('cyan', '  SAMPLE TEMPLATE (what a correct document looks like)'));
  console.log(c('cyan', '═══════════════════════════════════════════════════════\n'));
  const sample = {
    _id: raw._id,
    uuid: raw.uuid || '<auto-generated>',
    name: raw.name,
    description: raw.description || '',
    category: raw.category,
    duration: raw.duration,
    targetCalories: raw.targetCalories || { min: 1200, max: 2500 },
    targetMacros: raw.targetMacros || {
      protein: { min: 50, max: 150 },
      carbs: { min: 100, max: 300 },
      fat: { min: 30, max: 100 }
    },
    dietaryRestrictions: raw.dietaryRestrictions || [],
    tags: raw.tags || [],
    mealTypes: raw.mealTypes || VALID_MEAL_TYPE_KEYS.map(k => ({
      name: CANONICAL_MEAL_LABELS[k],
      time: CANONICAL_MEAL_TIMES[k]
    })),
    meals: raw.meals
      ? `[${raw.meals.length} day plans]  — showing first day ↓`
      : '[] (empty)',
    isPublic: raw.isPublic ?? false,
    isPremium: raw.isPremium ?? false,
    isActive: raw.isActive ?? true,
    difficulty: raw.difficulty || 'intermediate',
    prepTime: raw.prepTime || { daily: 30, weekly: 210 },
    targetAudience: raw.targetAudience || { ageGroup: [], activityLevel: [], healthConditions: [], goals: [] },
    createdBy: raw.createdBy,
    usageCount: raw.usageCount || 0,
    averageRating: raw.averageRating || null,
    reviews: raw.reviews?.length ? `[${raw.reviews.length} reviews]` : '[]',
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };

  console.log(JSON.stringify(sample, null, 2));

  // Print first day plan detail
  if (raw.meals && raw.meals.length > 0) {
    const firstDay = raw.meals[0];
    console.log(c('cyan', '\n  ┌─ First Day Plan Detail:'));
    console.log(JSON.stringify(firstDay, null, 2).split('\n').map(l => `  │ ${l}`).join('\n'));
    console.log(c('cyan', '  └────────────────────────'));
  }

  // Print expected schema shape
  console.log(c('magenta', '\n═══════════════════════════════════════════════════════'));
  console.log(c('magenta', '  EXPECTED SCHEMA SHAPE (DietTemplate model)'));
  console.log(c('magenta', '═══════════════════════════════════════════════════════\n'));
  console.log(`  ${c('bold', 'Top-level fields:')}`);
  for (const [field, spec] of Object.entries(DIET_TEMPLATE_FIELDS)) {
    const req = spec.required ? c('red', 'REQUIRED') : c('dim', 'optional');
    const type = spec.type === 'enum' ? `enum(${spec.values.join('|')})` : spec.type;
    const def = spec.default !== undefined ? ` default=${JSON.stringify(spec.default)}` : '';
    console.log(`    ${c('cyan', field.padEnd(22))} ${type.padEnd(20)} ${req}${def}`);
  }

  console.log(`\n  ${c('bold', 'meals[] → Day Plan shape:')}`);
  console.log(`    ${'id'.padEnd(22)} string`);
  console.log(`    ${'day'.padEnd(22)} string | number   (e.g. "Day 1 - Mon")`);
  console.log(`    ${'date'.padEnd(22)} string`);
  console.log(`    ${'meals'.padEnd(22)} object { [MealTypeKey]: Meal }`);
  console.log(`    ${'note'.padEnd(22)} string`);

  console.log(`\n  ${c('bold', 'Meal shape (inside meals.{key}):')}`);
  console.log(`    ${'id'.padEnd(22)} string`);
  console.log(`    ${'time'.padEnd(22)} string  (e.g. "09:00 AM")`);
  console.log(`    ${'name'.padEnd(22)} string  (e.g. "Breakfast")`);
  console.log(`    ${'foodOptions[]'.padEnd(22)} array of FoodOption`);
  console.log(`    ${'showAlternatives'.padEnd(22)} boolean`);

  console.log(`\n  ${c('bold', 'FoodOption shape:')}`);
  console.log(`    ${'id'.padEnd(22)} string`);
  console.log(`    ${'label'.padEnd(22)} string  (e.g. "Option 1")`);
  console.log(`    ${'food'.padEnd(22)} string  (food name)`);
  console.log(`    ${'unit'.padEnd(22)} string  (e.g. "1 cup")`);
  console.log(`    ${'cal'.padEnd(22)} string  (calories as string)`);
  console.log(`    ${'carbs'.padEnd(22)} string`);
  console.log(`    ${'fats'.padEnd(22)} string`);
  console.log(`    ${'protein'.padEnd(22)} string`);
  console.log(`    ${'recipeUuid'.padEnd(22)} string  (optional recipe ref)`);
  console.log(`    ${'foods[]'.padEnd(22)} array   (optional stacked foods)`);
  console.log(`    ${'isAlternative'.padEnd(22)} boolean (optional)`);

  console.log(`\n  ${c('bold', 'Valid meal type keys for meals object:')}`);
  for (const key of VALID_MEAL_TYPE_KEYS) {
    console.log(`    ${c('green', key.padEnd(18))} → "${CANONICAL_MEAL_LABELS[key]}" (${CANONICAL_MEAL_TIMES[key]})`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const doFix = args.includes('--fix');
  const dryRun = args.includes('--dry');
  const sampleOnly = args.includes('--sample');

  console.log(c('bold', '\n╔══════════════════════════════════════════════════╗'));
  console.log(c('bold', '║   DTPS  Diet Template Audit & Migration Script   ║'));
  console.log(c('bold', '╚══════════════════════════════════════════════════╝\n'));

  if (doFix && !dryRun) {
    console.log(c('red', '  ⚠  FIX mode enabled — documents WILL be updated in the database.\n'));
  } else if (doFix && dryRun) {
    console.log(c('yellow', '  ℹ  DRY RUN mode — fixes will be shown but NOT saved.\n'));
  } else {
    console.log(c('green', '  ℹ  Audit mode (read-only). Use --fix to apply corrections.\n'));
  }

  // Connect
  console.log(c('dim', `  Connecting to: ${MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}...`));
  await mongoose.connect(MONGODB_URI);
  console.log(c('green', '  ✓ Connected to MongoDB\n'));

  const db = mongoose.connection.db;

  // ---------------------------------------------------------------------------
  // 1. Audit DietTemplate collection
  // ---------------------------------------------------------------------------
  const dtCollection = db.collection('diettemplates');
  const dtCount = await dtCollection.countDocuments();
  console.log(c('bold', `═══ DietTemplate Collection: ${dtCount} documents ═══\n`));

  const dtDocs = await dtCollection.find({}).toArray();

  let dtHealthy = 0;
  let dtIssueCount = 0;
  let dtFixedCount = 0;
  let sampleDoc = null;

  for (const doc of dtDocs) {
    const { issues, fixes } = auditDietTemplate(doc);
    const header = printTemplateHeader(doc);

    if (issues.length === 0) {
      dtHealthy++;
      if (!sampleDoc) sampleDoc = doc;
      if (!sampleOnly) console.log(`  ${c('green', '✓')} ${header}`);
    } else {
      dtIssueCount++;
      console.log(`  ${c('yellow', '⚠')} ${header}  — ${c('red', `${issues.length} issues`)}`);
      printIssues(issues);

      if (doFix && Object.keys(fixes).length > 0) {
        console.log(`     ${c('blue', '→ Fixes:')} ${JSON.stringify(fixes).substring(0, 200)}${JSON.stringify(fixes).length > 200 ? '…' : ''}`);
        if (!dryRun) {
          await dtCollection.updateOne({ _id: doc._id }, { $set: fixes });
          console.log(`     ${c('green', '✓ Applied fixes')}`);
          dtFixedCount++;
        } else {
          console.log(`     ${c('yellow', '(dry run — not applied)')}`);
        }
      }
    }
  }

  console.log('');
  console.log(c('bold', '  DietTemplate Summary:'));
  console.log(`    Total:   ${dtCount}`);
  console.log(`    Healthy: ${c('green', String(dtHealthy))}`);
  console.log(`    Issues:  ${c(dtIssueCount > 0 ? 'red' : 'green', String(dtIssueCount))}`);
  if (doFix) console.log(`    Fixed:   ${c('blue', String(dtFixedCount))}`);

  // ---------------------------------------------------------------------------
  // 2. Audit MealPlanTemplate collection
  // ---------------------------------------------------------------------------
  const mptCollection = db.collection('mealplantemplates');
  const mptCount = await mptCollection.countDocuments();
  console.log(c('bold', `\n═══ MealPlanTemplate Collection: ${mptCount} documents ═══\n`));

  if (mptCount > 0) {
    const mptDocs = await mptCollection.find({}).toArray();
    let mptHealthy = 0;
    let mptIssueCount = 0;

    for (const doc of mptDocs) {
      const issues = [];
      const raw = doc;

      // Basic checks
      if (!raw.name) issues.push({ field: 'name', issue: 'MISSING_REQUIRED', detail: 'name is missing' });
      if (!raw.category || !VALID_CATEGORIES.includes(raw.category)) {
        issues.push({ field: 'category', issue: 'INVALID_ENUM', detail: `"${raw.category}" not valid` });
      }
      if (!raw.duration || raw.duration < 1) {
        issues.push({ field: 'duration', issue: 'INVALID_VALUE', detail: `duration=${raw.duration}` });
      }
      if (!raw.meals || !Array.isArray(raw.meals) || raw.meals.length === 0) {
        issues.push({ field: 'meals', issue: 'EMPTY', detail: 'No daily meals defined' });
      } else {
        raw.meals.forEach((day, i) => {
          if (!day.day) issues.push({ field: `meals[${i}].day`, issue: 'MISSING', detail: 'day number missing' });
          if (!day.totalNutrition) issues.push({ field: `meals[${i}].totalNutrition`, issue: 'MISSING', detail: 'totalNutrition not calculated' });
        });
      }
      if (!raw.createdBy) issues.push({ field: 'createdBy', issue: 'MISSING_REQUIRED', detail: 'createdBy is missing' });

      const header = printTemplateHeader(doc);
      if (issues.length === 0) {
        mptHealthy++;
        if (!sampleOnly) console.log(`  ${c('green', '✓')} ${header}`);
      } else {
        mptIssueCount++;
        console.log(`  ${c('yellow', '⚠')} ${header}  — ${c('red', `${issues.length} issues`)}`);
        printIssues(issues);
      }
    }

    console.log('');
    console.log(c('bold', '  MealPlanTemplate Summary:'));
    console.log(`    Total:   ${mptCount}`);
    console.log(`    Healthy: ${c('green', String(mptHealthy))}`);
    console.log(`    Issues:  ${c(mptIssueCount > 0 ? 'red' : 'green', String(mptIssueCount))}`);
  } else {
    console.log(c('dim', '  (no documents found)\n'));
  }

  // ---------------------------------------------------------------------------
  // 3. Print sample
  // ---------------------------------------------------------------------------
  if (sampleDoc) {
    printSampleTemplate(sampleDoc);
  } else if (dtDocs.length > 0) {
    // Use first available even if it has issues
    printSampleTemplate(dtDocs[0]);
  } else {
    console.log(c('yellow', '\n  No diet templates exist in the database to show as sample.'));
    // Print schema shape anyway
    printSampleTemplate({ name: '<example>', category: 'custom', duration: 7, meals: [] });
  }

  // ---------------------------------------------------------------------------
  // 4. Cross-check & FIX: templates whose meals use old/deprecated meal keys
  // ---------------------------------------------------------------------------
  console.log(c('bold', '\n═══ Meal Key Consistency Check & Migration ═══\n'));

  let mealKeyIssues = 0;
  let mealKeyFixedDocs = 0;
  const templatesNeedingMealKeyFix = [];

  for (const doc of dtDocs) {
    if (!doc.meals || !Array.isArray(doc.meals)) continue;
    let docHasIssues = false;
    for (const dayPlan of doc.meals) {
      if (!dayPlan.meals || typeof dayPlan.meals !== 'object') continue;
      for (const mealKey of Object.keys(dayPlan.meals)) {
        if (!VALID_MEAL_TYPE_KEYS.includes(mealKey)) {
          const normalized = normalizeMealKey(mealKey);
          if (!normalized) {
            console.log(`  ${c('red', '✗')} "${doc.name}" → "${dayPlan.day || dayPlan.id}" unknown key: ${c('red', mealKey)}`);
          } else {
            if (!docHasIssues) {
              // Only log first few per template to avoid flooding
              console.log(`  ${c('yellow', '⚠')} "${doc.name}" has old meal keys (e.g. "${mealKey}" → "${normalized}")`);
            }
          }
          mealKeyIssues++;
          docHasIssues = true;
        }
      }
    }
    if (docHasIssues) templatesNeedingMealKeyFix.push(doc);
  }

  if (mealKeyIssues === 0) {
    console.log(c('green', '  ✓ All templates use valid canonical meal type keys.\n'));
  } else {
    console.log(`\n  ${c('yellow', `${mealKeyIssues}`)} meal key issues across ${c('yellow', String(templatesNeedingMealKeyFix.length))} templates.`);

    if (doFix) {
      console.log(c('blue', '\n  Fixing meal keys in all affected templates...\n'));
      for (const doc of templatesNeedingMealKeyFix) {
        const updatedMeals = JSON.parse(JSON.stringify(doc.meals));
        let changed = false;

        for (const dayPlan of updatedMeals) {
          if (!dayPlan.meals || typeof dayPlan.meals !== 'object') continue;
          const newMeals = {};
          for (const [mealKey, mealValue] of Object.entries(dayPlan.meals)) {
            if (VALID_MEAL_TYPE_KEYS.includes(mealKey)) {
              newMeals[mealKey] = mealValue;
            } else {
              const normalized = normalizeMealKey(mealKey);
              if (normalized) {
                // Rename key to canonical form
                // If canonical key already exists, merge food options
                if (newMeals[normalized]) {
                  // Merge: append food options from old key into existing
                  const existing = newMeals[normalized];
                  const incoming = mealValue;
                  if (existing.foodOptions && incoming.foodOptions) {
                    existing.foodOptions = [...existing.foodOptions, ...incoming.foodOptions];
                  }
                } else {
                  // Update the meal name to canonical label
                  const updatedMeal = { ...mealValue };
                  if (CANONICAL_MEAL_LABELS[normalized]) {
                    updatedMeal.name = CANONICAL_MEAL_LABELS[normalized];
                  }
                  newMeals[normalized] = updatedMeal;
                }
                changed = true;
              } else {
                // Unknown key — keep as-is (custom meal type like "DETOX WATER")
                newMeals[mealKey] = mealValue;
              }
            }
          }
          dayPlan.meals = newMeals;
        }

        if (changed) {
          if (!dryRun) {
            await dtCollection.updateOne({ _id: doc._id }, { $set: { meals: updatedMeals } });
            console.log(`    ${c('green', '✓')} Fixed meal keys in "${doc.name}"`);
          } else {
            console.log(`    ${c('yellow', '○')} Would fix meal keys in "${doc.name}" (dry run)`);
          }
          mealKeyFixedDocs++;
        }
      }
      console.log(`\n  ${c('blue', `${mealKeyFixedDocs}`)} templates ${dryRun ? 'would be' : 'were'} updated with canonical meal keys.`);
    } else {
      console.log(c('yellow', '  Run with --fix to normalize these meal keys in the database.'));
    }
    console.log('');
  }

  // ---------------------------------------------------------------------------
  // Done
  // ---------------------------------------------------------------------------
  console.log(c('bold', '══════════════════════════════════════════════════'));
  console.log(c('bold', '  Audit complete.'));
  if (!doFix && (dtIssueCount > 0 || mealKeyIssues > 0)) {
    console.log(c('yellow', '  Run with --fix to auto-correct issues.'));
    console.log(c('yellow', '  Run with --fix --dry to preview fixes without saving.'));
  }
  console.log(c('bold', '══════════════════════════════════════════════════\n'));

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error(c('red', '\nFatal error:'), err);
  mongoose.disconnect();
  process.exit(1);
});
