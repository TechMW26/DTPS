#!/usr/bin/env node
/**
 * Inspect a client's meal plan in detail to diagnose freeze/recovery alignment.
 *
 * Usage: node scripts/inspect-meal-plan.js <clientShortId> [planNameSubstring]
 * Example: node scripts/inspect-meal-plan.js C-22 ghn
 */

require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not set in .env.local');
    process.exit(1);
}

const clientShortId = process.argv[2];
const planNeedle = (process.argv[3] || '').toLowerCase();
if (!clientShortId) {
    console.error('Usage: node scripts/inspect-meal-plan.js <clientShortId> [planNameSubstring]');
    process.exit(1);
}

function fmtDate(d) {
    if (!d) return '(none)';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    return dt.toISOString().slice(0, 10);
}

(async () => {
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;

    const user = await db.collection('users').findOne({
        $or: [{ clientId: clientShortId }, { shortId: clientShortId }],
    });
    if (!user) {
        console.error(`❌ No user with clientId/shortId=${clientShortId}`);
        process.exit(1);
    }
    console.log(`User: ${user.name} (${user._id})  clientId=${user.clientId || ''} shortId=${user.shortId || ''}`);

    let plans = await db.collection('clientmealplans')
        .find({ clientId: user._id })
        .sort({ startDate: 1 })
        .toArray();

    if (planNeedle) {
        plans = plans.filter(p => String(p.name || '').toLowerCase().includes(planNeedle));
    }

    if (plans.length === 0) {
        console.error('No meal plans found.');
        process.exit(0);
    }

    for (const plan of plans) {
        const meals = Array.isArray(plan.meals) ? plan.meals : [];
        const freezedDays = Array.isArray(plan.freezedDays) ? plan.freezedDays : [];

        const baseDate = plan.startDate ? new Date(plan.startDate) : null;

        console.log('\n========================================');
        console.log(`Plan: ${plan.name}  _id=${plan._id}`);
        console.log(`  startDate     : ${fmtDate(plan.startDate)}`);
        console.log(`  endDate       : ${fmtDate(plan.endDate)}`);
        console.log(`  duration      : ${plan.duration}`);
        console.log(`  meals.length  : ${meals.length}`);
        console.log(`  totalFreezeCount: ${plan.totalFreezeCount || 0}`);
        console.log(`  status        : ${plan.status}  isPublished=${plan.isPublished}`);
        console.log(`  purchaseId    : ${plan.purchaseId || '(none)'}`);
        console.log(`  isActive      : ${plan.isActive}`);

        console.log('\n  freezedDays[]:');
        if (freezedDays.length === 0) {
            console.log('    (none)');
        } else {
            freezedDays.forEach((fd, i) => {
                console.log(`    [${i}] date=${fmtDate(fd.date)}  addedDate=${fmtDate(fd.addedDate)}  by=${fd.frozenBy || '-'}  reason="${fd.reason || ''}"`);
            });
        }

        console.log('\n  meals[] (sorted by stored order):');
        console.log('  idx | meal.date  | expected   | match | isFrozen | isFreezeRecovery | day label');
        console.log('  ----+------------+------------+-------+----------+------------------+-----------------------------');
        meals.forEach((m, i) => {
            const mealDate = m?.date ? fmtDate(m.date) : '(none)';
            let expected = '-';
            let match = '-';
            if (baseDate) {
                const exp = new Date(baseDate);
                exp.setDate(exp.getDate() + i);
                expected = fmtDate(exp);
                match = expected === mealDate ? 'OK' : 'OFF';
            }
            console.log(
                `   ${String(i).padStart(2)} | ${mealDate} | ${expected} | ${match.padStart(5)} | ${String(!!m.isFrozen).padStart(8)} | ${String(!!m.isFreezeRecovery).padStart(16)} | ${m.day || ''}`
            );
        });

        // Sanity: does freezedDays.date match what is marked isFrozen?
        const frozenByDate = new Set(freezedDays.map(fd => fmtDate(fd.date)));
        const mealsFlaggedFrozen = meals.filter(m => m.isFrozen).map(m => fmtDate(m.date));
        const missingFlag = [...frozenByDate].filter(d => !mealsFlaggedFrozen.includes(d));
        const extraFlag = mealsFlaggedFrozen.filter(d => !frozenByDate.has(d));

        console.log('\n  freeze-flag alignment:');
        console.log(`    freezedDays[].date set : ${[...frozenByDate].join(', ') || '(empty)'}`);
        console.log(`    meals with isFrozen=true : ${mealsFlaggedFrozen.join(', ') || '(empty)'}`);
        if (missingFlag.length) console.log(`    ⚠️  frozen dates with NO isFrozen meal: ${missingFlag.join(', ')}`);
        if (extraFlag.length) console.log(`    ⚠️  meals isFrozen but NOT in freezedDays: ${extraFlag.join(', ')}`);
        if (!missingFlag.length && !extraFlag.length) console.log('    ✓ all aligned');

        // Recovery alignment
        const recoveryByAdded = new Set(freezedDays.map(fd => fmtDate(fd.addedDate)).filter(Boolean));
        const mealsFlaggedRecovery = meals.filter(m => m.isFreezeRecovery).map(m => fmtDate(m.date));
        const missingRec = [...recoveryByAdded].filter(d => !mealsFlaggedRecovery.includes(d));
        const extraRec = mealsFlaggedRecovery.filter(d => !recoveryByAdded.has(d));
        console.log(`    addedDate set            : ${[...recoveryByAdded].join(', ') || '(empty)'}`);
        console.log(`    meals with isFreezeRecovery : ${mealsFlaggedRecovery.join(', ') || '(empty)'}`);
        if (missingRec.length) console.log(`    ⚠️  recovery dates with NO isFreezeRecovery meal: ${missingRec.join(', ')}`);
        if (extraRec.length) console.log(`    ⚠️  meals isFreezeRecovery but NOT in addedDate: ${extraRec.join(', ')}`);
    }

    await mongoose.disconnect();
})().catch(err => {
    console.error(err);
    process.exit(1);
});
