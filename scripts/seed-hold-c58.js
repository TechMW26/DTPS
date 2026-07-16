#!/usr/bin/env node
/**
 * Seed a back-dated hold on a client so you can manually verify the unhold flow
 * (and the resulting Expected End Date extension) through the admin UI.
 *
 * What it does (with --apply):
 *   1. Resolves the client by clientId/shortId (default C-58).
 *   2. If the client is already on hold, clears that flag first (without
 *      crediting any duration to totalHoldDurationMs) so we start clean.
 *   3. Sets holdStatus.isOnHold=true, clientStatus='hold', and back-dates
 *      holdStatus.holdDate to (now − N days). Default N = 15.
 *   4. Increments holdCount and pushes one entry into holdStatusHistory.
 *   5. Prints the current expectedEndDate of every active purchase so you
 *      can compare against the value AFTER you click "Activate" in the
 *      admin UI.
 *
 * Then you manually:
 *   • Open the admin/dietitian client page for the client.
 *   • Click "Activate" (unhold).
 *   • Re-run `node scripts/inspect-hold-state.js C-58` (see below) to confirm
 *     the expectedEndDate moved forward by exactly N days.
 *
 * Usage:
 *   node scripts/seed-hold-c58.js                       # dry run
 *   node scripts/seed-hold-c58.js --apply               # default 15 days back
 *   node scripts/seed-hold-c58.js --apply --days 2
 *   node scripts/seed-hold-c58.js --client C-22 --apply --days 7
 *   node scripts/seed-hold-c58.js --reason "QA test"
 */

require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not set in .env.local');
    process.exit(1);
}

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const arg = (n, def) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 && i < argv.length - 1 ? argv[i + 1] : def;
};

const APPLY = flag('apply');
const CLIENT_KEY = arg('client', 'C-58');
const DAYS_BACK = Number(arg('days', '15')) || 15;
const REASON = arg('reason', 'Manual QA test — back-dated hold');

