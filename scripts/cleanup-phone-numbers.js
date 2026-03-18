/**
 * Phone Number Cleanup Script
 * 
 * This script normalizes phone numbers in the database to 10-digit format.
 * It handles various formats like:
 *   +911234567890 → 1234567890
 *   +91911234567890 → 1234567890
 *   911234567890 → 1234567890
 *   91911234567890 → 1234567890
 *   01234567890 → 1234567890
 * 
 * Usage:
 *   node scripts/cleanup-phone-numbers.js
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

// Define minimal User schema
const userSchema = new mongoose.Schema({
    email: String,
    firstName: String,
    lastName: String,
    phone: String,
    alternativePhone: String,
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

/**
 * Normalize phone number to 10 digits
 * Works from the end of the string to preserve the actual phone number
 */
function normalizePhone(phone) {
    if (!phone) return null;
    
    // Remove all non-digit characters
    let digits = phone.replace(/\D/g, '');
    
    if (!digits || digits.length === 0) return null;
    
    // If 10 digits or less, return as-is (already normalized or incomplete)
    if (digits.length <= 10) {
        return digits.length === 10 ? digits : null;
    }
    
    // More than 10 digits - extract last 10 digits
    // This handles all cases: +91XXXXXXXXXX, 91XXXXXXXXXX, 9191XXXXXXXXXX, etc.
    const last10 = digits.slice(-10);
    
    // Validate: Indian mobile numbers start with 6, 7, 8, or 9
    if (/^[6-9]/.test(last10)) {
        return last10;
    }
    
    // If doesn't start with valid digit, try different approaches
    // Case: 91XXXXXXXXXX (12 digits) - remove 91 prefix
    if (digits.length === 12 && digits.startsWith('91')) {
        const withoutPrefix = digits.slice(2);
        if (/^[6-9]/.test(withoutPrefix)) {
            return withoutPrefix;
        }
    }
    
    // Case: 9191XXXXXXXXXX (14 digits) - remove 9191 prefix
    if (digits.length === 14 && digits.startsWith('9191')) {
        const withoutPrefix = digits.slice(4);
        if (/^[6-9]/.test(withoutPrefix)) {
            return withoutPrefix;
        }
    }
    
    // Case: 0XXXXXXXXXX (11 digits) - remove leading 0
    if (digits.length === 11 && digits.startsWith('0')) {
        const withoutZero = digits.slice(1);
        if (/^[6-9]/.test(withoutZero)) {
            return withoutZero;
        }
    }
    
    // Fallback: return last 10 digits
    return last10;
}

async function cleanupPhoneNumbers() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Find all users with phone numbers
        const usersWithPhone = await User.find({
            $or: [
                { phone: { $exists: true, $ne: null, $ne: '' } },
                { alternativePhone: { $exists: true, $ne: null, $ne: '' } }
            ]
        });

        console.log(`📊 Found ${usersWithPhone.length} users with phone numbers\n`);

        let phoneUpdated = 0;
        let altPhoneUpdated = 0;
        let phoneDuplicates = [];
        let phoneErrors = [];

        console.log('🔧 Processing phone numbers...\n');

        for (const user of usersWithPhone) {
            const updates = {};
            let needsUpdate = false;

            // Process main phone
            if (user.phone) {
                const originalPhone = user.phone;
                const normalizedPhone = normalizePhone(originalPhone);
                
                if (normalizedPhone && normalizedPhone !== originalPhone) {
                    updates.phone = normalizedPhone;
                    needsUpdate = true;
                    console.log(`  📱 ${user.email}: ${originalPhone} → ${normalizedPhone}`);
                } else if (!normalizedPhone && originalPhone) {
                    // Invalid phone - set to null
                    updates.phone = null;
                    needsUpdate = true;
                    console.log(`  ⚠️  ${user.email}: ${originalPhone} → [invalid, cleared]`);
                }
            }

            // Process alternative phone
            if (user.alternativePhone) {
                const originalAltPhone = user.alternativePhone;
                const normalizedAltPhone = normalizePhone(originalAltPhone);
                
                if (normalizedAltPhone && normalizedAltPhone !== originalAltPhone) {
                    updates.alternativePhone = normalizedAltPhone;
                    needsUpdate = true;
                    console.log(`  📞 ${user.email} (alt): ${originalAltPhone} → ${normalizedAltPhone}`);
                } else if (!normalizedAltPhone && originalAltPhone) {
                    updates.alternativePhone = null;
                    needsUpdate = true;
                    console.log(`  ⚠️  ${user.email} (alt): ${originalAltPhone} → [invalid, cleared]`);
                }
            }

            // Apply updates
            if (needsUpdate) {
                try {
                    await User.updateOne({ _id: user._id }, { $set: updates });
                    if (updates.phone !== undefined) phoneUpdated++;
                    if (updates.alternativePhone !== undefined) altPhoneUpdated++;
                } catch (error) {
                    if (error.code === 11000) {
                        // Duplicate key error
                        phoneDuplicates.push({
                            email: user.email,
                            phone: updates.phone || user.phone,
                            error: 'Duplicate phone number'
                        });
                        console.log(`  ❌ ${user.email}: Duplicate phone number detected`);
                    } else {
                        phoneErrors.push({
                            email: user.email,
                            error: error.message
                        });
                        console.log(`  ❌ ${user.email}: Error - ${error.message}`);
                    }
                }
            }
        }

        // Handle duplicates by setting them to null
        if (phoneDuplicates.length > 0) {
            console.log(`\n🔧 Clearing ${phoneDuplicates.length} duplicate phone numbers...`);
            for (const dup of phoneDuplicates) {
                await User.updateOne(
                    { email: dup.email },
                    { $set: { phone: null } }
                );
                console.log(`  ✓ Cleared duplicate phone for ${dup.email}`);
            }
        }

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 Cleanup Summary:');
        console.log('='.repeat(60));
        console.log(`   Total users processed:     ${usersWithPhone.length}`);
        console.log(`   Phone numbers normalized:  ${phoneUpdated}`);
        console.log(`   Alt phones normalized:     ${altPhoneUpdated}`);
        console.log(`   Duplicates cleared:        ${phoneDuplicates.length}`);
        console.log(`   Errors:                    ${phoneErrors.length}`);
        console.log('='.repeat(60));

        // Show sample of cleaned numbers
        console.log('\n📋 Sample of normalized phone numbers:');
        const sampleUsers = await User.find({
            phone: { $exists: true, $ne: null, $regex: /^\d{10}$/ }
        }).limit(10);
        sampleUsers.forEach(u => console.log(`   ${u.email}: ${u.phone}`));

        await mongoose.disconnect();
        console.log('\n✅ Phone number cleanup completed!');

    } catch (error) {
        console.error('\n❌ Cleanup failed:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

// Run the cleanup
cleanupPhoneNumbers();
