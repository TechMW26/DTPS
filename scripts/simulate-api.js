/**
 * Simulate the exact API query to check if payment appears
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);

    // This is the exact query the API uses
    const paymentsColl = mongoose.connection.collection('unifiedpayments');

    // Get payments sorted by createdAt desc, limit 100
    const payments = await paymentsColl.aggregate([
        { $sort: { createdAt: -1 } },
        { $limit: 100 },
        {
            $lookup: {
                from: 'users',
                localField: 'client',
                foreignField: '_id',
                as: 'clientData'
            }
        },
        {
            $project: {
                _id: 1,
                client: { $arrayElemAt: ['$clientData', 0] },
                amount: 1,
                finalAmount: 1,
                status: 1,
                planName: 1,
                createdAt: 1
            }
        }
    ]).toArray();

    console.log('Total payments returned:', payments.length);

    // Find our payment
    const targetId = '69d632b18f550e768e44d86a';
    const found = payments.find(p => p._id.toString() === targetId);

    if (found) {
        console.log('\n✅ Payment FOUND in API results!');
        console.log('Position:', payments.findIndex(p => p._id.toString() === targetId) + 1);
        console.log('Data:', JSON.stringify({
            _id: found._id,
            clientName: found.client ? `${found.client.firstName} ${found.client.lastName}` : 'No client',
            amount: found.amount || found.finalAmount,
            status: found.status,
            planName: found.planName
        }, null, 2));
    } else {
        console.log('\n❌ Payment NOT FOUND in first 100 results');

        // Check what position it's at
        const allPayments = await paymentsColl.find().sort({ createdAt: -1 }).toArray();
        const position = allPayments.findIndex(p => p._id.toString() === targetId);
        console.log('Actual position in all payments:', position + 1);
    }

    await mongoose.disconnect();
}
check().catch(console.error);
