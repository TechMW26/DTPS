#!/usr/bin/env node

/**
 * IST Timezone Audit Script
 * 
 * Audits the database to verify date fields are stored correctly and
 * demonstrates how they render in IST after the timezone enforcement changes.
 *
 * MongoDB stores all dates as UTC epoch timestamps internally — this is correct
 * and should NOT be changed. IST enforcement happens at the application layer:
 *   - Server: TZ=Asia/Kolkata env + Mongoose toJSON plugin
 *   - Client: formatDateIST / formatTimeIST / formatDateTimeIST utilities
 *
 * Usage:
 *   MONGODB_URI="mongodb://..." node scripts/audit-ist-timezone.js
 *   MONGODB_URI="mongodb://..." node scripts/audit-ist-timezone.js --fix-nulls
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +5:30

if (!MONGODB_URI) {
    console.error('ERROR: Set MONGODB_URI or DATABASE_URL environment variable');
    process.exit(1);
}

const FIX_NULLS = process.argv.includes('--fix-nulls');

function toIST(date) {
    if (!date) return null;
    const d = new Date(date);
    return new Date(d.getTime() + IST_OFFSET_MS).toISOString().replace('Z', '+05:30');
}

async function main() {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db();

    console.log('='.repeat(70));
    console.log('  DTPS IST TIMEZONE AUDIT');
    console.log('  Database:', MONGODB_URI.replace(/\/\/.*@/, '//***@'));
    console.log('  Time:', new Date().toISOString(), '(UTC) |', toIST(new Date()), '(IST)');
    console.log('='.repeat(70));

    const collections = await db.listCollections().toArray();
    const collNames = collections.map(c => c.name).sort();

    let totalDocs = 0;
    let totalDateFields = 0;
    let nullDateFields = 0;
    let issues = [];

    for (const name of collNames) {
        const coll = db.collection(name);
        const count = await coll.countDocuments();
        if (count === 0) continue;

        // Sample up to 10 documents to detect date fields
        const samples = await coll.find().limit(10).toArray();
        const dateFields = new Set();

        for (const doc of samples) {
            detectDateFields(doc, '', dateFields);
        }

        if (dateFields.size === 0) continue;

        totalDocs += count;
        totalDateFields += dateFields.size;

        // Check for null/invalid dates in date fields
        for (const field of dateFields) {
            const nullCount = await coll.countDocuments({
                [field]: { $exists: true, $eq: null }
            });

            if (nullCount > 0) {
                nullDateFields += nullCount;
                issues.push({
                    collection: name,
                    field,
                    issue: `${nullCount} documents with null value`,
                    severity: 'info'
                });
            }
        }

        // Show sample dates in IST
        const sampleDoc = samples[0];
        const sampleDates = {};
        for (const field of dateFields) {
            const val = getNestedValue(sampleDoc, field);
            if (val instanceof Date) {
                sampleDates[field] = {
                    utc: val.toISOString(),
                    ist: toIST(val)
                };
            }
        }

        console.log(`\n📁 ${name} (${count} docs, ${dateFields.size} date fields)`);
        console.log(`   Date fields: ${[...dateFields].join(', ')}`);
        if (Object.keys(sampleDates).length > 0) {
            console.log('   Sample (first doc):');
            for (const [f, v] of Object.entries(sampleDates)) {
                console.log(`     ${f}: ${v.utc} → IST: ${v.ist}`);
            }
        }
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('  AUDIT SUMMARY');
    console.log('='.repeat(70));
    console.log(`  Collections scanned: ${collNames.length}`);
    console.log(`  Collections with dates: ${totalDateFields > 0 ? 'found' : 'none'}`);
    console.log(`  Total docs with date fields: ${totalDocs}`);
    console.log(`  Null date field instances: ${nullDateFields}`);
    console.log(`  Issues found: ${issues.length}`);

    if (issues.length > 0) {
        console.log('\n  Issues:');
        for (const issue of issues) {
            console.log(`    [${issue.severity.toUpperCase()}] ${issue.collection}.${issue.field}: ${issue.issue}`);
        }
    }

    // Verify TZ setting
    console.log('\n  TIMEZONE VERIFICATION:');
    const now = new Date();
    const localMidnight = new Date(now);
    localMidnight.setHours(0, 0, 0, 0);
    const expectedISTMidnight = new Date(localMidnight.getTime());

    console.log(`    process.env.TZ = ${process.env.TZ || '(not set)'}`);
    console.log(`    new Date() = ${now.toISOString()}`);
    console.log(`    Local midnight (setHours(0,0,0,0)) = ${localMidnight.toISOString()}`);

    if (process.env.TZ === 'Asia/Kolkata') {
        // Verify midnight is at 18:30Z of previous day (IST midnight = UTC 18:30 prev day)
        const hours = localMidnight.getUTCHours();
        const minutes = localMidnight.getUTCMinutes();
        if (hours === 18 && minutes === 30) {
            console.log('    ✅ TZ=Asia/Kolkata is working correctly (midnight = 18:30 UTC)');
        } else {
            console.log(`    ⚠️  TZ=Asia/Kolkata set but midnight UTC hours=${hours}:${minutes} (expected 18:30)`);
        }
    } else {
        console.log('    ⚠️  TZ is not set to Asia/Kolkata — setHours(0,0,0,0) will use system timezone');
    }

    console.log('\n  NOTE: MongoDB stores all dates as UTC epoch timestamps internally.');
    console.log('  This is CORRECT. IST conversion happens at the application layer via:');
    console.log('    - Mongoose toJSON plugin (src/lib/db/plugins/istDatePlugin.ts)');
    console.log('    - Client formatDateIST utilities (src/lib/utils/formatDateIST.ts)');
    console.log('    - TZ=Asia/Kolkata env variable for server-side new Date() calls');
    console.log('='.repeat(70));

    await client.close();
}

function detectDateFields(obj, prefix, dateFields) {
    if (!obj || typeof obj !== 'object') return;
    if (obj instanceof Date) {
        if (prefix) dateFields.add(prefix);
        return;
    }
    if (Array.isArray(obj)) {
        if (obj.length > 0 && obj[0] instanceof Date) {
            dateFields.add(prefix);
        }
        return;
    }
    for (const [key, value] of Object.entries(obj)) {
        if (key === '_id' || key === '__v') continue;
        const path = prefix ? `${prefix}.${key}` : key;
        if (value instanceof Date) {
            dateFields.add(path);
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
            detectDateFields(value, path, dateFields);
        }
    }
}

function getNestedValue(obj, path) {
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}

main().catch(err => {
    console.error('Audit failed:', err);
    process.exit(1);
});
