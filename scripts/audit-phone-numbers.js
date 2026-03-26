/**
 * Phone Number Audit Script
 * 
 * This script audits all client phone numbers and generates a report:
 * - Clients with missing phone numbers
 * - Clients with invalid/incomplete phone numbers
 * - Clients with wrong format (missing digits, wrong prefix, etc.)
 * 
 * Outputs results to PHONE_NUMBER_AUDIT.md
 * 
 * Usage:
 *   node scripts/audit-phone-numbers.js
 * 
 * Environment Variables Required:
 *   MONGODB_URI - MongoDB connection string
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
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
 * Validate and categorize phone number issues
 */
function analyzePhone(phone) {
    if (!phone || phone === '' || phone === 'null' || phone === 'undefined') {
        return { valid: false, issue: 'MISSING', description: 'No phone number' };
    }

    // Remove all non-digit characters except +
    const cleaned = phone.replace(/[^\d+]/g, '');
    const digitsOnly = phone.replace(/\D/g, '');

    // Check for empty after cleaning
    if (!digitsOnly || digitsOnly.length === 0) {
        return { valid: false, issue: 'EMPTY', description: 'Only special characters, no digits' };
    }

    // Check for too few digits (less than 10)
    if (digitsOnly.length < 10) {
        return {
            valid: false,
            issue: 'TOO_SHORT',
            description: `Only ${digitsOnly.length} digits (need 10)`,
            digits: digitsOnly
        };
    }

    // Check for too many digits without proper prefix
    if (digitsOnly.length > 13) {
        return {
            valid: false,
            issue: 'TOO_LONG',
            description: `${digitsOnly.length} digits (possibly duplicate prefix)`,
            digits: digitsOnly
        };
    }

    // Extract the actual 10-digit number
    let actualNumber = digitsOnly;

    // Handle +91 prefix
    if (cleaned.startsWith('+91') && digitsOnly.length === 12) {
        actualNumber = digitsOnly.slice(2);
    }
    // Handle 91 prefix without +
    else if (digitsOnly.startsWith('91') && digitsOnly.length === 12) {
        actualNumber = digitsOnly.slice(2);
    }
    // Handle 0 prefix
    else if (digitsOnly.startsWith('0') && digitsOnly.length === 11) {
        actualNumber = digitsOnly.slice(1);
    }
    // Handle double 91 prefix (9191...)
    else if (digitsOnly.startsWith('9191') && digitsOnly.length === 14) {
        actualNumber = digitsOnly.slice(4);
    }
    // Take last 10 digits if longer
    else if (digitsOnly.length > 10) {
        actualNumber = digitsOnly.slice(-10);
    }

    // Validate Indian mobile number (should start with 6, 7, 8, or 9)
    if (actualNumber.length === 10) {
        if (!/^[6-9]/.test(actualNumber)) {
            return {
                valid: false,
                issue: 'INVALID_PREFIX',
                description: `Starts with ${actualNumber[0]}, should start with 6-9`,
                digits: digitsOnly,
                extracted: actualNumber
            };
        }

        // Check if stored format is correct
        const expectedFormat = `+91${actualNumber}`;
        if (phone !== expectedFormat && phone !== actualNumber) {
            return {
                valid: true,
                issue: 'WRONG_FORMAT',
                description: `Should be ${expectedFormat}`,
                current: phone,
                corrected: expectedFormat,
                digits: actualNumber
            };
        }

        return { valid: true, issue: 'NONE', digits: actualNumber };
    }

    return {
        valid: false,
        issue: 'UNKNOWN',
        description: `Could not extract valid 10-digit number`,
        digits: digitsOnly
    };
}

