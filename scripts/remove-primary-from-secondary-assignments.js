/* eslint-disable no-console */
require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not found in .env.local');
    process.exit(1);
}

async function run() {
    try {
        console.log('🔗 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected');

        const users = mongoose.connection.db.collection('users');

        const clients = await users.find(
            { role: 'client' },
            {
                projection: {
                    _id: 1,
                    clientId: 1,
                    firstName: 1,
                    lastName: 1,
                    assignedDietitian: 1,
                    assignedDietitians: 1,
                    assignedHealthCounselor: 1,
                    assignedHealthCounselors: 1,
                },
            }
        ).toArray();

        console.log(`👥 Total clients scanned: ${clients.length}`);

        const bulkOps = [];
        let dietitianOverlapCount = 0;
        let counselorOverlapCount = 0;
        let dietitianDedupCount = 0;
        let counselorDedupCount = 0;

        const sample = [];

        for (const c of clients) {
            const updates = {};

            // ---------- Dietitian cleanup ----------
            const primaryDietitianId = c.assignedDietitian ? String(c.assignedDietitian) : null;
            const currentSecondaryDietitians = Array.isArray(c.assignedDietitians)
                ? c.assignedDietitians.map((id) => String(id))
                : [];

            const secondaryDietitiansWithoutPrimary = primaryDietitianId
                ? currentSecondaryDietitians.filter((id) => id !== primaryDietitianId)
                : currentSecondaryDietitians;

            const uniqueSecondaryDietitians = [...new Set(secondaryDietitiansWithoutPrimary)];

            const dietitianChanged =
                JSON.stringify(currentSecondaryDietitians) !== JSON.stringify(uniqueSecondaryDietitians);

            if (dietitianChanged) {
                if (primaryDietitianId && currentSecondaryDietitians.includes(primaryDietitianId)) {
                    dietitianOverlapCount += 1;
                }
                if (secondaryDietitiansWithoutPrimary.length !== uniqueSecondaryDietitians.length) {
                    dietitianDedupCount += 1;
                }

                updates.assignedDietitians = uniqueSecondaryDietitians.map((id) => new mongoose.Types.ObjectId(id));
            }

            // ---------- Health counselor cleanup ----------
            const primaryCounselorId = c.assignedHealthCounselor ? String(c.assignedHealthCounselor) : null;
            const currentSecondaryCounselors = Array.isArray(c.assignedHealthCounselors)
                ? c.assignedHealthCounselors.map((id) => String(id))
                : [];

            const secondaryCounselorsWithoutPrimary = primaryCounselorId
                ? currentSecondaryCounselors.filter((id) => id !== primaryCounselorId)
                : currentSecondaryCounselors;

            const uniqueSecondaryCounselors = [...new Set(secondaryCounselorsWithoutPrimary)];

            const counselorChanged =
                JSON.stringify(currentSecondaryCounselors) !== JSON.stringify(uniqueSecondaryCounselors);

            if (counselorChanged) {
                if (primaryCounselorId && currentSecondaryCounselors.includes(primaryCounselorId)) {
                    counselorOverlapCount += 1;
                }
                if (secondaryCounselorsWithoutPrimary.length !== uniqueSecondaryCounselors.length) {
                    counselorDedupCount += 1;
                }

                updates.assignedHealthCounselors = uniqueSecondaryCounselors.map((id) => new mongoose.Types.ObjectId(id));
            }

            if (Object.keys(updates).length > 0) {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: c._id },
                        update: { $set: updates },
                    },
                });

                if (sample.length < 20) {
                    sample.push({
                        clientId: c.clientId || String(c._id),
                        name: `${c.firstName || ''} ${c.lastName || ''}`.trim(),
                        fixedDietitian: !!updates.assignedDietitians,
                        fixedCounselor: !!updates.assignedHealthCounselors,
                    });
                }
            }
        }

        let modifiedCount = 0;
        if (bulkOps.length > 0) {
            console.log(`🛠️ Applying updates for ${bulkOps.length} client(s)...`);
            const result = await users.bulkWrite(bulkOps);
            modifiedCount = result.modifiedCount || 0;
        }

        // Verification pass
        const verifyOverlapDietitian = await users.countDocuments({
            role: 'client',
            assignedDietitian: { $ne: null },
            $expr: {
                $in: [
                    { $toString: '$assignedDietitian' },
                    {
                        $map: {
                            input: { $ifNull: ['$assignedDietitians', []] },
                            as: 'd',
                            in: { $toString: '$$d' },
                        },
                    },
                ],
            },
        });

        const verifyOverlapCounselor = await users.countDocuments({
            role: 'client',
            assignedHealthCounselor: { $ne: null },
            $expr: {
                $in: [
                    { $toString: '$assignedHealthCounselor' },
                    {
                        $map: {
                            input: { $ifNull: ['$assignedHealthCounselors', []] },
                            as: 'h',
                            in: { $toString: '$$h' },
                        },
                    },
                ],
            },
        });

        console.log('\n📊 SUMMARY');
        console.log('------------------------------');
        console.log(`Clients scanned: ${clients.length}`);
        console.log(`Clients updated: ${modifiedCount}`);
        console.log(`Primary dietitian removed from secondary list: ${dietitianOverlapCount}`);
        console.log(`Secondary dietitian de-dup cleaned: ${dietitianDedupCount}`);
        console.log(`Primary health counselor removed from secondary list: ${counselorOverlapCount}`);
        console.log(`Secondary health counselor de-dup cleaned: ${counselorDedupCount}`);
        console.log(`Remaining dietitian overlaps: ${verifyOverlapDietitian}`);
        console.log(`Remaining health counselor overlaps: ${verifyOverlapCounselor}`);

        if (sample.length > 0) {
            console.log('\n🧾 Sample updated clients:');
            for (const row of sample) {
                console.log(`- ${row.clientId} | ${row.name} | dietitianFixed=${row.fixedDietitian} | counselorFixed=${row.fixedCounselor}`);
            }
        }

        if (verifyOverlapDietitian === 0 && verifyOverlapCounselor === 0) {
            console.log('\n✅ Done. Primary users are no longer present in secondary arrays.');
        } else {
            console.log('\n⚠️ Completed with remaining overlaps. Please review edge cases manually.');
        }
    } catch (error) {
        console.error('❌ Script failed:', error);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected');
    }
}

run();
