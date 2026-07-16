#!/usr/bin/env node
/**
 * Detect and (optionally) fix client meal plans where plan.startDate
 * does NOT match meals[0].date. This drift happens when phase startDate
 * was set manually but meals were generated/edited starting on a different
 * day, or when cascade shifts touched meals but not the plan startDate.
 *
 * Usage:
 *   node scripts/fix-mealplan-startdate-drift.js                 # dry run, all plans
 *   node scripts/fix-mealplan-startdate-drift.js --apply         # apply fixes to all
 *   node scripts/fix-mealplan-startdate-drift.js --client C-22   # scope to one client
 *   node scripts/fix-mealplan-startdate-drift.js --client C-22 --apply
 *
 * The fix rule:
 *   - If meals are sorted ascending by date and meals[0].date < plan.startDate
 *     OR meals[0].date > plan.startDate, set plan.startDate = meals[0].date.
 *   - Only updates when the difference is < 60 days (sanity guard).
 *   - Does NOT touch endDate, duration, meals[].date, or freezedDays[].
 */

require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not set in .env.local');
    process.exit(1);
}

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const clientFlagIdx = argv.indexOf('--client');
const CLIENT_ID = clientFlagIdx >= 0 ? argv[clientFlagIdx + 1] : null;

function isoDay(d) {
    if (!d) return null;
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
    const ms = new Date(a).getTime() - new Date(b).getTime();
    return Math.round(ms / (24 * 60 * 60 * 1000));
}

(async () => {
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;

    let userFilter = {};
    if (CLIENT_ID) {
        const user = await db.collection('users').findOne({
            $or: [{ clientId: CLIENT_ID }, { shortId: CLIENT_ID }],
        });
        if (!user) {
            console.error(`❌ No user with clientId/shortId=${CLIENT_ID}`);
            process.exit(1);
        }
        userFilter = { clientId: user._id };
        console.log(`Scope: ${user.name} (${user.clientId || user.shortId || user._id})`);
    }

    const plans = await db.collection('clientmealplans').find(userFilter).toArray();
    console.log(`Scanning ${plans.length} meal plan(s)...`);

    let driftedCount = 0;
    let fixedCount = 0;

    for (const plan of plans) {
        const meals = Array.isArray(plan.meals) ? plan.meals : [];
        if (meals.length === 0) continue;

        // Find earliest meal date
        const sortedMeals = [...meals]
            .filter(m => m?.date)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        if (sortedMeals.length === 0) continue;

        const firstMealDate = sortedMeals[0].date;
        const firstMealKey = isoDay(firstMealDate);
        const planStartKey = isoDay(plan.startDate);

        if (!firstMealKey || !planStartKey || firstMealKey === planStartKey) continue;

        const delta = Math.abs(daysBetween(firstMealDate, plan.startDate));
        driftedCount += 1;

        console.log(
            `\nDrift: plan="${plan.name}" _id=${plan._id} ` +
            `startDate=${planStartKey} meals[0]=${firstMealKey} delta=${delta}d`
        );

        if (delta >= 60) {
            console.log('  ⚠️ delta too large, skipping (would need manual review)');
            continue;
        }

        if (APPLY) {
            await db.collection('clientmealplans').updateOne(
                { _id: plan._id },
                { $set: { startDate: new Date(firstMealDate) } }
            );
            fixedCount += 1;
            console.log(`  ✓ updated startDate -> ${firstMealKey}`);
        } else {
            console.log('  (dry run — pass --apply to update)');
        }
    }

    console.log(
        `\nDone. drifted=${driftedCount} fixed=${fixedCount} mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`
    );
    await mongoose.disconnect();
})().catch(err => {
    console.error(err);
    process.exit(1);
});
