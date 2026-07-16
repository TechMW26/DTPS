/**
 * Check if the imported payment matches the client-purchases query
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);

    const coll = mongoose.connection.collection('unifiedpayments');
    const clientId = '6989b3fa50337039a928e0fb';

    // Check the query used by the API
    const query = {
        client: new mongoose.Types.ObjectId(clientId),
        $or: [
            { paymentStatus: 'paid' },
            { status: { $in: ['paid', 'completed', 'active'] } }
        ]
    };

    const purchases = await coll.find(query).toArray();
    console.log('Purchases found for client:', purchases.length);
    purchases.forEach(p => {
        console.log('- ID:', p._id, 'Status:', p.status, 'PaymentStatus:', p.paymentStatus, 'Plan:', p.planName, 'Amount:', p.amount || p.finalAmount);
    });

    // Also check without the status filter
    const allForClient = await coll.find({ client: new mongoose.Types.ObjectId(clientId) }).toArray();
    console.log('\nAll payments for client (no status filter):', allForClient.length);
    allForClient.forEach(p => {
        console.log('- ID:', p._id, 'Status:', p.status, 'PaymentStatus:', p.paymentStatus, 'Plan:', p.planName);
    });

    await mongoose.disconnect();
}
check().catch(console.error);
