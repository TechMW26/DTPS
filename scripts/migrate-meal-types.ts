/**
 * Migration Script: Normalize Meal Types to Canonical Format
 * 
 * This script migrates all existing meal type data to use the canonical
 * meal types defined in src/lib/mealConfig.ts
 * 
 * Run: npx ts-node --project tsconfig.json scripts/migrate-meal-types.ts
 * Or:  node -r tsconfig-paths/register scripts/migrate-meal-types.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

import { 
  MEAL_TYPE_KEYS, 
  MEAL_TYPES, 
  normalizeMealType,
  findClosestMealType,
  time12hTo24h,
  time24hTo12h,
  type MealTypeKey
} from '../src/lib/mealConfig';

// ============================================================================
// MIGRATION CONFIGURATION
// ============================================================================

interface MigrationStats {
  collection: string;
  totalDocuments: number;
  updated: number;
  skipped: number;
  errors: string[];
  unmappedMealTypes: Set<string>;
}

const stats: MigrationStats[] = [];

// ============================================================================
// MEAL TYPE MAPPING (Legacy to Canonical)
// ============================================================================

const LEGACY_MAPPINGS: Record<string, MealTypeKey> = {
  // Common legacy formats
  'early morning': 'EARLY_MORNING',
  'Early Morning': 'EARLY_MORNING',
  'EARLY MORNING': 'EARLY_MORNING',
  'earlymorning': 'EARLY_MORNING',
  'pre-breakfast': 'EARLY_MORNING',
  'wake up': 'EARLY_MORNING',
  
  'breakfast': 'BREAKFAST',
  'Breakfast': 'BREAKFAST',
  'BreakFast': 'BREAKFAST',
  'BREAKFAST': 'BREAKFAST',
  'morning': 'BREAKFAST',
  
  'mid morning': 'MID_MORNING',
  'Mid Morning': 'MID_MORNING',
  'MID MORNING': 'MID_MORNING',
  'midmorning': 'MID_MORNING',
  'mid-morning': 'MID_MORNING',
  'brunch': 'MID_MORNING',
  'morning snack': 'MID_MORNING',
  'morningSnack': 'MID_MORNING',
  'Snack': 'MID_MORNING',
  
  'lunch': 'LUNCH',
  'Lunch': 'LUNCH',
  'LUNCH': 'LUNCH',
  'noon': 'LUNCH',
  'afternoon': 'LUNCH',
  
  'mid evening': 'MID_EVENING',
  'Mid Evening': 'MID_EVENING',
  'MID EVENING': 'MID_EVENING',
  'midevening': 'MID_EVENING',
  'mid-evening': 'MID_EVENING',
  'afternoon snack': 'MID_EVENING',
  'afternoonSnack': 'MID_EVENING',
  'tea time': 'MID_EVENING',
  'snack': 'MID_EVENING',
  'Evening Snack': 'MID_EVENING',
  'evening snack': 'MID_EVENING',
  'eveningSnack': 'MID_EVENING',
  
  'evening': 'EVENING',
  'Evening': 'EVENING',
  'EVENING': 'EVENING',
  'eve': 'EVENING',
  
  'dinner': 'DINNER',
  'Dinner': 'DINNER',
  'DINNER': 'DINNER',
  'supper': 'DINNER',
  'night': 'DINNER',
  
  'past dinner': 'PAST_DINNER',
  'Past Dinner': 'PAST_DINNER',
  'PAST DINNER': 'PAST_DINNER',
  'pastdinner': 'PAST_DINNER',
  'post dinner': 'PAST_DINNER',
  'Post Dinner': 'PAST_DINNER',
  'postdinner': 'PAST_DINNER',
  'bedtime': 'PAST_DINNER',
  'Bedtime': 'PAST_DINNER',
  'BEDTIME': 'PAST_DINNER',
  'bed time': 'PAST_DINNER',
  'late night': 'PAST_DINNER',
};

function mapToCanonicalMealType(input: string): MealTypeKey | null {
  if (!input) return null;
  
  // Try direct mapping first
  if (LEGACY_MAPPINGS[input]) {
    return LEGACY_MAPPINGS[input];
  }
  
  // Try normalized lookup
  const normalized = normalizeMealType(input);
  if (normalized) return normalized;
  
  // Try case-insensitive match against canonical keys
  const upperInput = input.toUpperCase().replace(/[\s-]+/g, '_');
  if (MEAL_TYPE_KEYS.includes(upperInput as MealTypeKey)) {
    return upperInput as MealTypeKey;
  }
  
  return null;
}

// ============================================================================
// MIGRATION FUNCTIONS
// ============================================================================

async function migrateDietTemplates(db: mongoose.Connection): Promise<MigrationStats> {
  const collection = db.collection('diettemplates');
  const stat: MigrationStats = {
    collection: 'diettemplates',
    totalDocuments: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    unmappedMealTypes: new Set(),
  };

  try {
    const documents = await collection.find({}).toArray();
    stat.totalDocuments = documents.length;

    for (const doc of documents) {
      try {
        let needsUpdate = false;
        const updates: any = {};

        // Migrate mealTypes array
        if (doc.mealTypes && Array.isArray(doc.mealTypes)) {
          const newMealTypes = doc.mealTypes.map((mt: any) => {
            const canonical = mapToCanonicalMealType(mt.name);
            if (canonical && canonical !== mt.name) {
              needsUpdate = true;
              return {
                name: canonical,
                time: MEAL_TYPES[canonical].time12h
              };
            } else if (!canonical) {
              stat.unmappedMealTypes.add(mt.name);
            }
            return mt;
          });
          
          if (needsUpdate) {
            updates.mealTypes = newMealTypes;
          }
        }

        // Migrate meals array - update meal type keys in each day's meals
        if (doc.meals && Array.isArray(doc.meals)) {
          const newMeals = doc.meals.map((day: any) => {
            if (!day.meals) return day;
            
            const newDayMeals: any = {};
            let dayNeedsUpdate = false;
            
            for (const [mealType, mealData] of Object.entries(day.meals)) {
              const canonical = mapToCanonicalMealType(mealType);
              if (canonical && canonical !== mealType) {
                newDayMeals[canonical] = mealData;
                dayNeedsUpdate = true;
              } else {
                newDayMeals[mealType] = mealData;
                if (!canonical) {
                  stat.unmappedMealTypes.add(mealType);
                }
              }
            }
            
            if (dayNeedsUpdate) {
              needsUpdate = true;
              return { ...day, meals: newDayMeals };
            }
            return day;
          });
          
          if (needsUpdate) {
            updates.meals = newMeals;
          }
        }

        if (needsUpdate) {
          await collection.updateOne(
            { _id: doc._id },
            { $set: updates }
          );
          stat.updated++;
        } else {
          stat.skipped++;
        }
      } catch (err: any) {
        stat.errors.push(`Document ${doc._id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    stat.errors.push(`Collection error: ${err.message}`);
  }

  return stat;
}

async function migrateMealPlanTemplates(db: mongoose.Connection): Promise<MigrationStats> {
  const collection = db.collection('mealplantemplates');
  const stat: MigrationStats = {
    collection: 'mealplantemplates',
    totalDocuments: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    unmappedMealTypes: new Set(),
  };

  try {
    const documents = await collection.find({}).toArray();
    stat.totalDocuments = documents.length;

    for (const doc of documents) {
      try {
        let needsUpdate = false;
        const updates: any = {};

        // MealPlanTemplate uses different structure (breakfast, lunch, dinner as keys)
        // These are already canonical field names, but we may need to migrate mealTypes if present
        if (doc.mealTypes && Array.isArray(doc.mealTypes)) {
          const newMealTypes = doc.mealTypes.map((mt: any) => {
            const canonical = mapToCanonicalMealType(mt.name || mt);
            if (canonical) {
              needsUpdate = true;
              return typeof mt === 'string' ? canonical : {
                ...mt,
                name: canonical,
                time: MEAL_TYPES[canonical].time12h
              };
            }
            return mt;
          });
          
          if (needsUpdate) {
            updates.mealTypes = newMealTypes;
          }
        }

        if (needsUpdate) {
          await collection.updateOne(
            { _id: doc._id },
            { $set: updates }
          );
          stat.updated++;
        } else {
          stat.skipped++;
        }
      } catch (err: any) {
        stat.errors.push(`Document ${doc._id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    stat.errors.push(`Collection error: ${err.message}`);
  }

  return stat;
}

async function migrateDietaryRecalls(db: mongoose.Connection): Promise<MigrationStats> {
  const collection = db.collection('dietaryrecalls');
  const stat: MigrationStats = {
    collection: 'dietaryrecalls',
    totalDocuments: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    unmappedMealTypes: new Set(),
  };

  try {
    const documents = await collection.find({}).toArray();
    stat.totalDocuments = documents.length;

    for (const doc of documents) {
      try {
        let needsUpdate = false;
        const updates: any = {};

        // Migrate meals array
        if (doc.meals && Array.isArray(doc.meals)) {
          const newMeals = doc.meals.map((meal: any) => {
            if (!meal.mealType) return meal;
            
            const canonical = mapToCanonicalMealType(meal.mealType);
            if (canonical && canonical !== meal.mealType) {
              needsUpdate = true;
              return {
                ...meal,
                mealType: canonical,
                time: MEAL_TYPES[canonical].time24h
              };
            } else if (!canonical) {
              stat.unmappedMealTypes.add(meal.mealType);
            }
            return meal;
          });
          
          if (needsUpdate) {
            updates.meals = newMeals;
          }
        }

        if (needsUpdate) {
          await collection.updateOne(
            { _id: doc._id },
            { $set: updates }
          );
          stat.updated++;
        } else {
          stat.skipped++;
        }
      } catch (err: any) {
        stat.errors.push(`Document ${doc._id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    stat.errors.push(`Collection error: ${err.message}`);
  }

  return stat;
}

async function migrateJournalTracking(db: mongoose.Connection): Promise<MigrationStats> {
  const collection = db.collection('journaltrackings');
  const stat: MigrationStats = {
    collection: 'journaltrackings',
    totalDocuments: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    unmappedMealTypes: new Set(),
  };

  try {
    const documents = await collection.find({}).toArray();
    stat.totalDocuments = documents.length;

    for (const doc of documents) {
      try {
        let needsUpdate = false;
        const updates: any = {};

        // Migrate meals array
        if (doc.meals && Array.isArray(doc.meals)) {
          const newMeals = doc.meals.map((meal: any) => {
            if (!meal.mealType) return meal;
            
            const canonical = mapToCanonicalMealType(meal.mealType);
            if (canonical && canonical !== meal.mealType) {
              needsUpdate = true;
              return {
                ...meal,
                mealType: canonical
              };
            } else if (!canonical) {
              stat.unmappedMealTypes.add(meal.mealType);
            }
            return meal;
          });
          
          if (needsUpdate) {
            updates.meals = newMeals;
          }
        }

        if (needsUpdate) {
          await collection.updateOne(
            { _id: doc._id },
            { $set: updates }
          );
          stat.updated++;
        } else {
          stat.skipped++;
        }
      } catch (err: any) {
        stat.errors.push(`Document ${doc._id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    stat.errors.push(`Collection error: ${err.message}`);
  }

  return stat;
}

async function migrateFoodLogs(db: mongoose.Connection): Promise<MigrationStats> {
  const collection = db.collection('foodlogs');
  const stat: MigrationStats = {
    collection: 'foodlogs',
    totalDocuments: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    unmappedMealTypes: new Set(),
  };

  try {
    const documents = await collection.find({}).toArray();
    stat.totalDocuments = documents.length;

    for (const doc of documents) {
      try {
        let needsUpdate = false;
        const updates: any = {};

        // Migrate mealType field
        if (doc.mealType) {
          const canonical = mapToCanonicalMealType(doc.mealType);
          if (canonical && canonical !== doc.mealType) {
            needsUpdate = true;
            updates.mealType = canonical;
          } else if (!canonical) {
            stat.unmappedMealTypes.add(doc.mealType);
          }
        }

        if (needsUpdate) {
          await collection.updateOne(
            { _id: doc._id },
            { $set: updates }
          );
          stat.updated++;
        } else {
          stat.skipped++;
        }
      } catch (err: any) {
        stat.errors.push(`Document ${doc._id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    stat.errors.push(`Collection error: ${err.message}`);
  }

  return stat;
}

async function migrateClientMealPlans(db: mongoose.Connection): Promise<MigrationStats> {
  const collection = db.collection('clientmealplans');
  const stat: MigrationStats = {
    collection: 'clientmealplans',
    totalDocuments: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    unmappedMealTypes: new Set(),
  };

  try {
    const documents = await collection.find({}).toArray();
    stat.totalDocuments = documents.length;

    for (const doc of documents) {
      try {
        let needsUpdate = false;
        const updates: any = {};

        // Migrate mealType field if present
        if (doc.mealType) {
          const canonical = mapToCanonicalMealType(doc.mealType);
          if (canonical && canonical !== doc.mealType) {
            needsUpdate = true;
            updates.mealType = canonical;
          }
        }

        // Migrate meals array if present
        if (doc.meals && Array.isArray(doc.meals)) {
          const newMeals = doc.meals.map((meal: any) => {
            if (!meal.mealType) return meal;
            
            const canonical = mapToCanonicalMealType(meal.mealType);
            if (canonical && canonical !== meal.mealType) {
              needsUpdate = true;
              return { ...meal, mealType: canonical };
            }
            return meal;
          });
          
          if (needsUpdate) {
            updates.meals = newMeals;
          }
        }

        if (needsUpdate) {
          await collection.updateOne(
            { _id: doc._id },
            { $set: updates }
          );
          stat.updated++;
        } else {
          stat.skipped++;
        }
      } catch (err: any) {
        stat.errors.push(`Document ${doc._id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    stat.errors.push(`Collection error: ${err.message}`);
  }

  return stat;
}

// ============================================================================
// MAIN MIGRATION RUNNER
// ============================================================================

async function runMigration() {
  console.log('='.repeat(60));
  console.log('MEAL TYPE MIGRATION SCRIPT');
  console.log('='.repeat(60));
  console.log('\nCanonical Meal Types:');
  MEAL_TYPE_KEYS.forEach(key => {
    const config = MEAL_TYPES[key];
    console.log(`  ${key.padEnd(15)} → ${config.time12h} IST`);
  });
  console.log('\n');

  // Connect to MongoDB
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGODB_URI not found in environment');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected!\n');

  const db = mongoose.connection;

  // Run migrations
  console.log('Starting migrations...\n');

  const results: MigrationStats[] = [];

  results.push(await migrateDietTemplates(db));
  results.push(await migrateMealPlanTemplates(db));
  results.push(await migrateDietaryRecalls(db));
  results.push(await migrateJournalTracking(db));
  results.push(await migrateFoodLogs(db));
  results.push(await migrateClientMealPlans(db));

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('MIGRATION RESULTS');
  console.log('='.repeat(60));

  let totalUpdated = 0;
  let totalErrors = 0;
  const allUnmapped = new Set<string>();

  for (const stat of results) {
    console.log(`\n${stat.collection}:`);
    console.log(`  Total documents: ${stat.totalDocuments}`);
    console.log(`  Updated: ${stat.updated}`);
    console.log(`  Skipped (no changes): ${stat.skipped}`);
    console.log(`  Errors: ${stat.errors.length}`);
    
    if (stat.unmappedMealTypes.size > 0) {
      console.log(`  Unmapped meal types: ${Array.from(stat.unmappedMealTypes).join(', ')}`);
      stat.unmappedMealTypes.forEach(t => allUnmapped.add(t));
    }
    
    if (stat.errors.length > 0) {
      console.log('  Error details:');
      stat.errors.slice(0, 5).forEach(e => console.log(`    - ${e}`));
      if (stat.errors.length > 5) {
        console.log(`    ... and ${stat.errors.length - 5} more errors`);
      }
    }

    totalUpdated += stat.updated;
    totalErrors += stat.errors.length;
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total documents updated: ${totalUpdated}`);
  console.log(`Total errors: ${totalErrors}`);
  
  if (allUnmapped.size > 0) {
    console.log(`\nWARNING: The following meal types could not be mapped:`);
    Array.from(allUnmapped).forEach(t => console.log(`  - "${t}"`));
    console.log('\nConsider adding mappings for these in the migration script.');
  }

  // Disconnect
  await mongoose.disconnect();
  console.log('\nMigration complete!');
}

// Run the migration
runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
