/**
 * Test the client-purchases API response
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function test() {
    await mongoose.connect(process.env.MONGODB_URI);

    const clientId = '6989b3fa50337039a928e0fb';

    // Query exactly like the API does
    const query = {
        client: new mongoose.Types.ObjectId(clientId),
        $or: [
            { paymentStatus: 'paid' },
            { status: { $in: ['paid', 'completed', 'active'] } }
        ]
    };

    const coll = mongoose.connection.collection('unifiedpayments');
    const purchases = await coll.find(query).toArray();

    console.log('=== Client Purchases API Would Return ===');
    console.log('Total purchases:', purchases.length);

    purchases.forEach(p => {
        console.log('\n--- Purchase ---');
        console.log('_id:', p._id);
        console.log('planName:', p.planName);
        console.log('status:', p.status);
        console.log('paymentStatus:', p.paymentStatus);
        console.log('paymentLink:', p.paymentLink);
        console.log('amount:', p.amount || p.finalAmount);
        console.log('Has paymentLink?', !!p.paymentLink);
    });

    // Also check paymentlinks for this client
    const paymentLinks = mongoose.connection.collection('paymentlinks');
    const links = await paymentLinks.find({ client: new mongoose.Types.ObjectId(clientId) }).toArray();
    console.log('\n=== Payment Links for Client ===');
    console.log('Total links:', links.length);
    links.forEach(l => {
        console.log('- Link ID:', l._id, 'Status:', l.status);
    });

    await mongoose.disconnect();
}
test().catch(console.error);
