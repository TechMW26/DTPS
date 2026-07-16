/* eslint-disable no-console */
require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        days: 30,
        minMessages: 1,
    };

    for (const arg of args) {
        if (arg.startsWith('--days=')) {
            const value = Number(arg.split('=')[1]);
            if (!Number.isNaN(value) && value >= 0) options.days = value;
        } else if (arg.startsWith('--minMessages=')) {
            const value = Number(arg.split('=')[1]);
            if (!Number.isNaN(value) && value >= 1) options.minMessages = value;
        }
    }

    return options;
}

function safeName(user) {
    const full = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
    return full || '-';
}

function toValidObjectId(id) {
    if (!id) return null;
    const str = String(id);
    if (!mongoose.isValidObjectId(str)) return null;
    return new mongoose.Types.ObjectId(str);
}

function toCsv(rows) {
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(',')];

    for (const row of rows) {
        const values = headers.map((header) => {
            const value = row[header];
            if (value === null || value === undefined) return '';
            const str = String(value).replace(/"/g, '""');
            return /[",\n]/.test(str) ? `"${str}"` : str;
        });
        lines.push(values.join(','));
    }

    return lines.join('\n');
}

async function main() {
    const { days, minMessages } = parseArgs();

    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is missing. Add it to .env.local');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    const users = db.collection('users');
    const messages = db.collection('messages');

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    // 1) All client users that have a PRIMARY dietitian assigned
    const clients = await users.find(
        {
            role: 'client',
            assignedDietitian: { $exists: true, $ne: null },
        },
        {
            projection: {
                _id: 1,
                clientId: 1,
                dtps_id: 1,
                firstName: 1,
                lastName: 1,
                phone: 1,
                email: 1,
                assignedDietitian: 1,
                assignedDietitians: 1,
            },
        }
    ).toArray();

    if (!clients.length) {
        console.log('No clients found with a primary dietitian assignment.');
        return;
    }

    const clientIds = clients.map((c) => c._id);
    const uniqueDietitianIds = new Set();

    for (const client of clients) {
        if (client.assignedDietitian) uniqueDietitianIds.add(String(client.assignedDietitian));
        if (Array.isArray(client.assignedDietitians)) {
            for (const id of client.assignedDietitians) uniqueDietitianIds.add(String(id));
        }
    }

    const dietitianObjectIds = Array.from(uniqueDietitianIds)
        .map((id) => toValidObjectId(id))
        .filter(Boolean);

    // 2) Active messages between clients and dietitians in window
    const interactions = await messages.aggregate([
        {
            $match: {
                createdAt: { $gte: sinceDate },
                $or: [
                    { sender: { $in: clientIds }, receiver: { $in: dietitianObjectIds } },
                    { receiver: { $in: clientIds }, sender: { $in: dietitianObjectIds } },
                ],
            },
        },
        {
            $project: {
                createdAt: 1,
                clientId: {
                    $cond: [{ $in: ['$sender', clientIds] }, '$sender', '$receiver'],
                },
                dietitianId: {
                    $cond: [{ $in: ['$sender', clientIds] }, '$receiver', '$sender'],
                },
                fromClient: { $in: ['$sender', clientIds] },
            },
        },
        {
            $group: {
                _id: { clientId: '$clientId', dietitianId: '$dietitianId' },
                totalMessages: { $sum: 1 },
                clientToDietitianMessages: {
                    $sum: { $cond: ['$fromClient', 1, 0] },
                },
                dietitianToClientMessages: {
                    $sum: { $cond: ['$fromClient', 0, 1] },
                },
                lastMessageAt: { $max: '$createdAt' },
            },
        },
        {
            $match: {
                totalMessages: { $gte: minMessages },
            },
        },
    ]).toArray();

    if (!interactions.length) {
        console.log(`No active client↔dietitian chats found in last ${days} days.`);
        return;
    }

    const clientMap = new Map(clients.map((c) => [String(c._id), c]));

    // 3) Load all dietitians involved in active interactions
    const activeDietitianIds = [...new Set(interactions.map((i) => String(i._id.dietitianId)))];
    const activeDietitianObjectIds = activeDietitianIds
        .map((id) => toValidObjectId(id))
        .filter(Boolean);

    const activeDietitians = await users.find(
        { _id: { $in: activeDietitianObjectIds } },
        { projection: { _id: 1, dtps_id: 1, firstName: 1, lastName: 1, phone: 1, email: 1, role: 1 } }
    ).toArray();

    const dietitianMap = new Map(activeDietitians.map((d) => [String(d._id), d]));

    // 4) Build per-client stats for primary chat for comparison
    const primaryKeyToStats = new Map();
    for (const item of interactions) {
        const clientId = String(item._id.clientId);
        const dietitianId = String(item._id.dietitianId);
        primaryKeyToStats.set(`${clientId}:${dietitianId}`, item);
    }

    // 5) Keep only deviations (chatting with dietitian != primary)
    const deviations = [];

    for (const interaction of interactions) {
        const clientId = String(interaction._id.clientId);
        const activeDietitianId = String(interaction._id.dietitianId);

        const client = clientMap.get(clientId);
        if (!client || !client.assignedDietitian) continue;

        const primaryDietitianId = String(client.assignedDietitian);
        if (primaryDietitianId === activeDietitianId) continue;

        const primaryObjectId = toValidObjectId(primaryDietitianId);
        const primaryDietitian = dietitianMap.get(primaryDietitianId)
            || (primaryObjectId
                ? await users.findOne(
                    { _id: primaryObjectId },
                    { projection: { _id: 1, dtps_id: 1, firstName: 1, lastName: 1, phone: 1, email: 1, role: 1 } }
                )
                : null);

        const activeDietitian = dietitianMap.get(activeDietitianId);

        const secondaryIds = Array.isArray(client.assignedDietitians)
            ? client.assignedDietitians.map((id) => String(id))
            : [];

        const relationshipType = secondaryIds.includes(activeDietitianId)
            ? 'SECONDARY_ASSIGNED'
            : 'OTHER_NOT_ASSIGNED';

        const primaryStats = primaryKeyToStats.get(`${clientId}:${primaryDietitianId}`);

        deviations.push({
            clientMongoId: clientId,
            clientDisplayId: client.clientId || client.dtps_id || '-',
            clientName: safeName(client),
            clientPhone: client.phone || '-',
            clientEmail: client.email || '-',

            primaryDietitianMongoId: primaryDietitianId,
            primaryDietitianDisplayId: primaryDietitian?.dtps_id || '-',
            primaryDietitianName: safeName(primaryDietitian),
            primaryDietitianPhone: primaryDietitian?.phone || '-',
            primaryDietitianEmail: primaryDietitian?.email || '-',

            activeDietitianMongoId: activeDietitianId,
            activeDietitianDisplayId: activeDietitian?.dtps_id || '-',
            activeDietitianName: safeName(activeDietitian),
            activeDietitianPhone: activeDietitian?.phone || '-',
            activeDietitianEmail: activeDietitian?.email || '-',
            activeDietitianRelationship: relationshipType,

            nonPrimaryTotalMessages: interaction.totalMessages,
            nonPrimaryClientToDietitianMessages: interaction.clientToDietitianMessages,
            nonPrimaryDietitianToClientMessages: interaction.dietitianToClientMessages,
            nonPrimaryLastMessageAt: interaction.lastMessageAt,

            primaryTotalMessagesInWindow: primaryStats?.totalMessages || 0,
            primaryClientToDietitianMessagesInWindow: primaryStats?.clientToDietitianMessages || 0,
            primaryDietitianToClientMessagesInWindow: primaryStats?.dietitianToClientMessages || 0,
            primaryLastMessageAtInWindow: primaryStats?.lastMessageAt || null,
        });
    }

    deviations.sort((a, b) => {
        const diff = new Date(b.nonPrimaryLastMessageAt).getTime() - new Date(a.nonPrimaryLastMessageAt).getTime();
        if (diff !== 0) return diff;
        return b.nonPrimaryTotalMessages - a.nonPrimaryTotalMessages;
    });

    const reportDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = `clients-chatting-non-primary-dietitian-${days}d-${ts}`;
    const jsonPath = path.join(reportDir, `${baseName}.json`);
    const csvPath = path.join(reportDir, `${baseName}.csv`);

    const summary = {
        generatedAt: new Date().toISOString(),
        timeWindowDays: days,
        minimumMessagesForActive: minMessages,
        totalClientsWithPrimaryDietitian: clients.length,
        totalActiveClientDietitianPairs: interactions.length,
        totalDeviationRows: deviations.length,
        uniqueClientsDeviating: new Set(deviations.map((d) => d.clientMongoId)).size,
        uniqueNonPrimaryDietitiansInvolved: new Set(deviations.map((d) => d.activeDietitianMongoId)).size,
        secondaryAssignedDeviations: deviations.filter((d) => d.activeDietitianRelationship === 'SECONDARY_ASSIGNED').length,
        otherNotAssignedDeviations: deviations.filter((d) => d.activeDietitianRelationship === 'OTHER_NOT_ASSIGNED').length,
    };

    fs.writeFileSync(jsonPath, JSON.stringify({ summary, rows: deviations }, null, 2));
    fs.writeFileSync(csvPath, toCsv(deviations));

    console.log('✅ Report generated');
    console.log('-------------------------------------------');
    console.log('Window (days):', summary.timeWindowDays);
    console.log('Min messages for active:', summary.minimumMessagesForActive);
    console.log('Clients with primary:', summary.totalClientsWithPrimaryDietitian);
    console.log('Deviation rows:', summary.totalDeviationRows);
    console.log('Unique deviating clients:', summary.uniqueClientsDeviating);
    console.log('Non-primary is secondary:', summary.secondaryAssignedDeviations);
    console.log('Non-primary is other:', summary.otherNotAssignedDeviations);
    console.log('JSON:', jsonPath);
    console.log('CSV :', csvPath);

    if (deviations.length > 0) {
        console.log('\nTop 10 recent deviations:');
        console.log('----------------------------------------------------------------------------------------------');
        console.log('Client ID | Client Name                | Primary Dietitian        | Active Non-Primary      | Last Msg At');
        console.log('----------------------------------------------------------------------------------------------');

        for (const row of deviations.slice(0, 10)) {
            const line = `${String(row.clientDisplayId).padEnd(9)} | ${String(row.clientName).slice(0, 26).padEnd(26)} | ${String(row.primaryDietitianName).slice(0, 24).padEnd(24)} | ${String(row.activeDietitianName).slice(0, 22).padEnd(22)} | ${new Date(row.nonPrimaryLastMessageAt).toISOString()}`;
            console.log(line);
        }

        console.log('----------------------------------------------------------------------------------------------');
    }
}

main()
    .catch((error) => {
        console.error('❌ Failed to generate report:', error?.message || error);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await mongoose.disconnect();
        } catch {
            // ignore
        }
    });
