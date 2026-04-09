/**
 * Script to check if imported payment exists in database
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function checkPayment() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const paymentId = '69d632b18f550e768e44d86a';

        // Check UnifiedPayment collection
        const unifiedPayments = mongoose.connection.collection('unifiedpayments');
        const payment = await unifiedPayments.findOne({
            _id: new mongoose.Types.ObjectId(paymentId)
        });

        console.log('\n=== UnifiedPayment Check ===');
        if (payment) {
            console.log('✅ Found payment in unifiedpayments:');
            console.log('   Client:', payment.client);
            console.log('   Amount:', payment.amount || payment.finalAmount);
            console.log('   Status:', payment.status);
            console.log('   Plan:', payment.planName);
        } else {
            console.log('❌ Payment NOT found in unifiedpayments collection');
        }

        // List all payment-related collections
        const collections = await mongoose.connection.db.listCollections().toArray();
        const paymentCollections = collections.filter(c =>
            c.name.toLowerCase().includes('payment') ||
            c.name.toLowerCase().includes('subscription') ||
            c.name.toLowerCase().includes('purchase')
        );

        console.log('\n=== Payment-related collections ===');
        for (const col of paymentCollections) {
            const coll = mongoose.connection.collection(col.name);
            const count = await coll.countDocuments();
            console.log(`- ${col.name} (${count} documents)`);

            // Check if our payment is here
            const found = await coll.findOne({
                _id: new mongoose.Types.ObjectId(paymentId)
            });
            if (found) {
                console.log(`  ✅ FOUND payment here!`);
                console.log('  Data:', JSON.stringify({
                    _id: found._id,
                    client: found.client,
                    amount: found.amount || found.finalAmount,
                    status: found.status,
                    planName: found.planName
                }, null, 2));
            }
        }

        // Also check total payments in unified
        const totalUnified = await unifiedPayments.countDocuments();
        console.log(`\n=== Summary ===`);
        console.log(`Total payments in unifiedpayments: ${totalUnified}`);

        // Get latest 3 payments
        const latest = await unifiedPayments.find().sort({ createdAt: -1 }).limit(3).toArray();
        console.log('\nLatest 3 payments:');
        latest.forEach((p, i) => {
            console.log(`${i + 1}. ID: ${p._id}, Client: ${p.client}, Status: ${p.status}, Amount: ${p.amount || p.finalAmount}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
    }
}

checkPayment();