const isoFull = (d) => (d ? new Date(d).toISOString() : '(none)');
const isoDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '(none)');
const hms = (d) => {
    const dt = new Date(d);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:${pad(dt.getUTCSeconds())}`;
};

(async () => {
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;
    const Users = db.collection('users');
    const Unified = db.collection('unifiedpayments');
    const Legacy = db.collection('clientpurchases');

    const client = await Users.findOne({
        $or: [{ clientId: CLIENT_KEY }, { shortId: CLIENT_KEY }],
    });
    if (!client) {
        console.error(`❌ No user with clientId/shortId=${CLIENT_KEY}`);
        process.exit(1);
    }

    console.log(
        `Client: ${client.firstName || ''} ${client.lastName || ''} ` +
        `(${client.clientId || client.shortId})  _id=${client._id}\n`
    );

    const now = new Date();
    const holdStart = new Date(now.getTime() - DAYS_BACK * 24 * 60 * 60 * 1000);

    console.log('--- Plan ---');
    console.log(`  back-dated holdDate : ${isoFull(holdStart)}  (= now − ${DAYS_BACK} day(s))`);
    console.log(`  holdTime             : ${hms(holdStart)}`);
    console.log(`  currently on hold?   : ${!!client.holdStatus?.isOnHold}`);
    console.log(`  holdCount currently  : ${client.holdStatus?.holdCount || 0}`);
    console.log(`  totalHoldDurationMs  : ${client.holdStatus?.totalHoldDurationMs || 0}\n`);

    // Snapshot expected end dates so the user can compare BEFORE and AFTER unhold.
    const unifiedPurchases = await Unified.find({
        client: client._id,
        paymentStatus: 'paid',
        status: { $in: ['paid', 'completed', 'active'] },
    }).project({ _id: 1, expectedEndDate: 1, endDate: 1, originalExpectedEndDate: 1, holdExtensionMs: 1 }).toArray();
    const legacyPurchases = await Legacy.find({
        client: client._id,
        paymentStatus: 'paid',
        status: { $in: ['active', 'pending'] },
    }).project({ _id: 1, expectedEndDate: 1, endDate: 1 }).toArray();

    console.log('--- Active UnifiedPayments BEFORE unhold ---');
    if (unifiedPurchases.length === 0) console.log('  (none)');
    unifiedPurchases.forEach((p) => {
        const eligible =
            (p.expectedEndDate || p.endDate) &&
            new Date(p.expectedEndDate || p.endDate).getTime() >= holdStart.getTime();
        console.log(
            `  - ${p._id}  expectedEndDate=${isoDay(p.expectedEndDate)}  endDate=${isoDay(p.endDate)}  ` +
            `original=${isoDay(p.originalExpectedEndDate)}  holdExtensionMs=${p.holdExtensionMs || 0}  ` +
            `→ ${eligible ? `WILL be extended by ${DAYS_BACK}d` : 'SKIPPED (ended before holdStart)'}`
        );
        if (eligible) {
            const after = new Date(new Date(p.expectedEndDate || p.endDate).getTime() + DAYS_BACK * 86400000);
            console.log(`      after unhold → expectedEndDate=${isoDay(after)}`);
        }
    });

    console.log('\n--- Active legacy ClientPurchases BEFORE unhold ---');
    if (legacyPurchases.length === 0) console.log('  (none)');
    legacyPurchases.forEach((p) => {
        const eligible =
            (p.expectedEndDate || p.endDate) &&
            new Date(p.expectedEndDate || p.endDate).getTime() >= holdStart.getTime();
        console.log(
            `  - ${p._id}  expectedEndDate=${isoDay(p.expectedEndDate)}  endDate=${isoDay(p.endDate)}  ` +
            `→ ${eligible ? `WILL be extended by ${DAYS_BACK}d` : 'SKIPPED (ended before holdStart)'}`
        );
        if (eligible) {
            const after = new Date(new Date(p.expectedEndDate || p.endDate).getTime() + DAYS_BACK * 86400000);
            console.log(`      after unhold → expectedEndDate=${isoDay(after)}`);
        }
    });

    if (!APPLY) {
        console.log('\n(dry run) Pass --apply to actually seed the back-dated hold.');
        await mongoose.disconnect();
        return;
    }

    // If already on hold, clear that state first so we install ours cleanly.
    if (client.holdStatus?.isOnHold) {
        await Users.updateOne(
            { _id: client._id },
            { $set: { 'holdStatus.isOnHold': false, clientStatus: 'active' } }
        );
    }

    // Install the back-dated hold.
    await Users.updateOne(
        { _id: client._id },
        {
            $set: {
                'holdStatus.isOnHold': true,
                'holdStatus.holdDate': holdStart,
                'holdStatus.holdTime': hms(holdStart),
                'holdStatus.heldBy': client._id, // self-actor; just a marker for QA seed
                clientStatus: 'hold',
            },
            $inc: { 'holdStatus.holdCount': 1 },
            $push: {
                holdStatusHistory: {
                    action: 'hold',
                    performedBy: client._id,
                    performedByName: 'QA Seed Script',
                    performedByRole: 'Admin',
                    timestamp: holdStart,
                    reason: REASON,
                },
                clientStatusHistory: {
                    previousStatus: client.clientStatus || null,
                    newStatus: 'hold',
                    changedBy: client._id,
                    isManual: true,
                    trigger: 'hold',
                    relatedEvent: REASON,
                    timestamp: holdStart,
                },
            },
        }
    );

    const after = await Users.findOne({ _id: client._id });
    console.log('\n--- Seeded hold state ---');
    console.log(`  clientStatus       : ${after.clientStatus}`);
    console.log(`  holdStatus.isOnHold: ${after.holdStatus?.isOnHold}`);
    console.log(`  holdStatus.holdDate: ${isoFull(after.holdStatus?.holdDate)}`);
    console.log(`  holdStatus.holdTime: ${after.holdStatus?.holdTime}`);
    console.log(`  holdCount          : ${after.holdStatus?.holdCount}`);

    console.log('\nNext steps:');
    console.log('  1. Open the admin/dietitian client page for this user.');
    console.log('  2. Click "Activate" to unhold (the server route applies the extension).');
    console.log(`  3. Run:  node scripts/inspect-hold-state.js ${CLIENT_KEY}`);
    console.log('     and confirm each eligible purchase\'s expectedEndDate moved forward');
    console.log(`     by ${DAYS_BACK} day(s) and holdExtensionMs increased by ${DAYS_BACK * 86400000}.`);

    await mongoose.disconnect();
})().catch(async (err) => {
    console.error('Fatal:', err);
    try { await mongoose.disconnect(); } catch { }
    process.exit(1);
});