async function auditPhoneNumbers() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Find all clients
        const clients = await User.find({ role: 'client' }).sort({ createdAt: -1 });
        console.log(`📊 Found ${clients.length} total clients\n`);

        const issues = {
            missing: [],
            tooShort: [],
            tooLong: [],
            invalidPrefix: [],
            wrongFormat: [],
            empty: [],
            unknown: [],
            valid: []
        };

        console.log('🔍 Analyzing phone numbers...\n');

        for (const client of clients) {
            const analysis = analyzePhone(client.phone);
            const clientInfo = {
                clientId: client.clientId || 'N/A',
                name: `${client.firstName || ''} ${client.lastName || ''}`.trim() || 'Unknown',
                email: client.email || 'No email',
                currentPhone: client.phone || 'N/A',
                status: client.status || 'unknown',
                createdAt: client.createdAt ? client.createdAt.toISOString().split('T')[0] : 'Unknown',
                ...analysis
            };

            switch (analysis.issue) {
                case 'MISSING':
                    issues.missing.push(clientInfo);
                    break;
                case 'EMPTY':
                    issues.empty.push(clientInfo);
                    break;
                case 'TOO_SHORT':
                    issues.tooShort.push(clientInfo);
                    break;
                case 'TOO_LONG':
                    issues.tooLong.push(clientInfo);
                    break;
                case 'INVALID_PREFIX':
                    issues.invalidPrefix.push(clientInfo);
                    break;
                case 'WRONG_FORMAT':
                    issues.wrongFormat.push(clientInfo);
                    break;
                case 'UNKNOWN':
                    issues.unknown.push(clientInfo);
                    break;
                case 'NONE':
                    issues.valid.push(clientInfo);
                    break;
            }
        }

        // Generate markdown report
        let report = `# Phone Number Audit Report

**Generated:** ${new Date().toLocaleString()}  
**Total Clients:** ${clients.length}

## Summary

| Category | Count |
|----------|-------|
| ✅ Valid phone numbers | ${issues.valid.length} |
| ⚠️ Wrong format (fixable) | ${issues.wrongFormat.length} |
| ❌ Missing phone number | ${issues.missing.length} |
| ❌ Too short (< 10 digits) | ${issues.tooShort.length} |
| ❌ Too long (> 13 digits) | ${issues.tooLong.length} |
| ❌ Invalid prefix (not 6-9) | ${issues.invalidPrefix.length} |
| ❌ Empty/Only special chars | ${issues.empty.length} |
| ❓ Unknown issue | ${issues.unknown.length} |

---

`;

        // Missing phone numbers
        if (issues.missing.length > 0) {
            report += `## ❌ Clients Without Phone Numbers (${issues.missing.length})\n\n`;
            report += `| Client ID | Name | Email | Status | Created |\n`;
            report += `|-----------|------|-------|--------|--------|\n`;
            for (const c of issues.missing) {
                report += `| ${c.clientId} | ${c.name} | ${c.email} | ${c.status} | ${c.createdAt} |\n`;
            }
            report += '\n---\n\n';
        }

        // Too short
        if (issues.tooShort.length > 0) {
            report += `## ❌ Phone Numbers Too Short (${issues.tooShort.length})\n\n`;
            report += `| Client ID | Name | Current Phone | Digits Found | Issue |\n`;
            report += `|-----------|------|---------------|--------------|-------|\n`;
            for (const c of issues.tooShort) {
                report += `| ${c.clientId} | ${c.name} | ${c.currentPhone} | ${c.digits || 'N/A'} | ${c.description} |\n`;
            }
            report += '\n---\n\n';
        }

        // Too long
        if (issues.tooLong.length > 0) {
            report += `## ❌ Phone Numbers Too Long (${issues.tooLong.length})\n\n`;
            report += `| Client ID | Name | Current Phone | Digits Found | Issue |\n`;
            report += `|-----------|------|---------------|--------------|-------|\n`;
            for (const c of issues.tooLong) {
                report += `| ${c.clientId} | ${c.name} | ${c.currentPhone} | ${c.digits || 'N/A'} | ${c.description} |\n`;
            }
            report += '\n---\n\n';
        }

        // Invalid prefix
        if (issues.invalidPrefix.length > 0) {
            report += `## ❌ Invalid Phone Prefix (${issues.invalidPrefix.length})\n\n`;
            report += `| Client ID | Name | Current Phone | Extracted Number | Issue |\n`;
            report += `|-----------|------|---------------|------------------|-------|\n`;
            for (const c of issues.invalidPrefix) {
                report += `| ${c.clientId} | ${c.name} | ${c.currentPhone} | ${c.extracted || 'N/A'} | ${c.description} |\n`;
            }
            report += '\n---\n\n';
        }

        // Wrong format (fixable)
        if (issues.wrongFormat.length > 0) {
            report += `## ⚠️ Wrong Format - Can Be Auto-Fixed (${issues.wrongFormat.length})\n\n`;
            report += `| Client ID | Name | Current Phone | Should Be |\n`;
            report += `|-----------|------|---------------|----------|\n`;
            for (const c of issues.wrongFormat.slice(0, 100)) { // Limit to first 100
                report += `| ${c.clientId} | ${c.name} | ${c.currentPhone} | ${c.corrected} |\n`;
            }
            if (issues.wrongFormat.length > 100) {
                report += `\n*...and ${issues.wrongFormat.length - 100} more*\n`;
            }
            report += '\n---\n\n';
        }

        // Empty
        if (issues.empty.length > 0) {
            report += `## ❌ Empty Phone Numbers (${issues.empty.length})\n\n`;
            report += `| Client ID | Name | Email | Current Value |\n`;
            report += `|-----------|------|-------|---------------|\n`;
            for (const c of issues.empty) {
                report += `| ${c.clientId} | ${c.name} | ${c.email} | \`${c.currentPhone}\` |\n`;
            }
            report += '\n---\n\n';
        }

        // Unknown
        if (issues.unknown.length > 0) {
            report += `## ❓ Unknown Issues (${issues.unknown.length})\n\n`;
            report += `| Client ID | Name | Current Phone | Issue |\n`;
            report += `|-----------|------|---------------|-------|\n`;
            for (const c of issues.unknown) {
                report += `| ${c.clientId} | ${c.name} | ${c.currentPhone} | ${c.description} |\n`;
            }
            report += '\n---\n\n';
        }

        // Instructions
        report += `## 🔧 How to Fix

### Auto-fix wrong format issues:
\`\`\`bash
node scripts/cleanup-phone-numbers.js
\`\`\`

### For missing/invalid phone numbers:
These clients need to be contacted to get their correct phone numbers, or updated manually in the admin panel.

---

*Report generated by \`scripts/audit-phone-numbers.js\`*
`;

        // Write report to file
        const outputPath = path.join(__dirname, '..', 'PHONE_NUMBER_AUDIT.md');
        fs.writeFileSync(outputPath, report);
        console.log(`\n📄 Report written to: PHONE_NUMBER_AUDIT.md`);

        // Console summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 Audit Summary:');
        console.log('='.repeat(60));
        console.log(`   Total clients:              ${clients.length}`);
        console.log(`   ✅ Valid phone numbers:     ${issues.valid.length}`);
        console.log(`   ⚠️  Wrong format (fixable): ${issues.wrongFormat.length}`);
        console.log(`   ❌ Missing phone:           ${issues.missing.length}`);
        console.log(`   ❌ Too short:               ${issues.tooShort.length}`);
        console.log(`   ❌ Too long:                ${issues.tooLong.length}`);
        console.log(`   ❌ Invalid prefix:          ${issues.invalidPrefix.length}`);
        console.log(`   ❌ Empty:                   ${issues.empty.length}`);
        console.log(`   ❓ Unknown:                 ${issues.unknown.length}`);
        console.log('='.repeat(60));

        await mongoose.disconnect();
        console.log('\n✅ Audit completed! Check PHONE_NUMBER_AUDIT.md for full details.');

    } catch (error) {
        console.error('\n❌ Audit failed:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

// Run the audit
auditPhoneNumbers();
