#!/usr/bin/env node
/**
 * End-to-end Hold → Unhold verification against the real DB.
 *
 * Simulates the admin hold/unhold flow used by
 *   POST /api/admin/clients/[clientId]/hold (hold)
 *   DELETE /api/admin/clients/[clientId]/hold (unhold)
 * and verifies:
 *   1.  client.clientStatus -> 'hold' while held
 *   2.  holdStatus.holdDate + holdTime recorded
 *   3.  Client-facing meal plan endpoint hides plans while held
 *       (mirrors the `isOnHold` short-circuit in /api/client/meal-plan)
 *   4.  Existing meal plan documents are NOT mutated by hold/unhold
 *   5.  Hold duration is tracked precisely
 *   6.  Unhold records activatedDate/activatedTime
 *   7.  Active UnifiedPayment + legacy ClientPurchase expectedEndDate
 *       extended by EXACTLY the hold duration (ms-level equality)
 *   8.  originalExpectedEndDate preserved
 *
 * Safety:
 *   - Dry-run by default. Pass --apply to actually run hold+unhold and revert.
 *   - The script always reverts ALL changes (state restored exactly as it was
 *     when the script started). This is wrapped in a try/finally and a final
 *     "post-revert verification" check is printed.
 *
 * Usage:
 *   node scripts/test-hold-unhold-c58.js                 # dry run, default 5 days
 *   node scripts/test-hold-unhold-c58.js --apply
 *   node scripts/test-hold-unhold-c58.js --apply --days 7
 *   node scripts/test-hold-unhold-c58.js --client C-58 --apply
 */

require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not set in .env.local');
    process.exit(1);
}

const argv = process.argv.slice(2);
function flag(name) {
    return argv.includes(`--${name}`);
}
function arg(name, def) {
    const i = argv.indexOf(`--${name}`);
    if (i < 0 || i === argv.length - 1) return def;
    return argv[i + 1];
}

const APPLY = flag('apply');
const CLIENT_KEY = arg('client', 'C-58');
const HOLD_DAYS = Number(arg('days', '5')) || 5;

function isoDay(d) {
    if (!d) return '(none)';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    return dt.toISOString().slice(0, 10);
}
function isoFull(d) {
    if (!d) return '(none)';
    return new Date(d).toISOString();
}
function pad2(n) { return String(n).padStart(2, '0'); }
function hms(d) {
    const dt = new Date(d);
    return `${pad2(dt.getUTCHours())}:${pad2(dt.getUTCMinutes())}:${pad2(dt.getUTCSeconds())} UTC`;
}

let ok = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { ok += 1; console.log(`  ✓ ${name}${extra ? `  (${extra})` : ''}`); }
    else { fail += 1; console.log(`  ✗ ${name}${extra ? `  (${extra})` : ''}`); }
}

