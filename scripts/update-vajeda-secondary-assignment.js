/* eslint-disable no-console */
require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    const usersCollection = mongoose.connection.db.collection('users');

    const dietitian = await usersCollection.findOne({
        role: 'dietitian',
        $or: [
            { dtps_id: { $regex: /^dt-694a$/i } },
            { phone: '9203199275' },
            { phone: '+919203199275' },
            { email: 'vajeda.rahaman@mushroomworldgroup.com' },
            { firstName: { $regex: /^vajeda$/i }, lastName: { $regex: /^rehman$/i } }
        ]
    }, {
        projection: { _id: 1, dtps_id: 1, firstName: 1, lastName: 1, phone: 1, email: 1 }
    });

    if (!dietitian) {
        console.log('❌ Dietitian not found with provided details.');
        return;
    }

    const dietitianId = String(dietitian._id);
    console.log('✅ Dietitian found:', {
        _id: dietitianId,
        dtps_id: dietitian.dtps_id,
        name: `${dietitian.firstName} ${dietitian.lastName}`,
        phone: dietitian.phone,
        email: dietitian.email
    });

    const primaryClients = await usersCollection.find({
        role: 'client',
        assignedDietitian: dietitian._id
    }, {
        projection: { _id: 1, clientId: 1, firstName: 1, lastName: 1, phone: 1, assignedDietitians: 1 }
    }).toArray();

    console.log(`\n📋 Primary clients count: ${primaryClients.length}`);

    const listRows = [];
    const bulkOps = [];

    for (const client of primaryClients) {
        const currentArr = Array.isArray(client.assignedDietitians)
            ? client.assignedDietitians.map((v) => String(v))
            : [];

        const reordered = [...currentArr.filter((id) => id !== dietitianId), dietitianId];
        const changed = JSON.stringify(currentArr) !== JSON.stringify(reordered);

        listRows.push({
            clientId: client.clientId || '-',
            name: `${client.firstName || ''} ${client.lastName || ''}`.trim(),
            phone: client.phone || '-',
            inSecondaryBefore: currentArr.includes(dietitianId),
            wasLastBefore: currentArr[currentArr.length - 1] === dietitianId,
            updated: changed
        });

        if (changed) {
            bulkOps.push({
                updateOne: {
                    filter: { _id: client._id },
                    update: { $set: { assignedDietitians: reordered.map((id) => new mongoose.Types.ObjectId(id)) } }
                }
            });
        }
    }

    if (bulkOps.length > 0) {
        const result = await usersCollection.bulkWrite(bulkOps);
        console.log(`\n🛠️ Updated clients: ${result.modifiedCount || 0}`);
    } else {
        console.log('\n🛠️ No updates needed.');
    }

    const verify = await usersCollection.find({
        role: 'client',
        assignedDietitian: dietitian._id
    }, {
        projection: { _id: 1, assignedDietitians: 1 }
    }).toArray();

    const failed = verify.filter((client) => {
        const arr = Array.isArray(client.assignedDietitians)
            ? client.assignedDietitians.map((v) => String(v))
            : [];
        return arr.length === 0 || arr[arr.length - 1] !== dietitianId;
    });

    console.log(`✅ Verification: ${verify.length - failed.length}/${verify.length} clients now have this dietitian as LAST in assignedDietitians.`);

    console.log('\n📌 Clients where this dietitian is PRIMARY:');
    console.log('----------------------------------------------------------------------------------------------');
    console.log('Client ID | Name                       | Phone         | In secondary before | Last before | Updated');
    console.log('----------------------------------------------------------------------------------------------');

    for (const row of listRows) {
        const line = `${String(row.clientId).padEnd(9)} | ${String(row.name).slice(0, 26).padEnd(26)} | ${String(row.phone).padEnd(13)} | ${String(row.inSecondaryBefore).padEnd(19)} | ${String(row.wasLastBefore).padEnd(11)} | ${row.updated}`;
        console.log(line);
    }

    console.log('----------------------------------------------------------------------------------------------');

    const reportDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
    }

    const csvPath = path.join(reportDir, 'vajeda-primary-clients.csv');
    const header = 'clientId,name,phone,inSecondaryBefore,wasLastBefore,updated';
    const rows = listRows.map((row) => {
        const nameEscaped = String(row.name).replace(/"/g, '""');
        return [
            row.clientId,
            `"${nameEscaped}"`,
            row.phone,
            row.inSecondaryBefore,
            row.wasLastBefore,
            row.updated
        ].join(',');
    });

    fs.writeFileSync(csvPath, [header, ...rows].join('\n'));
    console.log(`\n📄 Report saved: ${csvPath}`);
}

main()
    .catch((error) => {
        console.error('❌ Error:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
        console.log('🔌 Disconnected');
    });
