/* eslint-disable no-console */
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const TARGET_EMAIL = 'vajeda.rahaman@mushroomworldgroup.com';
const FIX_SCRIPT_PATH = path.join(process.cwd(), 'scripts', 'fix-primary-dietitian-assignments.js');

function extractClientIdsFromFixScript(fileContent) {
    const ids = new Set();
    const regex = /clientId:\s*'([^']+)'/g;
    let match;
    while ((match = regex.exec(fileContent)) !== null) {
        ids.add(match[1]);
    }
    return [...ids];
}

async function main() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI not found in .env.local');
    }

    if (!fs.existsSync(FIX_SCRIPT_PATH)) {
        throw new Error(`Fix script not found at ${FIX_SCRIPT_PATH}`);
    }

    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    const users = mongoose.connection.db.collection('users');

    const vajeda = await users.findOne(
        {
            role: 'dietitian',
            $or: [
                { email: TARGET_EMAIL },
                { firstName: { $regex: /^vajeda$/i }, lastName: { $regex: /^rehman|rahaman$/i } },
            ],
        },
        { projection: { _id: 1, firstName: 1, lastName: 1, email: 1, dtps_id: 1 } }
    );

    if (!vajeda) {
        throw new Error(`Dietitian not found for email ${TARGET_EMAIL}`);
    }

    const vajedaId = String(vajeda._id);
    console.log(`✅ Found dietitian: ${vajeda.firstName} ${vajeda.lastName} [${vajeda.dtps_id || vajedaId}]`);

    const fixScriptContent = fs.readFileSync(FIX_SCRIPT_PATH, 'utf8');
    const clientIds = extractClientIdsFromFixScript(fixScriptContent);

    if (clientIds.length === 0) {
        throw new Error('No client IDs found in fix-primary-dietitian-assignments.js');
    }

    const clients = await users.find(
        { role: 'client', clientId: { $in: clientIds } },
        {
            projection: {
                _id: 1,
                clientId: 1,
                firstName: 1,
                lastName: 1,
                assignedDietitian: 1,
                assignedDietitians: 1,
            },
        }
    ).toArray();

    console.log(`📋 Clients found from fix list: ${clients.length}/${clientIds.length}`);

    const bulkOps = [];
    let alreadyPresent = 0;
    let skippedPrimaryConflict = 0;

    for (const client of clients) {
        const primaryId = client.assignedDietitian ? String(client.assignedDietitian) : null;
        const secondaries = Array.isArray(client.assignedDietitians)
            ? client.assignedDietitians.map((v) => String(v))
            : [];

        if (primaryId === vajedaId) {
            skippedPrimaryConflict += 1;
            continue;
        }

        if (secondaries.includes(vajedaId)) {
            alreadyPresent += 1;
            continue;
        }

        bulkOps.push({
            updateOne: {
                filter: { _id: client._id },
                update: { $addToSet: { assignedDietitians: new mongoose.Types.ObjectId(vajedaId) } },
            },
        });
    }

    if (!APPLY) {
        console.log('⚠️ DRY RUN - no changes written');
        console.log(`➡️ Would add Vajeda as secondary to: ${bulkOps.length} client(s)`);
        console.log(`ℹ️ Already present in secondary: ${alreadyPresent}`);
        console.log(`ℹ️ Skipped because Vajeda is primary: ${skippedPrimaryConflict}`);
        console.log('Run with --apply to save changes.');
    } else {
        if (bulkOps.length > 0) {
            const result = await users.bulkWrite(bulkOps, { ordered: false });
            console.log(`✅ Updated clients: ${result.modifiedCount || 0}`);
        } else {
            console.log('✅ No updates needed.');
        }
        console.log(`ℹ️ Already present in secondary: ${alreadyPresent}`);
        console.log(`ℹ️ Skipped because Vajeda is primary: ${skippedPrimaryConflict}`);
    }

    await mongoose.disconnect();
    console.log('🔌 Disconnected');
}

main().catch(async (error) => {
    console.error('❌ Error:', error.message);
    try {
        await mongoose.disconnect();
    } catch { }
    process.exit(1);
});
