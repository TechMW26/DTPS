/**
 * Reset Client IDs Script
 * 
 * This script RESETS ALL client IDs to sequential values starting from C-1.
 * It processes all users with role "client" ordered by createdAt date.
 * 
 * Usage:
 *   node scripts/reset-client-ids.js
 * 
 * Environment Variables Required:
 *   MONGODB_URI - MongoDB connection string
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI environment variable is not set');
    console.log('   Make sure .env.local file exists with MONGODB_URI');
    process.exit(1);
}

// Define minimal User schema for migration
const userSchema = new mongoose.Schema({
    email: String,
    firstName: String,
    lastName: String,
    role: String,
    clientId: String,
    createdAt: Date
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// Counter schema for auto-increment
const counterSchema = new mongoose.Schema({
    _id: String,
    seq: { type: Number, default: 0 }
});

const Counter = mongoose.model('Counter', counterSchema);

async function resetClientIds() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Step 1: Get all clients ordered by creation date
        const allClients = await User.find({
            role: 'client'
        }).sort({ createdAt: 1 });

        console.log(`📊 Found ${allClients.length} total clients\n`);

        if (allClients.length === 0) {
            console.log('✅ No clients found in the database');
            await mongoose.disconnect();
            return;
        }

        // Step 2: Clear all existing clientIds first (to avoid duplicate key errors)
        console.log('🧹 Clearing all existing clientIds...');
        await User.updateMany(
            { role: 'client' },
            { $unset: { clientId: 1 } }
        );
        console.log('✅ Cleared all existing clientIds\n');

        // Step 3: Assign sequential IDs starting from C-1
        console.log('🔢 Assigning new sequential clientIds...\n');
        let currentNumber = 1;
        let successCount = 0;
        let errorCount = 0;

        for (const client of allClients) {
            const newClientId = `C-${currentNumber}`;

            try {
                await User.updateOne(
                    { _id: client._id },
                    { $set: { clientId: newClientId } }
                );
                console.log(`  ✓ ${String(currentNumber).padStart(4, ' ')}. ${client.firstName || 'N/A'} ${client.lastName || 'N/A'} (${client.email}) → ${newClientId}`);
                successCount++;
                currentNumber++;
            } catch (error) {
                console.error(`  ✗ Error assigning ${newClientId} to ${client.email}:`, error.message);
                errorCount++;
                currentNumber++; // Still increment to maintain sequence
            }
        }

        // Step 4: Update/Create the counter for future client IDs
        const nextClientNumber = currentNumber;
        await Counter.findOneAndUpdate(
            { _id: 'clientId' },
            { $set: { seq: nextClientNumber - 1 } }, // Store the last used number
            { upsert: true, new: true }
        );
        console.log(`\n✅ Updated counter: Next new client will be C-${nextClientNumber}`);

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 Migration Summary:');
        console.log('='.repeat(60));
        console.log(`   Total clients processed: ${allClients.length}`);
        console.log(`   Successfully assigned:   ${successCount}`);
        console.log(`   Errors:                  ${errorCount}`);
        console.log(`   Client IDs range:        C-1 to C-${currentNumber - 1}`);
        console.log(`   Next client ID:          C-${nextClientNumber}`);
        console.log('='.repeat(60));

        // Verify by listing first 10 and last 5 clients
        console.log('\n📋 Verification - First 10 clients:');
        const first10 = await User.find({ role: 'client' }).sort({ clientId: 1 }).limit(10);
        first10.forEach(c => console.log(`   ${c.clientId}: ${c.firstName} ${c.lastName}`));

        if (allClients.length > 10) {
            console.log('\n📋 Verification - Last 5 clients:');
            const last5 = await User.find({ role: 'client' }).sort({ clientId: -1 }).limit(5);
            last5.reverse().forEach(c => console.log(`   ${c.clientId}: ${c.firstName} ${c.lastName}`));
        }

        await mongoose.disconnect();
        console.log('\n✅ Migration completed successfully!');
        console.log('💡 New clients will automatically get the next sequential ID (C-' + nextClientNumber + ', C-' + (nextClientNumber + 1) + ', etc.)');

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

// Run the migration
resetClientIds();
