const mongoose = require('mongoose');
const path = require('path');

// Load the pre-fix audit report
const auditReport = require('../reports/recipe-detail-audit-2026-05-02T05-39-16-200Z.json');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dtps';

async function revertDietaryChanges() {
    try {
        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        // Define Recipe schema inline
        const recipeSchema = new mongoose.Schema({}, { strict: false });
        let Recipe;
        try {
            Recipe = mongoose.model('Recipe');
        } catch {
            Recipe = mongoose.model('Recipe', recipeSchema);
        }

        // Extract all 72 recipes from the vegConflict section of the audit report
        const recipesToRevert = auditReport.vegConflict;

        console.log(`\n📋 Preparing to revert ${recipesToRevert.length} recipes...`);
        console.log('='.repeat(80));

        let revertedCount = 0;
        let errorCount = 0;
        const errors = [];

        // Batch process for efficiency
        for (const recipeData of recipesToRevert) {
            try {
                const result = await Recipe.findByIdAndUpdate(
                    recipeData._id,
                    {
                        dietaryRestrictions: recipeData.dietaryRestrictions,
                        tags: recipeData.tags
                    },
                    { new: true }
                );

                if (result) {
                    revertedCount++;
                    console.log(`✅ Reverted: "${recipeData.name}" (${recipeData.uuid})`);
                } else {
                    console.log(`⚠️  Recipe not found: ${recipeData._id}`);
                    errorCount++;
                }
            } catch (err) {
                errorCount++;
                errors.push({
                    recipeId: recipeData._id,
                    recipeName: recipeData.name,
                    error: err.message
                });
                console.log(`❌ Error reverting "${recipeData.name}": ${err.message}`);
            }
        }

        console.log('\n' + '='.repeat(80));
        console.log(`\n✨ REVERT COMPLETE`);
        console.log(`Total recipes processed: ${recipesToRevert.length}`);
        console.log(`Successfully reverted: ${revertedCount}`);
        console.log(`Errors: ${errorCount}`);

        if (errors.length > 0) {
            console.log('\n⚠️  Errors encountered:');
            errors.forEach(err => {
                console.log(`  - ${err.recipeName} (${err.recipeId}): ${err.error}`);
            });
        }

        console.log('\n📝 Next step: Run the audit script to verify the revert');
        console.log('  node -r dotenv/config scripts/audit-recipe-details.js\n');

    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

revertDietaryChanges();
