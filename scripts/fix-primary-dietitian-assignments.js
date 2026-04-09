/* eslint-disable no-console */
/**
 * fix-primary-dietitian-assignments.js
 *
 * Corrects wrong primary-dietitian assignments for a list of clients.
 *
 * HOW TO USE
 * ──────────
 * 1. Fill in the ASSIGNMENTS array below.
 *    Each entry needs:
 *      clientId     – the display ID shown in the app, e.g.  "C-42"
 *      dietitianName – the full name (or enough of it) to uniquely identify
 *                      the dietitian, e.g. "Priya Sharma"
 *
 * 2. Dry-run (preview only, no writes):
 *      node scripts/fix-primary-dietitian-assignments.js
 *
 * 3. Apply the changes:
 *      node scripts/fix-primary-dietitian-assignments.js --apply
 *
 * WHAT IT DOES
 * ────────────
 * • Sets assignedDietitian  → new primary dietitian's ObjectId
 * • Does NOT modify assignedDietitians[] at all
 * • Only primary dietitian is changed
 */

require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
// ✏️  EDIT THIS SECTION — paste your client/dietitian pairs here
// ─────────────────────────────────────────────────────────────────────────────
const ASSIGNMENTS = [
    { clientId: 'C-1299', dietitianName: 'KHUSHBOO VISHWAKARMA' },
    { clientId: 'C-2365', dietitianName: 'URVASHI SAXENA' },
    { clientId: 'C-2410', dietitianName: 'DEEPA MISHRA' },
    { clientId: 'C-2413', dietitianName: 'KHUSHBOO VISHWAKARMA' },
    { clientId: 'C-2441', dietitianName: 'GANGA' },
    { clientId: 'C-2445', dietitianName: 'KIRTI PANDE' },
    { clientId: 'C-2467', dietitianName: 'MARIYAM KHAN' },
    { clientId: 'C-2468', dietitianName: 'DEBOLINA ROY' },
    { clientId: 'C-2476', dietitianName: 'DEEPA MISHRA' },
    { clientId: 'C-2480', dietitianName: 'PALAK LALWANI' },
    { clientId: 'C-2483', dietitianName: 'ROSHAN ARA' },
    { clientId: 'C-2484', dietitianName: 'GANGA' },
    { clientId: 'C-2485', dietitianName: 'SUBHRA NANDI' },
    { clientId: 'C-2486', dietitianName: 'RUKHAYA RUSHADA' },
    { clientId: 'C-2487', dietitianName: 'MARIYAM KHAN' },
    { clientId: 'C-2488', dietitianName: 'GANGA' },
    { clientId: 'C-2491', dietitianName: 'SIMRA SIDDIQUE' },
    { clientId: 'C-2493', dietitianName: 'URVASHI SAXENA' },
    { clientId: 'C-2494', dietitianName: 'GANGA' },
    { clientId: 'C-2496', dietitianName: 'SHIVANGI KHARE' },
    { clientId: 'C-2497', dietitianName: 'DEEPA MISHRA' },
    { clientId: 'C-2499', dietitianName: 'LOVISHA GOYAL' },
    { clientId: 'C-2500', dietitianName: 'JYOTI SHARMA' },
    { clientId: 'C-2501', dietitianName: 'DEEPA MISHRA' },
    { clientId: 'C-2504', dietitianName: 'PRIYANKA SHRIVASTAVA' },
    { clientId: 'C-2506', dietitianName: 'DEEPA MISHRA' },
    { clientId: 'C-2507', dietitianName: 'GANGA' },
    { clientId: 'C-2508', dietitianName: 'NIKHILA P VINOD' },
    { clientId: 'C-2512', dietitianName: 'SREELATHA S' },
    { clientId: 'C-2515', dietitianName: 'RITIKA BHATNAGAR' },
    { clientId: 'C-2517', dietitianName: 'URVASHI SAXENA' },
    { clientId: 'C-2518', dietitianName: 'DEBOLINA ROY' },
    { clientId: 'C-2519', dietitianName: 'PALAK LALWANI' },
    { clientId: 'C-2522', dietitianName: 'SIMRA SIDDIQUE' },
    { clientId: 'C-2525', dietitianName: 'SIMRA SIDDIQUE' },
    { clientId: 'C-2526', dietitianName: 'SHIVANGI KHARE' },
    { clientId: 'C-2528', dietitianName: 'RITIKA CHANDEKAR' },
    { clientId: 'C-2529', dietitianName: 'MARIYAM KHAN' },
    { clientId: 'C-2535', dietitianName: 'TABASSUM ANSARI' },
    { clientId: 'C-2538', dietitianName: 'LOKESH KUMAR' },
    { clientId: 'C-2545', dietitianName: 'RUKHAYA RUSHADA' },
    { clientId: 'C-2547', dietitianName: 'GANGA' },
    { clientId: 'C-2548', dietitianName: 'DEEPA MISHRA' },
    { clientId: 'C-2552', dietitianName: 'RUKHAYA RUSHADA' },
    { clientId: 'C-2553', dietitianName: 'DEBOLINA ROY' },
    { clientId: 'C-2554', dietitianName: 'RITIKA CHANDEKAR' },
    { clientId: 'C-2557', dietitianName: 'SACHI TIWARI' },
    { clientId: 'C-2562', dietitianName: 'MARIYAM KHAN' },
    { clientId: 'C-2563', dietitianName: 'RITIKA BHATNAGAR' },
    { clientId: 'C-2572', dietitianName: 'DEEPA MISHRA' },
    { clientId: 'C-2574', dietitianName: 'RITIKA CHANDEKAR' },
    { clientId: 'C-2578', dietitianName: 'ANUKRATI CHIROLIYA' },
    { clientId: 'C-2579', dietitianName: 'RITIKA CHANDEKAR' },
    { clientId: 'C-2580', dietitianName: 'SUBHRA NANDI' },
    { clientId: 'C-2581', dietitianName: 'KIRTI PANDE' },
    { clientId: 'C-2583', dietitianName: 'URVASHI SAXENA' },
    { clientId: 'C-2584', dietitianName: 'KIRTI PANDE' },
    { clientId: 'C-2585', dietitianName: 'TABASSUM ANSARI' },
    { clientId: 'C-2586', dietitianName: 'PALAK LALWANI' },
    { clientId: 'C-2588', dietitianName: 'PRIYANKA SHRIVASTAVA' },
    { clientId: 'C-2590', dietitianName: 'DEBOLINA ROY' },
    { clientId: 'C-2591', dietitianName: 'ROSHAN ARA' },
    { clientId: 'C-2596', dietitianName: 'ROSHAN ARA' },
    { clientId: 'C-2597', dietitianName: 'SUBHRA NANDI' },
    { clientId: 'C-2599', dietitianName: 'PRIYANKA SHRIVASTAVA' },
    { clientId: 'C-2602', dietitianName: 'RUKHAYA RUSHADA' },
    { clientId: 'C-2603', dietitianName: 'MARIYAM KHAN' },
    { clientId: 'C-2605', dietitianName: 'LOKESH KUMAR' },
    { clientId: 'C-2608', dietitianName: 'PRIYANKA SHRIVASTAVA' },
    { clientId: 'C-2609', dietitianName: 'KHUSHBOO VISHWAKARMA' },
    { clientId: 'C-2624', dietitianName: 'URVASHI SAXENA' },
    { clientId: 'C-2792', dietitianName: 'MANASA MERNEDI' },
    { clientId: 'C-2839', dietitianName: 'DEBOLINA ROY' },
    { clientId: 'C-2869', dietitianName: 'LOKESH KUMAR' },
];

