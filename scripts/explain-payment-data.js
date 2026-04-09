/**
 * Script to explain where payment data is stored
 * and why imports show differently than payment links
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function explainPaymentData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        const clientId = '6989b3fa50337039a928e0fb'; // Ajay Singh Chouhan

        // Check PaymentLink collection
        const paymentLinks = await mongoose.connection.collection('paymentlinks')
            .find({ client: new mongoose.Types.ObjectId(clientId) }).toArray();

        // Check UnifiedPayment collection  
        const unifiedPayments = await mongoose.connection.collection('unifiedpayments')
            .find({ client: new mongoose.Types.ObjectId(clientId) }).toArray();

        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║              PAYMENT DATA STORAGE EXPLANATION                 ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');

        console.log('\n📁 COLLECTION 1: paymentlinks');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Purpose: Stores Razorpay payment links (created via "Generate Link" button)');
        console.log('API: /api/payment-links');
        console.log('UI: Was the ONLY source for main Payments table (before fix)');
        console.log('Count for this client:', paymentLinks.length);
        if (paymentLinks.length === 0) {
            console.log('→ No payment links found (client has no Razorpay links)');
        } else {
            paymentLinks.forEach(l => {
                console.log(`  • ${l._id} | ₹${l.amount} | ${l.status} | ${l.planName}`);
            });
        }

        console.log('\n📁 COLLECTION 2: unifiedpayments');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Purpose: Stores ALL completed purchases (Razorpay completions + CSV imports)');
        console.log('API: /api/client-purchases');
        console.log('UI: Was showing as "Plan Purchases" section (separate from main table)');
        console.log('Count for this client:', unifiedPayments.length);

        unifiedPayments.forEach(p => {
            console.log(`\n  📦 Payment ID: ${p._id}`);
            console.log(`     Plan: ${p.planName}`);
            console.log(`     Amount: ₹${p.amount}`);
            console.log(`     Status: ${p.status || p.paymentStatus}`);
            console.log(`     Transaction ID: ${p.transactionId || 'N/A'}`);

            if (p.paymentLink) {
                console.log(`     paymentLink: ${p.paymentLink} ← Linked to a Razorpay payment`);
            } else {
                console.log(`     paymentLink: undefined ← ❗ IMPORTED (no Razorpay link)`);
                console.log(`     ⚠️  This is why it was showing in "Plan Purchases" not main table!`);
            }
        });

        console.log('\n╔══════════════════════════════════════════════════════════════╗');
        console.log('║                    THE PROBLEM & FIX                          ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');

        console.log('\n❌ BEFORE FIX:');
        console.log('   Main Payments Table → Only showed PaymentLink data');
        console.log('   Plan Purchases Section → Showed UnifiedPayment data (without links)');
        console.log('   → Your imported payment had paymentLink=undefined');
        console.log('   → So it went to "Plan Purchases" instead of main table');
        console.log('   → No action buttons available (View Invoice, Set Dates, etc.)');

        console.log('\n✅ AFTER FIX:');
        console.log('   Main Payments Table → Shows BOTH:');
        console.log('     1. PaymentLink data (Razorpay links)');
        console.log('     2. UnifiedPayment data without paymentLink (imports)');
        console.log('   → Imported payments now show with "Import" badge');
        console.log('   → Full action menu available (View Invoice, Email, Set Dates)');
        console.log('   → "Plan Purchases" section removed (merged into main table)');

        await mongoose.disconnect();
        console.log('\n✅ Done');

    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

explainPaymentData();
