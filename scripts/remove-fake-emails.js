/**
 * Script to remove all auto-generated @phone.dtps.tech emails from the database.
 * 
 * These emails were never real — they were placeholder emails auto-generated
 * for clients who signed up via OTP (phone only). This script removes them
 * so those clients have email = null (no email).
 *
 * Run with: node scripts/remove-fake-emails.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not found in .env.local');
    process.exit(1);
}

async function removeFakeEmails() {
    try {
        console.log('🔗 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected\n');

        const db = mongoose.connection.db;
        const usersCollection = db.collection('users');

        // Step 1: Count affected clients
        const affectedCount = await usersCollection.countDocuments({
            email: { $regex: /@phone\.dtps\.tech$/i }
        });

        console.log(`📋 Found ${affectedCount} clients with auto-generated @phone.dtps.tech emails\n`);

        if (affectedCount === 0) {
            console.log('✅ No fake emails found. Database is clean.');
            await mongoose.disconnect();
            return;
        }

        // Step 2: List them
        const affected = await usersCollection.find(
            { email: { $regex: /@phone\.dtps\.tech$/i } },
            { projection: { clientId: 1, firstName: 1, lastName: 1, phone: 1, email: 1 } }
        ).toArray();

        console.log('Affected clients:');
        console.log('─'.repeat(90));
        console.log('Client ID  | Name                      | Phone           | Fake Email');
        console.log('─'.repeat(90));
        affected.forEach(c => {
            const id = (c.clientId || 'N/A').padEnd(10);
            const name = (`${c.firstName || ''} ${c.lastName || ''}`).trim().padEnd(25);
            const phone = (c.phone || 'N/A').padEnd(15);
            console.log(`${id} | ${name} | ${phone} | ${c.email}`);
        });
        console.log('─'.repeat(90));

        // Step 3: Remove the fake emails (set to null so the field is empty)
        const result = await usersCollection.updateMany(
            { email: { $regex: /@phone\.dtps\.tech$/i } },
            { $unset: { email: '' } }
        );

        console.log(`\n✅ Removed fake emails from ${result.modifiedCount} clients.`);
        console.log('   These clients now have no email (phone is their primary identifier).');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB');
    }
}

removeFakeEmails();
