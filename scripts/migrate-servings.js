/**
 * Migration Script: Update Recipe Servings Structure
 * 
 * This script migrates existing recipes to use:
 * - servings: Number (extracted numeric value for calculations)
 * - servingSize: String (full display string)
 * 
 * Run: node scripts/migrate-servings.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment');
  process.exit(1);
}

/**
 * Parse servings string to extract numeric value
 */
function parseServingsToNumber(servingsStr) {
  if (typeof servingsStr === 'number') return servingsStr;

  const str = String(servingsStr).trim();
  const match = str.match(/^[\s]*([0-9]+(?:\/[0-9]+)?(?:\.[0-9]+)?)/);
  if (match && match[1]) {
    const qStr = match[1];
    if (qStr.includes('/')) {
      const [numerator, denominator] = qStr.split('/').map(Number);
      if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
        return numerator / denominator;
      }
    } else {
      const num = parseFloat(qStr);
      if (!isNaN(num)) return num;
    }
  }
  return 1;
}

async function migrateRecipes() {
  console.log('🚀 Starting Recipe Servings Migration...\n');
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const Recipe = mongoose.connection.collection('recipes');
    
    // Find all recipes
    const recipes = await Recipe.find({}).toArray();
    console.log(`📊 Found ${recipes.length} recipes to process\n`);
    
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const recipe of recipes) {
      try {
        // Determine the source value (prefer servingSize if it's a string)
        const sourceValue = (typeof recipe.servingSize === 'string' && recipe.servingSize) 
          ? recipe.servingSize 
          : recipe.servings || 1;
        
        const numericValue = parseServingsToNumber(sourceValue);
        const displayString = typeof sourceValue === 'string' 
          ? sourceValue.trim() 
          : `${numericValue} serving${numericValue !== 1 ? 's' : ''}`;
        
        // Update the recipe - only servings and servingSize, remove old fields
        await Recipe.updateOne(
          { _id: recipe._id },
          {
            $set: {
              servings: numericValue,
              servingSize: displayString
            },
            $unset: {
              servingQuantity: '',
              servingUnit: '',
              servingWeight: ''
            }
          }
        );
        
        updated++;
        console.log(`✅ Updated: ${recipe.name || recipe._id}`);
        console.log(`   Input: "${sourceValue}" -> servings: ${numericValue}, servingSize: "${displayString}"`);
        console.log();
        
      } catch (err) {
        errors++;
        console.error(`❌ Error updating recipe ${recipe._id}:`, err.message);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Updated: ${updated}`);
    console.log(`⏭️  Skipped (already migrated): ${skipped}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`📊 Total processed: ${recipes.length}`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

// Run the migration
migrateRecipes().then(() => {
  console.log('\n🎉 Migration completed!');
  process.exit(0);
}).catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
