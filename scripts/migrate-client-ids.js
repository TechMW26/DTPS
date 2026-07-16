/**
 * Migration Script: Assign Sequential Client IDs
 * 
 * This script assigns sequential client IDs (C-1, C-2, C-3, etc.) to all users
 * with the role "client" who don't already have a clientId.
 * 
 * Usage:
 *   node scripts/migrate-client-ids.js
 * 
 * Environment Variables Required:
 *   MONGODB_URI - MongoDB connection string
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI environment variable is not set');
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

async function migrateClientIds() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Get the highest existing clientId number
        const existingClientWithHighestId = await User.findOne({
            role: 'client',
            clientId: { $exists: true, $ne: null, $regex: /^C-\d+$/ }
        }).sort({ clientId: -1 });

        let startingNumber = 1;
        if (existingClientWithHighestId && existingClientWithHighestId.clientId) {
            const match = existingClientWithHighestId.clientId.match(/^C-(\d+)$/);
            if (match) {
                startingNumber = parseInt(match[1], 10) + 1;
                console.log(`📊 Found existing client IDs. Starting from C-${startingNumber}`);
            }
        }

        // Find all clients without a clientId, ordered by createdAt
        const clientsWithoutId = await User.find({
            role: 'client',
            $or: [
                { clientId: { $exists: false } },
                { clientId: null },
                { clientId: '' }
            ]
        }).sort({ createdAt: 1 });

        console.log(`📊 Found ${clientsWithoutId.length} clients without clientId`);

        if (clientsWithoutId.length === 0) {
            console.log('✅ All clients already have clientIds assigned');
            await mongoose.disconnect();
            return;
        }

        // Assign sequential IDs
        let currentNumber = startingNumber;
        let successCount = 0;
        let errorCount = 0;

        for (const client of clientsWithoutId) {
            const newClientId = `C-${currentNumber}`;

            try {
                await User.updateOne(
                    { _id: client._id },
                    { $set: { clientId: newClientId } }
                );
                console.log(`  ✓ ${client.firstName} ${client.lastName} (${client.email}) → ${newClientId}`);
                successCount++;
                currentNumber++;
            } catch (error) {
                console.error(`  ✗ Error assigning ${newClientId} to ${client.email}:`, error.message);
                errorCount++;
                // If it's a duplicate key error, try the next number
                if (error.code === 11000) {
                    currentNumber++;
                }
            }
        }

        console.log('\n📊 Migration Summary:');
        console.log(`   Total clients processed: ${clientsWithoutId.length}`);
        console.log(`   Successfully assigned: ${successCount}`);
        console.log(`   Errors: ${errorCount}`);
        console.log(`   Client IDs range: C-${startingNumber} to C-${currentNumber - 1}`);

        // Verify total clients with IDs
        const totalClientsWithId = await User.countDocuments({
            role: 'client',
            clientId: { $exists: true, $ne: null, $ne: '' }
        });
        console.log(`\n✅ Total clients with clientId: ${totalClientsWithId}`);

        await mongoose.disconnect();
        console.log('\n✅ Migration completed successfully');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

// Run the migration
migrateClientIds();
