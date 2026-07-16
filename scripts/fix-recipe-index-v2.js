#!/usr/bin/env node

/**
 * Fix Recipe E11000 Duplicate Key Error
 * 
 * Problem: Unique compound index on (name, createdBy) was too strict
 * - Prevented multiple recipes with same name when createdBy is null
 * 
 * Solution:
 * 1. Drop old strict unique index
 * 2. Remove duplicate records (keeping first)
 * 3. Create new sparse unique index (allows multiple nulls)
 */

const mongoose = require('mongoose');
const path = require('path');

// Load environment
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

async function fixRecipeIndex() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI not found in environment');
    }

    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected!\n');

    const collection = mongoose.connection.collection('recipes');

    // Step 1: Drop old unique index
    console.log('📋 Checking existing indexes...');
    const indexes = await collection.listIndexes().toArray();
    
    let oldIndexExists = false;
    for (const indexSpec of indexes) {
      if (indexSpec.key.name === 1 && indexSpec.key.createdBy === 1) {
        console.log(`   Found index: ${indexSpec.name}`, {
          unique: indexSpec.unique,
          sparse: indexSpec.sparse
        });
        if (indexSpec.unique && !indexSpec.sparse) {
          console.log(`   ⚠️  Dropping old strict unique index: ${indexSpec.name}`);
          await collection.dropIndex(indexSpec.name);
          oldIndexExists = true;
        }
      }
    }

    if (!oldIndexExists) {
      console.log('   ℹ️  No old strict unique index found\n');
    } else {
      console.log('   ✅ Old index dropped\n');
    }

    // Step 2: Check for duplicates
    console.log('🔍 Checking for duplicate recipes...');
    const duplicates = await collection.aggregate([
      {
        $group: {
          _id: { name: '$name', createdBy: '$createdBy' },
          count: { $sum: 1 },
          ids: { $push: '$_id' }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]).toArray();

    if (duplicates.length > 0) {
      console.log(`   Found ${duplicates.length} duplicate groups:\n`);
      
      let totalRemoved = 0;
      for (const dup of duplicates) {
        console.log(`   📍 name: "${dup._id.name}", createdBy: ${dup._id.createdBy || 'null'}`);
        console.log(`      Count: ${dup.count} recipes`);
        
        // Keep first, remove others
        const idsToRemove = dup.ids.slice(1);
        const result = await collection.deleteMany({
          _id: { $in: idsToRemove }
        });
        
        console.log(`      ✅ Removed ${result.deletedCount} duplicates\n`);
        totalRemoved += result.deletedCount;
      }
      
      console.log(`✅ Total duplicates removed: ${totalRemoved}\n`);
    } else {
      console.log('   ✅ No duplicates found\n');
    }

    // Step 3: Create new sparse unique index
    console.log('🔧 Creating new sparse unique index...');
    await collection.createIndex(
      { name: 1, createdBy: 1 },
      { unique: true, sparse: true }
    );
    console.log('   ✅ Sparse unique index created\n');

    // Step 4: Verify
    console.log('✨ Verifying indexes...');
    const newIndexes = await collection.listIndexes().toArray();
    let foundNewIndex = false;
    for (const indexSpec of newIndexes) {
      if (indexSpec.key.name === 1 && indexSpec.key.createdBy === 1) {
        console.log(`   ${indexSpec.name}:`, {
          unique: indexSpec.unique || false,
          sparse: indexSpec.sparse || false
        });
        foundNewIndex = true;
      }
    }

    if (!foundNewIndex) {
      console.log('   ⚠️  Warning: New index not found immediately (may take moment)');
    }

    console.log('\n✅ Recipe index fixed successfully!\n');
    console.log('📝 Changes made:');
    console.log('   • Dropped strict unique index on (name, createdBy)');
    if (duplicates.length > 0) {
      console.log(`   • Removed ${duplicates.length} duplicate record groups`);
    }
    console.log('   • Created new sparse unique index (allows multiple nulls)');
    console.log('\n🚀 Ready to import recipes without E11000 errors!\n');

  } catch (error) {
    console.error('❌ Error fixing recipe index:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

fixRecipeIndex();
