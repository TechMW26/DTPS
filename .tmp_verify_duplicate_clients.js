require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

const clientNumbers = [
  'C-2337','C-3427','C-2485','C-2721','C-3312','C-2800','C-4309','C-2969','C-3778','C-2924','C-3551',
  'C-916','C-2459','C-122','C-3213','C-2857','C-2261','C-2443','C-2394','C-3583','C-744','C-2709'
];

function classifySource(doc) {
  const tx = (doc.transactionId || '').toString();
  const hasPaymentLinkObj = !!doc.paymentLink;
  const hasRazorpayPaymentId = !!doc.razorpayPaymentId;

  if (/^OPP-/i.test(tx)) return 'Imported (likely Zoco/Zoconet/manual import)';
  if (hasPaymentLinkObj && !hasRazorpayPaymentId) return 'Imported/Backfilled via PaymentLink';
  if (hasRazorpayPaymentId && /^pay_/i.test(doc.razorpayPaymentId)) return 'Native Razorpay';
  if (/^pay_/i.test(tx)) return 'Native Razorpay';
  return 'Unknown';
}

(async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_URL || process.env.DATABASE_URL;
  if (!uri) throw new Error('Missing Mongo URI');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const users = await db.collection('users').find(
    { clientId: { $in: clientNumbers } },
    { projection: { _id: 1, clientId: 1, name: 1 } }
  ).toArray();
  const userByClientNumber = new Map(users.map(u => [u.clientId, u]));

  const results = [];

  for (const cn of clientNumbers) {
    const user = userByClientNumber.get(cn);
    if (!user) {
      results.push({ clientNumber: cn, found: false, message: 'Client not found in users' });
      continue;
    }

    const paidish = await db.collection('unifiedpayments').find({
      client: user._id,
      $or: [
        { paymentStatus: 'paid' },
        { status: { $in: ['paid', 'completed', 'active'] } }
      ]
    }, {
      projection: {
        _id: 1,
        planName: 1,
        finalAmount: 1,
        currency: 1,
        status: 1,
        paymentStatus: 1,
        paidAt: 1,
        createdAt: 1,
        paymentLink: 1,
        razorpayPaymentId: 1,
        transactionId: 1,
        durationDays: 1,
        durationLabel: 1
      }
    }).sort({ createdAt: 1 }).toArray();

    const groups = new Map();
    for (const p of paidish) {
      const key = String(p.paymentLink || p.razorpayPaymentId || p.transactionId || p._id);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }

    const duplicateGroups = [];
    for (const [key, docs] of groups.entries()) {
      if (docs.length <= 1) continue;
      duplicateGroups.push({
        paymentIdentityKey: key,
        count: docs.length,
        docs: docs.map(d => ({
          id: String(d._id),
          planName: d.planName || 'N/A',
          amount: d.finalAmount,
          currency: d.currency || 'INR',
          status: d.status,
          paymentStatus: d.paymentStatus,
          paidAt: d.paidAt || null,
          createdAt: d.createdAt,
          paymentLink: d.paymentLink ? String(d.paymentLink) : null,
          razorpayPaymentId: d.razorpayPaymentId || null,
          transactionId: d.transactionId || null,
          durationDays: d.durationDays || null,
          durationLabel: d.durationLabel || null,
          sourceGuess: classifySource(d),
          isPaidDone: d.paymentStatus === 'paid' || ['paid', 'completed', 'active'].includes(d.status)
        }))
      });
    }

    const flat = duplicateGroups.flatMap(g => g.docs);
    const importLikelyCount = flat.filter(d => d.sourceGuess.includes('Imported')).length;
    const nativeCount = flat.filter(d => d.sourceGuess === 'Native Razorpay').length;

    results.push({
      clientNumber: cn,
      clientName: user.name || 'Unknown',
      found: true,
      duplicateGroupCount: duplicateGroups.length,
      duplicateRecordCount: duplicateGroups.reduce((a, g) => a + g.count, 0),
      importLikelyCount,
      nativeCount,
      duplicateGroups
    });
  }

  const out = { checkedClients: clientNumbers.length, results };
  console.log(JSON.stringify(out, null, 2));
  await mongoose.disconnect();
})();
