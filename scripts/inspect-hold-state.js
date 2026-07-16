#!/usr/bin/env node
/**
 * Print the current hold state of a client + the expectedEndDate of all
 * active purchases. Use BEFORE and AFTER manually clicking "Activate" in
 * the admin UI to confirm the extension was applied.
 *
 * Usage:
 *   node scripts/inspect-hold-state.js C-58
 */

require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not set in .env.local');
    process.exit(1);
}

const CLIENT_KEY = process.argv[2] || 'C-58';

const isoFull = (d) => (d ? new Date(d).toISOString() : '(none)');
const isoDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '(none)');

(async () => {
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;

    const client = await db.collection('users').findOne({
        $or: [{ clientId: CLIENT_KEY }, { shortId: CLIENT_KEY }],
    });
    if (!client) {
        console.error(`❌ No user with clientId/shortId=${CLIENT_KEY}`);
        process.exit(1);
    }

    console.log(
        `Client: ${client.firstName || ''} ${client.lastName || ''} ` +
        `(${client.clientId || client.shortId})  _id=${client._id}`
    );
    console.log(`  clientStatus           : ${client.clientStatus}`);
    console.log(`  holdStatus.isOnHold    : ${!!client.holdStatus?.isOnHold}`);
    console.log(`  holdStatus.holdDate    : ${isoFull(client.holdStatus?.holdDate)}`);
    console.log(`  holdStatus.holdTime    : ${client.holdStatus?.holdTime || '(none)'}`);
    console.log(`  holdStatus.activatedDate: ${isoFull(client.holdStatus?.activatedDate)}`);
    console.log(`  holdStatus.activatedTime: ${client.holdStatus?.activatedTime || '(none)'}`);
    console.log(`  holdStatus.holdCount   : ${client.holdStatus?.holdCount || 0}`);
    console.log(`  totalHoldDurationMs    : ${client.holdStatus?.totalHoldDurationMs || 0}`);

    const lastHistory = (client.holdStatusHistory || []).slice(-3);
    if (lastHistory.length > 0) {
        console.log(`\n  Last ${lastHistory.length} holdStatusHistory entries:`);
        lastHistory.forEach((h) => {
            console.log(`    - ${h.action.padEnd(8)} @ ${isoFull(h.timestamp)} ` +
                `by=${h.performedByName || '?'} reason="${h.reason || ''}" ` +
                `${h.holdDurationMs ? `holdDurationMs=${h.holdDurationMs}` : ''}`);
        });
    }

    console.log('\n--- Active UnifiedPayments ---');
    const unifiedPurchases = await db.collection('unifiedpayments').find({
        client: client._id,
        paymentStatus: 'paid',
        status: { $in: ['paid', 'completed', 'active'] },
    }).project({
        _id: 1, expectedEndDate: 1, endDate: 1, originalExpectedEndDate: 1,
        holdExtensionMs: 1, holdExtensionHistory: 1,
    }).toArray();

    if (unifiedPurchases.length === 0) console.log('  (none)');
    unifiedPurchases.forEach((p) => {
        console.log(
            `  - ${p._id}\n` +
            `      expectedEndDate          : ${isoDay(p.expectedEndDate)}\n` +
            `      endDate                  : ${isoDay(p.endDate)}\n` +
            `      originalExpectedEndDate  : ${isoDay(p.originalExpectedEndDate)}\n` +
            `      holdExtensionMs (total)  : ${p.holdExtensionMs || 0}\n` +
            `      holdExtensionHistory     : ${p.holdExtensionHistory?.length || 0} entry(ies)`
        );
        (p.holdExtensionHistory || []).slice(-2).forEach((h, i) => {
            console.log(
                `        [${i}] +${h.addedMs}ms  ${isoDay(h.previousExpectedEndDate)} → ${isoDay(h.newExpectedEndDate)}  @ ${isoFull(h.appliedAt)}`
            );
        });
    });

    console.log('\n--- Active legacy ClientPurchases ---');
    const legacyPurchases = await db.collection('clientpurchases').find({
        client: client._id,
        paymentStatus: 'paid',
        status: { $in: ['active', 'pending'] },
    }).project({ _id: 1, expectedEndDate: 1, endDate: 1 }).toArray();

    if (legacyPurchases.length === 0) console.log('  (none)');
    legacyPurchases.forEach((p) => {
        console.log(
            `  - ${p._id}  expectedEndDate=${isoDay(p.expectedEndDate)}  endDate=${isoDay(p.endDate)}`
        );
    });

    await mongoose.disconnect();
})().catch(async (err) => {
    console.error('Fatal:', err);
    try { await mongoose.disconnect(); } catch { }
    process.exit(1);
});
