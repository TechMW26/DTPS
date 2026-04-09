/**
 * Check payment position in list
 */
const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);

    const coll = mongoose.connection.collection('unifiedpayments');

    // Get the imported payment
    const imported = await coll.findOne({ _id: new mongoose.Types.ObjectId('69d632b18f550e768e44d86a') });
    console.log('Imported payment createdAt:', imported?.createdAt);

    // Count how many are newer
    const newerCount = await coll.countDocuments({
        createdAt: { $gt: imported?.createdAt }
    });
    console.log('Payments created after this one:', newerCount);
    console.log('This payment would be at position:', newerCount + 1);
    console.log('API default limit is 100, so it would NOT show up initially:', newerCount >= 100 ? 'CORRECT - HIDDEN' : 'No, should show');

    await mongoose.disconnect();
}
check().catch(console.error);
