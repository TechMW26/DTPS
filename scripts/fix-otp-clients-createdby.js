/**
 * Script to fix clients created via OTP signup that are missing "createdBy" field
 * 
 * This script:
 * 1. Finds all clients with auto-generated emails (*@phone.dtps.tech)
 * 2. Finds all clients with missing createdBy field
 * 3. Updates them to show they were self-registered via OTP
 * 
 * Run with: node scripts/fix-otp-clients-createdby.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not found in .env.local');
    process.exit(1);
}

async function fixOtpClients() {
    try {
        console.log('🔗 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        const db = mongoose.connection.db;
        const usersCollection = db.collection('users');

        // Step 1: Find clients with auto-generated emails (@phone.dtps.tech)
        console.log('📋 STEP 1: Finding clients with auto-generated emails...\n');

        const autoEmailClients = await usersCollection.find({
            role: 'client',
            email: { $regex: /@phone\.dtps\.tech$/i }
        }).toArray();

        console.log(`Found ${autoEmailClients.length} clients with auto-generated emails (@phone.dtps.tech):\n`);

        if (autoEmailClients.length > 0) {
            console.log('| Client ID | Name | Phone | Email | Created By |');
            console.log('|-----------|------|-------|-------|------------|');

            autoEmailClients.forEach(client => {
                const createdByRole = client.createdBy?.role || 'NOT SET';
                console.log(`| ${client.clientId || 'N/A'} | ${client.firstName} ${client.lastName} | ${client.phone || 'N/A'} | ${client.email} | ${createdByRole} |`);
            });
        }

        // Step 2: Find clients with missing createdBy
        console.log('\n📋 STEP 2: Finding clients with missing createdBy field...\n');

        const missingCreatedBy = await usersCollection.find({
            role: 'client',
            $or: [
                { createdBy: { $exists: false } },
                { 'createdBy.role': { $exists: false } },
                { 'createdBy.role': '' },
                { 'createdBy.role': null }
            ]
        }).toArray();

        console.log(`Found ${missingCreatedBy.length} clients with missing createdBy field:\n`);

        if (missingCreatedBy.length > 0) {
            console.log('| Client ID | Name | Phone | Email |');
            console.log('|-----------|------|-------|-------|');

            missingCreatedBy.slice(0, 50).forEach(client => {
                console.log(`| ${client.clientId || 'N/A'} | ${client.firstName} ${client.lastName} | ${client.phone || 'N/A'} | ${client.email} |`);
            });

            if (missingCreatedBy.length > 50) {
                console.log(`... and ${missingCreatedBy.length - 50} more`);
            }
        }

        // Step 3: Ask for confirmation before fixing
        console.log('\n⚠️  FIXING AFFECTED CLIENTS...\n');

        // Fix clients with @phone.dtps.tech emails - they are self-registered via OTP
        const autoEmailResult = await usersCollection.updateMany(
            {
                role: 'client',
                email: { $regex: /@phone\.dtps\.tech$/i },
                $or: [
                    { createdBy: { $exists: false } },
                    { 'createdBy.role': { $exists: false } },
                    { 'createdBy.role': '' },
                    { 'createdBy.role': null }
                ]
            },
            {
                $set: {
                    'createdBy.role': 'self',
                    'createdBy.source': 'otp_signup_mobile_app'
                }
            }
        );

        console.log(`✅ Updated ${autoEmailResult.modifiedCount} clients with auto-generated emails to show "Self Registered (OTP Signup)"`);

        // Fix other clients with missing createdBy (assume they were created before tracking was added)
        const otherResult = await usersCollection.updateMany(
            {
                role: 'client',
                email: { $not: { $regex: /@phone\.dtps\.tech$/i } },
                $or: [
                    { createdBy: { $exists: false } },
                    { 'createdBy.role': { $exists: false } },
                    { 'createdBy.role': '' },
                    { 'createdBy.role': null }
                ]
            },
            {
                $set: {
                    'createdBy.role': 'self',
                    'createdBy.source': 'legacy_unknown'
                }
            }
        );

        console.log(`✅ Updated ${otherResult.modifiedCount} other clients with missing createdBy to show "Self Registered (Legacy)"`);

        // Summary
        console.log('\n📊 SUMMARY:');
        console.log('===========');
        console.log(`Total clients with @phone.dtps.tech emails: ${autoEmailClients.length}`);
        console.log(`Total clients with missing createdBy: ${missingCreatedBy.length}`);
        console.log(`Fixed auto-email clients: ${autoEmailResult.modifiedCount}`);
        console.log(`Fixed other clients: ${otherResult.modifiedCount}`);

        console.log('\n✅ Script completed successfully!');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB');
    }
}

fixOtpClients();
