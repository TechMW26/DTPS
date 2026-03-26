/**
 * Normalize All Phone Numbers Script
 * 
 * This script updates all client phone numbers to the standard format: +91XXXXXXXXXX
 * Run with: node scripts/normalize-all-phones.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

function normalizePhone(phone) {
    if (!phone) return null;

    // Convert to string and trim
    let cleaned = String(phone).trim();

    // Return null for empty or null-like strings
    if (!cleaned || cleaned === 'null' || cleaned === 'undefined') return null;

    // Remove all non-digit characters except +
    cleaned = cleaned.replace(/[^\d+]/g, '');

    // If empty after cleaning, return null
    if (!cleaned || cleaned.length === 0) return null;

    // Remove any existing country code variations and get just digits
    let digits = cleaned.replace(/\+/g, '');

    // Handle double 91 prefix (91919876543210 or +91919876543210)
    if (digits.startsWith('9191') && digits.length >= 14) {
        digits = digits.substring(2); // Remove first 91
    }

    // Handle standard 91 prefix (919876543210)
    if (digits.startsWith('91') && digits.length >= 12) {
        digits = digits.substring(2); // Remove 91 prefix
    }

    // Now we should have just the 10-digit number
    // Valid Indian numbers start with 6, 7, 8, or 9
    if (digits.length === 10 && /^[6-9]/.test(digits)) {
        return `+91${digits}`;
    }

    // If we have more than 10 digits but starts with 91, try to extract
    if (digits.length > 10 && digits.startsWith('91')) {
        const remaining = digits.substring(2);
        if (remaining.length === 10 && /^[6-9]/.test(remaining)) {
            return `+91${remaining}`;
        }
    }

    // If it's exactly 10 digits, add +91
    if (digits.length === 10) {
        return `+91${digits}`;
    }

    // For international numbers starting with +, keep as-is
    if (cleaned.startsWith('+')) {
        return cleaned;
    }

    // Default: add +91 for any 10+ digit number (take last 10)
    if (digits.length >= 10) {
        const last10 = digits.slice(-10);
        return `+91${last10}`;
    }

    // Return null for invalid phones
    return null;
}

async function normalizeAllPhones() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        const User = mongoose.connection.collection('users');

        // Get all clients with phone numbers
        const clients = await User.find({
            role: 'client',
            phone: { $exists: true, $ne: null }
        }).toArray();

        console.log(`📊 Found ${clients.length} clients with phone numbers\n`);

        let updated = 0;
        let skipped = 0;
        let errors = 0;
        let alreadyCorrect = 0;

        const changes = [];

        for (const client of clients) {
            const originalPhone = client.phone;

            // Skip if phone is already null or string 'null'
            if (originalPhone === null || originalPhone === 'null') {
                skipped++;
                continue;
            }

            const normalized = normalizePhone(originalPhone);

            // Check if phone is already in correct format
            if (originalPhone === normalized) {
                alreadyCorrect++;
                continue;
            }

            // Update the phone number
            try {
                await User.updateOne(
                    { _id: client._id },
                    { $set: { phone: normalized } }
                );

                changes.push({
                    clientId: client.clientId,
                    name: `${client.firstName} ${client.lastName}`,
                    before: originalPhone,
                    after: normalized
                });

                updated++;

                // Log progress every 100 updates
                if (updated % 100 === 0) {
                    console.log(`  ... updated ${updated} phones`);
                }
            } catch (err) {
                console.error(`  ❌ Error updating ${client.clientId}: ${err.message}`);
                errors++;
            }
        }

        console.log('\n' + '═'.repeat(60));
        console.log('📊 Normalization Summary:');
        console.log('═'.repeat(60));
        console.log(`  ✅ Already correct:  ${alreadyCorrect}`);
        console.log(`  ✅ Updated:          ${updated}`);
        console.log(`  ⏭️  Skipped (null):   ${skipped}`);
        console.log(`  ❌ Errors:           ${errors}`);
        console.log('═'.repeat(60));

        // Show sample of changes
        if (changes.length > 0) {
            console.log('\n📝 Sample changes (first 20):');
            changes.slice(0, 20).forEach(c => {
                console.log(`  ${c.clientId} | ${c.name}`);
                console.log(`    Before: "${c.before}"`);
                console.log(`    After:  "${c.after}"`);
            });
        }

        // Verify the changes
        console.log('\n🔍 Verifying changes...');

        const verifyStats = await User.aggregate([
            { $match: { role: 'client', phone: { $exists: true, $ne: null, $type: 'string' } } },
            {
                $project: {
                    startsWithPlus: { $eq: [{ $substr: ['$phone', 0, 1] }, '+'] },
                    length: { $strLenCP: '$phone' }
                }
            },
            {
                $group: {
                    _id: { startsWithPlus: '$startsWithPlus', length: '$length' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]).toArray();

        console.log('  Phone format distribution after update:');
        verifyStats.forEach(s => {
            const prefix = s._id.startsWithPlus ? 'Starts with +' : 'No + prefix';
            console.log(`    ${prefix}, length ${s._id.length}: ${s.count} phones`);
        });

        await mongoose.disconnect();
        console.log('\n✅ Done!');

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

normalizeAllPhones();
