/**
 * One-time phase normalization for a specific client.
 *
 * Usage:
 *   node scripts/fix-client-phase-sequence.js --clientId C-3 --apply
 *   node scripts/fix-client-phase-sequence.js --clientId C-3
 *
 * Without --apply, this runs in dry mode and only prints planned updates.
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

const args = process.argv.slice(2);
const applyMode = args.includes('--apply');

const getArgValue = (flag) => {
    const index = args.indexOf(flag);
    if (index === -1) return null;
    return args[index + 1] || null;
};

const clientIdCode = getArgValue('--clientId');

if (!clientIdCode) {
    console.error('Missing required argument: --clientId <value>');
    process.exit(1);
}

const PLAN_COLLECTION = 'clientmealplans';
const USER_COLLECTION = 'users';

async function run() {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        throw new Error('MONGODB_URI is not set in environment');
    }

    await mongoose.connect(mongoUri);

    const users = mongoose.connection.collection(USER_COLLECTION);
    const plans = mongoose.connection.collection(PLAN_COLLECTION);

    const client = await users.findOne({
        role: 'client',
        clientId: clientIdCode,
    }, {
        projection: { _id: 1, firstName: 1, lastName: 1, clientId: 1, email: 1 }
    });

    if (!client) {
        throw new Error(`No client found for clientId ${clientIdCode}`);
    }

    const clientDbId = client._id;

    const publishedStatuses = ['active', 'completed', 'paused', 'cancelled'];

    const clientPlans = await plans.find({
        clientId: clientDbId,
        status: { $in: publishedStatuses },
    }).sort({ startDate: 1, createdAt: 1, _id: 1 }).toArray();

    console.log('Client:', `${client.firstName || ''} ${client.lastName || ''}`.trim(), `(${client.clientId})`);
    console.log('Client _id:', String(clientDbId));
    console.log('Published plans found:', clientPlans.length);
    console.log('Mode:', applyMode ? 'APPLY' : 'DRY-RUN');

    if (clientPlans.length === 0) {
        console.log('No published plans to normalize.');
        return;
    }

    const operations = [];
    const plansByPurchase = new Map();

    clientPlans.forEach((plan) => {
        const purchaseKey = plan.purchaseId ? String(plan.purchaseId) : 'no-payment';
        if (!plansByPurchase.has(purchaseKey)) {
            plansByPurchase.set(purchaseKey, []);
        }
        plansByPurchase.get(purchaseKey).push(plan);
    });

    for (const [purchaseKey, groupedPlans] of plansByPurchase.entries()) {
        groupedPlans.forEach((plan, index) => {
            const nextPhaseNumber = index + 1;
            const nextPhaseTag = `PHASE-${nextPhaseNumber}`;
            const previousPlan = index > 0 ? groupedPlans[index - 1] : null;
            const nextPreviousPhaseId = previousPlan ? previousPlan._id : null;

            const phaseChanged = plan.phaseNumber !== nextPhaseNumber || plan.phaseTag !== nextPhaseTag;
            const previousLinkChanged = String(plan.previousPhaseId || '') !== String(nextPreviousPhaseId || '');

            if (phaseChanged || previousLinkChanged) {
                operations.push({
                    updateOne: {
                        filter: { _id: plan._id },
                        update: {
                            $set: {
                                phaseNumber: nextPhaseNumber,
                                phaseTag: nextPhaseTag,
                                ...(nextPreviousPhaseId ? { previousPhaseId: nextPreviousPhaseId } : {})
                            },
                            ...(nextPreviousPhaseId ? {} : { $unset: { previousPhaseId: '' } })
                        }
                    }
                });
            }

            console.log(
                `- ${String(plan._id)} | ${plan.name || 'Untitled'} | purchase=${purchaseKey} | status=${plan.status} | ` +
                `old=${plan.phaseTag || 'NONE'} (${plan.phaseNumber || 'NONE'}) -> new=${nextPhaseTag} (${nextPhaseNumber})`
            );
        });
    }

    if (operations.length === 0) {
        console.log('No updates needed. Phase sequence already normalized.');
        return;
    }

    console.log('Planned updates:', operations.length);

    if (!applyMode) {
        console.log('Dry-run only. Re-run with --apply to persist changes.');
        return;
    }

    const result = await plans.bulkWrite(operations, { ordered: true });
    console.log('Applied changes. Modified count:', result.modifiedCount || 0);

    const verifiedPlans = await plans.find({
        clientId: clientDbId,
        status: { $in: publishedStatuses }
    }).sort({ startDate: 1, createdAt: 1, _id: 1 }).project({
        name: 1,
        status: 1,
        phaseNumber: 1,
        phaseTag: 1,
        previousPhaseId: 1
    }).toArray();

    console.log('Verification snapshot:');
    verifiedPlans.forEach((plan) => {
        console.log(
            `  ${String(plan._id)} | ${plan.name || 'Untitled'} | ${plan.status} | ${plan.phaseTag || 'NONE'} (${plan.phaseNumber || 'NONE'}) | prev=${plan.previousPhaseId || 'NONE'}`
        );
    });
}

run()
    .catch((error) => {
        console.error('Phase normalization failed:', error.message || error);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await mongoose.disconnect();
        } catch (_) {
            // no-op
        }
    });