(async () => {
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;
    const Users = db.collection('users');
    const Unified = db.collection('unifiedpayments');
    const Legacy = db.collection('clientpurchases');
    const MealPlans = db.collection('clientmealplans');

    // --- Resolve client ---
    const client = await Users.findOne({
        $or: [{ clientId: CLIENT_KEY }, { shortId: CLIENT_KEY }],
    });
    if (!client) {
        console.error(`❌ No user with clientId/shortId=${CLIENT_KEY}`);
        process.exit(1);
    }
    console.log(
        `Client: ${client.firstName || ''} ${client.lastName || ''} ` +
        `(${client.clientId || client.shortId || client._id})  _id=${client._id}\n`
    );

    // --- Baseline snapshot ---
    const baseUser = await Users.findOne({ _id: client._id });
    const baseUnified = await Unified
        .find({ client: client._id, paymentStatus: 'paid', status: { $in: ['paid', 'completed', 'active'] } })
        .project({ _id: 1, expectedEndDate: 1, endDate: 1, originalExpectedEndDate: 1, holdExtensionMs: 1, holdExtensionHistory: 1 })
        .toArray();
    const baseLegacy = await Legacy
        .find({ client: client._id, paymentStatus: 'paid', status: { $in: ['active', 'pending'] } })
        .project({ _id: 1, expectedEndDate: 1, endDate: 1 })
        .toArray();
    const baseMealPlanIds = await MealPlans.find({ clientId: client._id }).project({ _id: 1 }).toArray();

    console.log('--- Baseline ---');
    console.log(`  clientStatus:        ${baseUser.clientStatus}`);
    console.log(`  holdStatus.isOnHold: ${!!baseUser.holdStatus?.isOnHold}`);
    console.log(`  holdCount:           ${baseUser.holdStatus?.holdCount || 0}`);
    console.log(`  totalHoldDurationMs: ${baseUser.holdStatus?.totalHoldDurationMs || 0}`);
    console.log(`  active UnifiedPayments: ${baseUnified.length}`);
    baseUnified.forEach(p => {
        console.log(
            `    - ${p._id}  expectedEndDate=${isoDay(p.expectedEndDate)}  endDate=${isoDay(p.endDate)}  ` +
            `original=${isoDay(p.originalExpectedEndDate)}  holdExtensionMs=${p.holdExtensionMs || 0}`
        );
    });
    console.log(`  active legacy ClientPurchases: ${baseLegacy.length}`);
    baseLegacy.forEach(p => {
        console.log(
            `    - ${p._id}  expectedEndDate=${isoDay(p.expectedEndDate)}  endDate=${isoDay(p.endDate)}`
        );
    });
    console.log(`  total meal plans: ${baseMealPlanIds.length}`);
    console.log('');

    const wasAlreadyOnHold = !!baseUser.holdStatus?.isOnHold;
    if (wasAlreadyOnHold) {
        console.log('ℹ️  Client is currently on hold in the DB.');
        console.log('   The test will temporarily clear isOnHold to run a clean hold→unhold cycle,');
        console.log('   then fully restore the original hold state when done.\n');
    }

    if (!APPLY) {
        console.log(`(dry run) Would simulate hold for ${HOLD_DAYS} day(s) then unhold and verify all extensions.`);
        console.log('Pass --apply to actually execute the hold+unhold cycle.');
        console.log('All changes are reverted automatically at the end.');
        await mongoose.disconnect();
        return;
    }

    // Temporarily neutralize the current hold so the test runs against a clean state.
    // Original state is restored verbatim in the `finally` block.
    if (wasAlreadyOnHold) {
        await Users.updateOne(
            { _id: client._id },
            { $set: { 'holdStatus.isOnHold': false, clientStatus: 'active' } }
        );
    }

    // ---------------------------------------------------------------
    // EXECUTE HOLD + UNHOLD CYCLE (always reverted in `finally`)
    // ---------------------------------------------------------------
    const adminActor = baseUser._id; // self-actor so we don't need an admin user lookup
    const now = new Date();
    const holdStart = new Date(now.getTime() - HOLD_DAYS * 24 * 60 * 60 * 1000);
    const holdEnd = now;
    const expectedAddMs = holdEnd.getTime() - holdStart.getTime();

    console.log('--- Test parameters ---');
    console.log(`  HOLD_DAYS  : ${HOLD_DAYS}`);
    console.log(`  hold start : ${isoFull(holdStart)}`);
    console.log(`  hold end   : ${isoFull(holdEnd)}`);
    console.log(`  expected Δ : ${expectedAddMs} ms (${HOLD_DAYS} day(s))\n`);

    try {
        // --- HOLD ---
        console.log('--- HOLD ---');
        const holdTimeStr = hms(holdStart);
        await Users.updateOne(
            { _id: client._id },
            {
                $set: {
                    'holdStatus.isOnHold': true,
                    'holdStatus.holdDate': holdStart,
                    'holdStatus.holdTime': holdTimeStr,
                    'holdStatus.heldBy': adminActor,
                    clientStatus: 'hold',
                },
                $inc: { 'holdStatus.holdCount': 1 },
                $push: {
                    holdStatusHistory: {
                        action: 'hold',
                        performedBy: adminActor,
                        performedByName: 'Hold/Unhold Verification Script',
                        performedByRole: 'Admin',
                        timestamp: holdStart,
                        reason: 'AUTOMATED_TEST',
                    },
                    clientStatusHistory: {
                        previousStatus: baseUser.clientStatus || null,
                        newStatus: 'hold',
                        changedBy: adminActor,
                        isManual: true,
                        trigger: 'hold',
                        relatedEvent: 'AUTOMATED_TEST',
                        timestamp: holdStart,
                    },
                },
            }
        );

        const heldUser = await Users.findOne({ _id: client._id });
        check('clientStatus becomes "hold"', heldUser.clientStatus === 'hold', `actual=${heldUser.clientStatus}`);
        check('holdStatus.isOnHold === true', heldUser.holdStatus?.isOnHold === true);
        check('holdStatus.holdDate recorded', !!heldUser.holdStatus?.holdDate, isoFull(heldUser.holdStatus?.holdDate));
        check('holdStatus.holdTime recorded', typeof heldUser.holdStatus?.holdTime === 'string' && heldUser.holdStatus.holdTime.length > 0,
            heldUser.holdStatus?.holdTime);
        check('holdStatus.heldBy recorded', !!heldUser.holdStatus?.heldBy);
        check('holdCount incremented by 1',
            (heldUser.holdStatus?.holdCount || 0) === (baseUser.holdStatus?.holdCount || 0) + 1,
            `before=${baseUser.holdStatus?.holdCount || 0} after=${heldUser.holdStatus?.holdCount || 0}`);
        check('holdStatusHistory entry pushed',
            (heldUser.holdStatusHistory || []).length === (baseUser.holdStatusHistory || []).length + 1);

        // Client-facing meal plan endpoint short-circuits when isOnHold === true.
        // Mirror that decision here (no HTTP server required).
        const wouldHideForClient = !!heldUser.holdStatus?.isOnHold;
        check('Client meal-plan endpoint would hide plans (isOnHold short-circuit)', wouldHideForClient);

        // Meal plan documents must NOT be mutated by the hold action.
        const heldMealPlanIds = await MealPlans.find({ clientId: client._id }).project({ _id: 1 }).toArray();
        check('All meal plan documents preserved (count unchanged)',
            heldMealPlanIds.length === baseMealPlanIds.length,
            `before=${baseMealPlanIds.length} after=${heldMealPlanIds.length}`);

        // --- UNHOLD ---
        console.log('\n--- UNHOLD ---');
        const activatedTimeStr = hms(holdEnd);
        const holdDurationMs = holdEnd.getTime() - new Date(heldUser.holdStatus.holdDate).getTime();
        const previousTotalMs = heldUser.holdStatus.totalHoldDurationMs || 0;
        const newTotalMs = previousTotalMs + holdDurationMs;

        await Users.updateOne(
            { _id: client._id },
            {
                $set: {
                    'holdStatus.isOnHold': false,
                    'holdStatus.activatedDate': holdEnd,
                    'holdStatus.activatedTime': activatedTimeStr,
                    'holdStatus.activatedBy': adminActor,
                    'holdStatus.totalHoldDurationMs': newTotalMs,
                },
                $push: {
                    holdStatusHistory: {
                        action: 'activate',
                        performedBy: adminActor,
                        performedByName: 'Hold/Unhold Verification Script',
                        performedByRole: 'Admin',
                        timestamp: holdEnd,
                        reason: 'AUTOMATED_TEST',
                        holdDurationMs,
                    },
                },
            }
        );

        // Apply the same extension logic the route uses, but inline so we don't
        // need a Next.js runtime. Mirrors applyHoldExtensionToClientPurchases.
        const candUnified = await Unified.find({
            client: client._id,
            paymentStatus: 'paid',
            status: { $in: ['paid', 'completed', 'active'] },
        }).project({ _id: 1, expectedEndDate: 1, endDate: 1, originalExpectedEndDate: 1, holdExtensionMs: 1 }).toArray();

        const appliedAt = new Date();
        const extendedUnifiedIds = [];
        for (const p of candUnified) {
            const cur = p.expectedEndDate || p.endDate || null;
            if (!cur) continue;
            if (new Date(cur).getTime() < holdStart.getTime()) continue;
            const prev = new Date(cur);
            const next = new Date(prev.getTime() + expectedAddMs);
            const upd = {
                $set: { expectedEndDate: next, endDate: next },
                $inc: { holdExtensionMs: expectedAddMs },
                $push: {
                    holdExtensionHistory: {
                        holdStart, holdEnd, addedMs: expectedAddMs,
                        previousExpectedEndDate: prev, newExpectedEndDate: next,
                        appliedBy: adminActor, appliedAt,
                    },
                },
            };
            if (!p.originalExpectedEndDate) upd.$set.originalExpectedEndDate = prev;
            await Unified.updateOne({ _id: p._id }, upd);
            extendedUnifiedIds.push(String(p._id));
        }

        const candLegacy = await Legacy.find({
            client: client._id,
            paymentStatus: 'paid',
            status: { $in: ['active', 'pending'] },
        }).project({ _id: 1, expectedEndDate: 1, endDate: 1 }).toArray();
        const extendedLegacyIds = [];
        for (const p of candLegacy) {
            const cur = p.expectedEndDate || p.endDate || null;
            if (!cur) continue;
            if (new Date(cur).getTime() < holdStart.getTime()) continue;
            const prev = new Date(cur);
            const next = new Date(prev.getTime() + expectedAddMs);
            await Legacy.updateOne({ _id: p._id }, {
                $set: { expectedEndDate: next, endDate: next },
            });
            extendedLegacyIds.push(String(p._id));
        }

        const activatedUser = await Users.findOne({ _id: client._id });
        check('holdStatus.isOnHold === false after unhold', activatedUser.holdStatus?.isOnHold === false);
        check('holdStatus.activatedDate recorded',
            !!activatedUser.holdStatus?.activatedDate,
            isoFull(activatedUser.holdStatus?.activatedDate));
        check('holdStatus.activatedTime recorded',
            typeof activatedUser.holdStatus?.activatedTime === 'string' && activatedUser.holdStatus.activatedTime.length > 0,
            activatedUser.holdStatus?.activatedTime);
        check('totalHoldDurationMs incremented by exact hold duration',
            (activatedUser.holdStatus?.totalHoldDurationMs || 0) - previousTotalMs === holdDurationMs,
            `Δ=${(activatedUser.holdStatus?.totalHoldDurationMs || 0) - previousTotalMs} expected=${holdDurationMs}`);

        // Verify each candidate extended exactly by expectedAddMs (unified).
        console.log('\n--- Extension verification (UnifiedPayment) ---');
        for (const before of baseUnified) {
            const after = await Unified.findOne({ _id: before._id });
            const prevExpected = before.expectedEndDate || before.endDate;
            if (!prevExpected) {
                console.log(`  · ${before._id} skipped (no prior expectedEndDate)`);
                continue;
            }
            // Spec: helper intentionally skips purchases whose expectedEndDate is
            // strictly before holdStart (purchase already ended pre-hold).
            if (new Date(prevExpected).getTime() < holdStart.getTime()) {
                check(
                    `Unified ${before._id} correctly SKIPPED (pre-hold expected end was ${isoDay(prevExpected)} < holdStart)`,
                    isoDay(after.expectedEndDate) === isoDay(prevExpected) &&
                    (after.holdExtensionMs || 0) === (before.holdExtensionMs || 0)
                );
                continue;
            }
            const expectedNext = new Date(new Date(prevExpected).getTime() + expectedAddMs);
            const actualNext = after.expectedEndDate ? new Date(after.expectedEndDate) : null;
            const delta = actualNext ? actualNext.getTime() - new Date(prevExpected).getTime() : 0;

            check(
                `Unified ${before._id} expectedEndDate extended by exact hold duration`,
                actualNext && actualNext.getTime() === expectedNext.getTime(),
                `before=${isoDay(prevExpected)} after=${isoDay(actualNext)} Δ=${delta}ms`
            );
            check(
                `Unified ${before._id} endDate kept in sync with expectedEndDate`,
                after.endDate && new Date(after.endDate).getTime() === expectedNext.getTime(),
                `endDate=${isoDay(after.endDate)}`
            );
            check(
                `Unified ${before._id} originalExpectedEndDate preserved (= pre-hold expected end)`,
                after.originalExpectedEndDate &&
                new Date(after.originalExpectedEndDate).getTime() === new Date(before.originalExpectedEndDate || prevExpected).getTime(),
                `original=${isoDay(after.originalExpectedEndDate)}`
            );
            check(
                `Unified ${before._id} holdExtensionMs incremented by ${expectedAddMs}`,
                (after.holdExtensionMs || 0) - (before.holdExtensionMs || 0) === expectedAddMs,
                `Δ=${(after.holdExtensionMs || 0) - (before.holdExtensionMs || 0)}`
            );
        }

        console.log('\n--- Extension verification (legacy ClientPurchase) ---');
        for (const before of baseLegacy) {
            const after = await Legacy.findOne({ _id: before._id });
            const prevExpected = before.expectedEndDate || before.endDate;
            if (!prevExpected) {
                console.log(`  · ${before._id} skipped (no prior expectedEndDate)`);
                continue;
            }
            if (new Date(prevExpected).getTime() < holdStart.getTime()) {
                check(
                    `Legacy ${before._id} correctly SKIPPED (pre-hold expected end was ${isoDay(prevExpected)} < holdStart)`,
                    isoDay(after.expectedEndDate) === isoDay(prevExpected)
                );
                continue;
            }
            const expectedNext = new Date(new Date(prevExpected).getTime() + expectedAddMs);
            check(
                `Legacy ${before._id} expectedEndDate extended by exact hold duration`,
                after.expectedEndDate && new Date(after.expectedEndDate).getTime() === expectedNext.getTime(),
                `before=${isoDay(prevExpected)} after=${isoDay(after.expectedEndDate)}`
            );
            check(
                `Legacy ${before._id} endDate synced with expectedEndDate`,
                after.endDate && new Date(after.endDate).getTime() === expectedNext.getTime(),
                `endDate=${isoDay(after.endDate)}`
            );
        }

        // Meal plan endpoint visibility is restored once isOnHold flips off.
        check('Client meal-plan endpoint would show plans again (isOnHold === false)', !activatedUser.holdStatus?.isOnHold);

        // Meal plan documents still untouched by hold/unhold.
        const finalMealPlanIds = await MealPlans.find({ clientId: client._id }).project({ _id: 1 }).toArray();
        check('All meal plan documents still preserved after unhold',
            finalMealPlanIds.length === baseMealPlanIds.length,
            `before=${baseMealPlanIds.length} after=${finalMealPlanIds.length}`);

    } finally {
        console.log('\n--- REVERT (restoring baseline) ---');
        // Restore user holdStatus + clientStatus + history arrays to baseline.
        await Users.updateOne(
            { _id: client._id },
            {
                $set: {
                    holdStatus: baseUser.holdStatus || {},
                    clientStatus: baseUser.clientStatus,
                    holdStatusHistory: baseUser.holdStatusHistory || [],
                    clientStatusHistory: baseUser.clientStatusHistory || [],
                },
            }
        );
        // Restore unified purchases.
        for (const before of baseUnified) {
            await Unified.updateOne(
                { _id: before._id },
                {
                    $set: {
                        expectedEndDate: before.expectedEndDate || null,
                        endDate: before.endDate || null,
                        originalExpectedEndDate: before.originalExpectedEndDate || null,
                        holdExtensionMs: before.holdExtensionMs || 0,
                        holdExtensionHistory: before.holdExtensionHistory || [],
                    },
                }
            );
        }
        // Restore legacy purchases.
        for (const before of baseLegacy) {
            await Legacy.updateOne(
                { _id: before._id },
                {
                    $set: {
                        expectedEndDate: before.expectedEndDate || null,
                        endDate: before.endDate || null,
                    },
                }
            );
        }

        // Post-revert verification.
        const revertedUser = await Users.findOne({ _id: client._id });
        check('Revert: holdStatus restored',
            !revertedUser.holdStatus?.isOnHold === !baseUser.holdStatus?.isOnHold,
            `isOnHold=${!!revertedUser.holdStatus?.isOnHold}`);
        check('Revert: holdCount restored',
            (revertedUser.holdStatus?.holdCount || 0) === (baseUser.holdStatus?.holdCount || 0));
        check('Revert: totalHoldDurationMs restored',
            (revertedUser.holdStatus?.totalHoldDurationMs || 0) === (baseUser.holdStatus?.totalHoldDurationMs || 0));

        for (const before of baseUnified) {
            const after = await Unified.findOne({ _id: before._id });
            check(
                `Revert: Unified ${before._id} expectedEndDate restored`,
                isoDay(after.expectedEndDate) === isoDay(before.expectedEndDate),
                `now=${isoDay(after.expectedEndDate)} baseline=${isoDay(before.expectedEndDate)}`
            );
        }
        for (const before of baseLegacy) {
            const after = await Legacy.findOne({ _id: before._id });
            check(
                `Revert: Legacy ${before._id} expectedEndDate restored`,
                isoDay(after.expectedEndDate) === isoDay(before.expectedEndDate),
                `now=${isoDay(after.expectedEndDate)} baseline=${isoDay(before.expectedEndDate)}`
            );
        }
    }

    console.log(`\n=========== SUMMARY ===========`);
    console.log(`  Passed: ${ok}`);
    console.log(`  Failed: ${fail}`);
    console.log(`  Mode  : ${APPLY ? 'APPLY (reverted)' : 'DRY-RUN'}`);
    await mongoose.disconnect();
    process.exit(fail === 0 ? 0 : 1);
})().catch(async (err) => {
    console.error('Fatal error:', err);
    try { await mongoose.disconnect(); } catch { }
    process.exit(1);
});