// ─────────────────────────────────────────────────────────────────────────────

const APPLY = process.argv.includes('--apply');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('❌  MONGODB_URI not found in .env.local');
    process.exit(1);
}

if (ASSIGNMENTS.length === 0) {
    console.error('❌  ASSIGNMENTS array is empty. Add your client/dietitian pairs first.');
    process.exit(1);
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normalizeName(name) {
    return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Find a dietitian by first+last name (case-insensitive, supports partial). */
async function findDietitianByName(col, rawName) {
    const parts = normalizeName(rawName).split(' ');
    const firstName = escapeRegex(parts[0]);
    const lastName = escapeRegex(parts.slice(1).join(' ') || '');

    const query = { role: 'dietitian' };

    if (lastName) {
        // Try exact first+last match first
        const exact = await col.findOne({
            ...query,
            firstName: { $regex: new RegExp(`^${firstName}$`, 'i') },
            lastName: { $regex: new RegExp(`^${lastName}$`, 'i') },
        });
        if (exact) return exact;

        // Fall back to "starts with"
        const partial = await col.findOne({
            ...query,
            firstName: { $regex: new RegExp(`^${firstName}`, 'i') },
            lastName: { $regex: new RegExp(`^${lastName}`, 'i') },
        });
        if (partial) return partial;
    }

    // Single-word: search firstName OR lastName
    return col.findOne({
        ...query,
        $or: [
            { firstName: { $regex: new RegExp(`^${firstName}`, 'i') } },
            { lastName: { $regex: new RegExp(`^${firstName}`, 'i') } },
        ],
    });
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n🔗 Connecting to MongoDB…');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    const col = mongoose.connection.db.collection('users');

    // ── resolve all dietitians first (fail fast on lookup errors) ────────────
    const resolvedDietitians = new Map(); // dietitianName → dietitian doc

    console.log('🔍 Resolving dietitians…');
    for (const row of ASSIGNMENTS) {
        if (resolvedDietitians.has(row.dietitianName)) continue;
        const dt = await findDietitianByName(col, row.dietitianName);
        if (!dt) {
            console.error(`   ❌  Dietitian not found: "${row.dietitianName}"`);
        } else {
            console.log(
                `   ✅  "${row.dietitianName}" → ${dt.firstName} ${dt.lastName}  [${dt.dtps_id || dt._id}]`
            );
        }
        resolvedDietitians.set(row.dietitianName, dt || null);
    }

    const missingDietitians = [...resolvedDietitians.values()].filter((v) => v === null).length;
    if (missingDietitians > 0) {
        console.error(
            `\n❌  ${missingDietitians} dietitian(s) could not be found. Fix the names and re-run.`
        );
        await mongoose.disconnect();
        process.exit(1);
    }

    // ── build bulk operations ─────────────────────────────────────────────────
    console.log('\n📋 Planning updates…\n');

    const rows = [];   // for summary table
    const bulkOps = [];

    for (const { clientId, dietitianName } of ASSIGNMENTS) {
        const client = await col.findOne(
            { role: 'client', clientId },
            {
                projection: {
                    _id: 1, clientId: 1, firstName: 1, lastName: 1,
                    assignedDietitian: 1,
                },
            }
        );

        if (!client) {
            rows.push({ clientId, status: '❌ CLIENT NOT FOUND', detail: '' });
            continue;
        }

        const newPrimary = resolvedDietitians.get(dietitianName);
        const newPrimaryId = String(newPrimary._id);

        const oldPrimaryId = client.assignedDietitian
            ? String(client.assignedDietitian)
            : null;

        // No change needed?
        if (oldPrimaryId === newPrimaryId) {
            rows.push({
                clientId,
                clientName: `${client.firstName} ${client.lastName}`,
                oldPrimary: `${newPrimary.firstName} ${newPrimary.lastName} (same)`,
                newPrimary: '—',
                status: '⏭  ALREADY CORRECT',
            });
            continue;
        }

        const updateOp = {
            $set: {
                assignedDietitian: new mongoose.Types.ObjectId(newPrimaryId),
            },
        };

        // Look up old primary name for the report
        let oldPrimaryName = '(none)';
        if (oldPrimaryId) {
            const oldDt = await col.findOne(
                { _id: new mongoose.Types.ObjectId(oldPrimaryId) },
                { projection: { firstName: 1, lastName: 1, dtps_id: 1 } }
            );
            if (oldDt) oldPrimaryName = `${oldDt.firstName} ${oldDt.lastName}`;
        }

        rows.push({
            clientId,
            clientName: `${client.firstName} ${client.lastName}`,
            oldPrimary: oldPrimaryName,
            newPrimary: `${newPrimary.firstName} ${newPrimary.lastName}`,
            status: APPLY ? '✅ UPDATED' : '🔄 WILL UPDATE',
        });

        if (APPLY) {
            bulkOps.push({
                updateOne: {
                    filter: { _id: client._id },
                    update: updateOp,
                },
            });
        }
    }

    // ── print summary table ───────────────────────────────────────────────────
    console.log('┌─────────────┬──────────────────────────────┬──────────────────────────────┬──────────────────────────────┬────────────────────┐');
    console.log('│ Client ID   │ Client Name                  │ Old Primary                  │ New Primary                  │ Status             │');
    console.log('├─────────────┼──────────────────────────────┼──────────────────────────────┼──────────────────────────────┼────────────────────┤');

    for (const r of rows) {
        const pad = (s, n) => String(s || '').substring(0, n).padEnd(n);
        console.log(
            `│ ${pad(r.clientId, 11)} │ ${pad(r.clientName, 28)} │ ${pad(r.oldPrimary, 28)} │ ${pad(r.newPrimary, 28)} │ ${pad(r.status, 18)} │`
        );
    }

    console.log('└─────────────┴──────────────────────────────┴──────────────────────────────┴──────────────────────────────┴────────────────────┘');

    // ── apply writes ─────────────────────────────────────────────────────────
    if (APPLY) {
        if (bulkOps.length > 0) {
            const result = await col.bulkWrite(bulkOps, { ordered: false });
            console.log(`\n✅ Done — ${result.modifiedCount} client(s) updated.`);
        } else {
            console.log('\n✅ Nothing to update (all clients already had the correct primary dietitian).');
        }
    } else {
        const toUpdate = rows.filter((r) => r.status === '🔄 WILL UPDATE').length;
        console.log(`\n⚠️  DRY RUN — no changes written.`);
        console.log(`   ${toUpdate} client(s) would be updated.`);
        if (toUpdate > 0) {
            console.log(`   Re-run with --apply to commit the changes:\n`);
            console.log(`     node scripts/fix-primary-dietitian-assignments.js --apply\n`);
        }
    }

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error('\n💥 Unexpected error:', err);
    mongoose.disconnect();
    process.exit(1);
});
