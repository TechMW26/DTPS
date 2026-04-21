require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

(async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_URL || process.env.DATABASE_URL;
  if (!uri) throw new Error('Missing Mongo URI');
  await mongoose.connect(uri);
  const col = mongoose.connection.db.collection('unifiedpayments');

  const createdFieldCount = await col.countDocuments({ created: { $exists: true } });

  const suspiciousCreated = await col.aggregate([
    { $match: { created: { $exists: true, $type: 'string', $regex: 'Import', $options: 'i' } } },
    { $group: { _id: '$created', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } }
  ]).toArray();

  const exactRegex = '^\\s*Feb\\s*23,\\s*2026\\s*Import\\s*$';
  const exactLikeDocs = await col.find(
    { created: { $regex: exactRegex, $options: 'i' } },
    { projection: { _id: 1, client: 1, created: 1, planName: 1, paymentLink: 1, razorpayPaymentId: 1, transactionId: 1, createdAt: 1 } }
  ).toArray();

  const exactLikeDuplicateGroups = await col.aggregate([
    { $match: { created: { $regex: exactRegex, $options: 'i' } } },
    {
      $addFields: {
        dedupeKey: {
          $ifNull: [
            { $toString: '$paymentLink' },
            { $ifNull: ['$razorpayPaymentId', { $ifNull: ['$transactionId', { $toString: '$_id' }] }] }
          ]
        }
      }
    },
    {
      $group: {
        _id: { client: '$client', dedupeKey: '$dedupeKey' },
        count: { $sum: 1 },
        docs: {
          $push: {
            _id: '$_id',
            client: '$client',
            created: '$created',
            planName: '$planName',
            createdAt: '$createdAt',
            paymentLink: '$paymentLink',
            razorpayPaymentId: '$razorpayPaymentId',
            transactionId: '$transactionId'
          }
        }
      }
    },
    { $match: { count: { $gt: 1 } } },
    {
      $lookup: {
        from: 'users',
        localField: '_id.client',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $project: {
        _id: 0,
        clientIdObj: '$_id.client',
        clientNumber: { $ifNull: [{ $arrayElemAt: ['$user.clientId', 0] }, 'N/A'] },
        clientName: { $ifNull: [{ $arrayElemAt: ['$user.name', 0] }, 'Unknown'] },
        dedupeKey: '$_id.dedupeKey',
        count: 1,
        docs: 1
      }
    },
    { $sort: { count: -1 } }
  ]).toArray();

  console.log(JSON.stringify({
    createdFieldCount,
    suspiciousCreatedValues: suspiciousCreated,
    exactLikeCount: exactLikeDocs.length,
    exactLikeDocs,
    exactLikeDuplicateGroups
  }, null, 2));

  await mongoose.disconnect();
})();
