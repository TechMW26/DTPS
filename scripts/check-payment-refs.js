/**
 * Check if the client reference exists for the payment
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);

    const paymentsColl = mongoose.connection.collection('unifiedpayments');
    const usersColl = mongoose.connection.collection('users');

    // Get the imported payment
    const payment = await paymentsColl.findOne({ _id: new mongoose.Types.ObjectId('69d632b18f550e768e44d86a') });

    console.log('=== Payment Details ===');
    console.log('Payment ID:', payment?._id);
    console.log('Client ref:', payment?.client);
    console.log('Client ref type:', typeof payment?.client);

    // Check if client exists
    if (payment?.client) {
        const clientId = payment.client instanceof mongoose.Types.ObjectId
            ? payment.client
            : new mongoose.Types.ObjectId(payment.client);

        const client = await usersColl.findOne({ _id: clientId });

        if (client) {
            console.log('\n=== Client Found ===');
            console.log('Client Name:', client.firstName, client.lastName);
            console.log('Client Email:', client.email);
        } else {
            console.log('\n❌ CLIENT NOT FOUND in users collection!');
            console.log('This is why the payment might not show properly.');
        }
    }

    // Also check dietitian
    if (payment?.dietitian) {
        const dietitianId = payment.dietitian instanceof mongoose.Types.ObjectId
            ? payment.dietitian
            : new mongoose.Types.ObjectId(payment.dietitian);

        const dietitian = await usersColl.findOne({ _id: dietitianId });

        if (dietitian) {
            console.log('\n=== Dietitian Found ===');
            console.log('Dietitian Name:', dietitian.firstName, dietitian.lastName);
        } else {
            console.log('\n❌ DIETITIAN NOT FOUND in users collection!');
        }
    }

    await mongoose.disconnect();
}
check().catch(console.error);
