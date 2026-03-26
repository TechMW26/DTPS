/**
 * Phone Number Fix Script
 * 
 * Fixes the following issues:
 * 1. Duplicate +91 prefix (e.g., +91919991953094 → +919991953094)
 * 2. Missing +91 prefix for valid 10-digit numbers
 * 3. Invalid prefix test data (sets to null)
 * 
 * Usage:
 *   node scripts/fix-phone-numbers.js
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
    role: String,
    clientId: String,
    status: String,
    createdAt: Date,
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

/**
 * Fix phone number issues
 */
function fixPhone(phone) {
    if (!phone || phone === '' || phone === 'null' || phone === 'undefined') {
        return null;
    }

    const digitsOnly = phone.replace(/\D/g, '');

    // Case 1: Duplicate +91 prefix - starts with +91 but has 14+ digits starting with 91
    if (phone.startsWith('+91') && digitsOnly.length >= 14 && digitsOnly.startsWith('919')) {
        // Extract the actual 10-digit number (take last 10 digits if extra prefix)
        const lastTen = digitsOnly.slice(-10);
        if (/^[6-9]/.test(lastTen)) {
            return '+91' + lastTen;
        }
    }

    // Case 2: Variations like +91+918860952131 (double plus sign)
    if (phone.includes('+91+91') || phone.includes('+91+')) {
        const cleaned = phone.replace(/\+91\+91/, '+91').replace(/\+91\+/, '+91');
        const cleanedDigits = cleaned.replace(/\D/g, '');
        if (cleanedDigits.length === 12 && cleanedDigits.startsWith('91')) {
            const extracted = cleanedDigits.slice(2);
            if (/^[6-9]/.test(extracted)) {
                return '+91' + extracted;
            }
        }
        if (cleanedDigits.length === 10 && /^[6-9]/.test(cleanedDigits)) {
            return '+91' + cleanedDigits;
        }
    }

    // Case 3: Numbers starting with 91919... (double 91 prefix)
    if (digitsOnly.startsWith('91919') && digitsOnly.length >= 12) {
        const withoutDouble = digitsOnly.slice(2); // Remove first 91
        const lastTen = withoutDouble.slice(-10);
        if (/^[6-9]/.test(lastTen)) {
            return '+91' + lastTen;
        }
    }

    // Case 4: Valid 10-digit number starting with 6-9 (should have +91 prefix)
    if (digitsOnly.length === 10 && /^[6-9]/.test(digitsOnly)) {
        return '+91' + digitsOnly;
    }

    // Case 5: Already has +91 prefix correctly
    if (phone.startsWith('+91') && digitsOnly.length === 12) {
        const extracted = digitsOnly.slice(2);
        if (/^[6-9]/.test(extracted)) {
            return '+91' + extracted;
        }
    }

    // Case 6: Invalid numbers (test data with wrong prefix) - return null to mark for review
    if (digitsOnly.length === 10 && /^[0-5]/.test(digitsOnly)) {
        return null; // Invalid prefix, set to null
    }

    return phone; // Return as-is if can't determine
}

async function fixPhoneNumbers() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Find clients with phone number issues
        const clients = await User.find({
            role: 'client',
            $or: [
                { phone: { $regex: /\+91\+91|\+91\+|\+919191/ } }, // Duplicate +91 prefix
                { phone: /^[0-5][0-9]{9}$/ }, // Invalid prefix (0,1,2,3,4,5) - 10 digits starting with 0-5
                { phone: { $regex: /^91919|^919[0-9]{7,}$/ } }, // Also catch 91919... and 919... variations
            ]
        });

        console.log(`📊 Found ${clients.length} clients with phone issues\n`);

        let fixed = 0;
        let nulled = 0;
        let errors = [];

        for (const client of clients) {
            const originalPhone = client.phone;
            const fixedPhone = fixPhone(originalPhone);

            if (fixedPhone !== originalPhone) {
                try {
                    if (fixedPhone === null) {
                        await User.updateOne({ _id: client._id }, { $set: { phone: null } });
                        console.log(`  🔧 ${client.clientId} | ${client.email}: ${originalPhone} → [null - invalid test data]`);
                        nulled++;
                    } else {
                        await User.updateOne({ _id: client._id }, { $set: { phone: fixedPhone } });
                        console.log(`  ✓ ${client.clientId} | ${client.email}: ${originalPhone} → ${fixedPhone}`);
                        fixed++;
                    }
                } catch (error) {
                    errors.push({
                        clientId: client.clientId,
                        email: client.email,
                        error: error.message
                    });
                    console.log(`  ❌ ${client.clientId} | ${client.email}: Error - ${error.message}`);
                }
            }
        }

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 Fix Summary:');
        console.log('='.repeat(60));
        console.log(`   Total clients with issues:  ${clients.length}`);
        console.log(`   Phone numbers fixed:        ${fixed}`);
        console.log(`   Invalid test data nulled:   ${nulled}`);
        console.log(`   Errors:                     ${errors.length}`);
        console.log('='.repeat(60));

        if (errors.length > 0) {
            console.log('\n❌ Errors encountered:');
            errors.forEach(e => console.log(`   ${e.clientId}: ${e.error}`));
        }

        await mongoose.disconnect();
        console.log('\n✅ Phone number fixes completed!');

    } catch (error) {
        console.error('\n❌ Fix failed:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

// Run the fix
fixPhoneNumbers();
