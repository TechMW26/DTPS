/* eslint-disable no-console */
/**
 * remove-none-dietary-restrictions.js
 *
 * Removes "none"/"None" placeholder tags from dietaryRestrictions
 * in all CLIENT medical records (MedicalInfo collection).
 *
 * Usage:
 *   Dry run (preview only):
 *     node scripts/remove-none-dietary-restrictions.js
 *
 *   Apply changes:
 *     node scripts/remove-none-dietary-restrictions.js --apply
 */

require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not found in .env.local');
    process.exit(1);
}

const userSchema = new mongoose.Schema(
    {
        role: String,
        clientId: String,
        firstName: String,
        lastName: String,
        email: String,
    },
    { collection: 'users', strict: false }
);

const medicalInfoSchema = new mongoose.Schema(
    {
        userId: mongoose.Schema.Types.ObjectId,
        dietaryRestrictions: [String],
        updatedAt: Date,
    },
    { collection: 'medicalinfos', strict: false }
);

const User = mongoose.models.__ScriptUser || mongoose.model('__ScriptUser', userSchema);
const MedicalInfo = mongoose.models.__ScriptMedicalInfo || mongoose.model('__ScriptMedicalInfo', medicalInfoSchema);

function normalizeRestrictions(raw) {
    const list = Array.isArray(raw)
        ? raw
        : typeof raw === 'string'
            ? raw.split(',')
            : [];

    const cleaned = list
        .map((v) => String(v || '').trim())
        .filter(Boolean)
        .filter((v) => v.toLowerCase() !== 'none');

    // Deduplicate case-insensitively while preserving first-seen casing.
    const seen = new Set();
    const deduped = [];
    for (const item of cleaned) {
        const key = item.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(item);
    }

    return deduped;
}

function isSameArray(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

async function main() {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    const clients = await User.find({ role: 'client' }).select('_id clientId firstName lastName email').lean();
    const clientIdSet = new Set(clients.map((c) => String(c._id)));
    const clientMap = new Map(clients.map((c) => [String(c._id), c]));

    console.log(`👥 Clients found: ${clients.length}`);

    const allMedicalInfos = await MedicalInfo.find({ userId: { $in: [...clientIdSet] } })
        .select('_id userId dietaryRestrictions')
        .lean();

    console.log(`🩺 Client medical records found: ${allMedicalInfos.length}`);

    const toUpdate = [];
    const preview = [];

    for (const doc of allMedicalInfos) {
        const current = normalizeRestrictions(doc.dietaryRestrictions || []);
        const rawCurrent = Array.isArray(doc.dietaryRestrictions)
            ? doc.dietaryRestrictions.map((v) => String(v || '').trim()).filter(Boolean)
            : [];

        if (isSameArray(rawCurrent, current)) continue;

        toUpdate.push({
            updateOne: {
                filter: { _id: doc._id },
                update: {
                    $set: {
                        dietaryRestrictions: current,
                        updatedAt: new Date(),
                    },
                },
            },
        });

        const client = clientMap.get(String(doc.userId));
        preview.push({
            medicalInfoId: String(doc._id),
            userId: String(doc.userId),
            clientId: client?.clientId || 'N/A',
            name: `${client?.firstName || ''} ${client?.lastName || ''}`.trim() || client?.email || 'Unknown',
            before: rawCurrent,
            after: current,
        });
    }

    console.log(`\n📌 Records that need cleanup: ${toUpdate.length}`);

    if (preview.length > 0) {
        console.log('\n🔎 Sample changes (up to 20):');
        preview.slice(0, 20).forEach((p, idx) => {
            console.log(`\n${idx + 1}. ${p.clientId} | ${p.name}`);
            console.log(`   before: [${p.before.join(', ')}]`);
            console.log(`   after : [${p.after.join(', ')}]`);
        });
    }

    if (!APPLY) {
        console.log('\n🧪 Dry run only. No updates were written.');
        console.log('➡️  Re-run with --apply to persist changes.');
        await mongoose.disconnect();
        return;
    }

    if (toUpdate.length === 0) {
        console.log('\n✅ Nothing to update.');
        await mongoose.disconnect();
        return;
    }

    const result = await MedicalInfo.bulkWrite(toUpdate, { ordered: false });

    console.log('\n✅ Cleanup applied successfully');
    console.log(`   matched:  ${result.matchedCount || 0}`);
    console.log(`   modified: ${result.modifiedCount || 0}`);

    await mongoose.disconnect();
}

main().catch(async (error) => {
    console.error('\n❌ Script failed:', error);
    try {
        await mongoose.disconnect();
    } catch {
        // ignore
    }
    process.exit(1);
});
