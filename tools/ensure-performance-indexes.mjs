import { config as loadEnv } from 'dotenv';
import { MongoClient } from 'mongodb';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is required');

const specifications = [
  ['users', { role: 1, assignedDietitians: 1 }],
  ['users', { role: 1, assignedHealthCounselor: 1 }],
  ['users', { role: 1, assignedHealthCounselors: 1 }],
  ['users', { role: 1, 'createdBy.userId': 1 }],
  ['appointments', { dietitian: 1, scheduledAt: 1, status: 1 }],
  ['appointments', { healthCounselor: 1, scheduledAt: 1, status: 1 }],
  ['appointments', { scheduledAt: 1, status: 1 }],
  ['clientmealplans', { clientId: 1, status: 1, endDate: 1 }],
  [
    'clientmealplans',
    { clientId: 1, isDeleted: 1, status: 1, startDate: -1, endDate: -1 },
  ],
  ['messages', { sender: 1, receiver: 1, createdAt: -1 }],
  ['messages', { sender: 1, createdAt: -1 }],
  ['messages', { receiver: 1, createdAt: -1 }],
  ['messages', { receiver: 1, isRead: 1, createdAt: -1 }],
  ['unifiedpayments', { client: 1, status: 1, createdAt: -1 }],
  ['unifiedpayments', { client: 1, expectedEndDate: -1 }],
  ['tasks', { dietitian: 1, startDate: 1, endDate: 1, status: 1 }],
];

function sameKey(left, right) {
  return JSON.stringify(Object.entries(left)) === JSON.stringify(Object.entries(right));
}

const client = new MongoClient(uri, {
  maxPoolSize: 2,
  serverSelectionTimeoutMS: 10_000,
});

try {
  await client.connect();
  const db = client.db();
  const collections = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name),
  );
  let created = 0;
  let existing = 0;

  for (const [collectionName, key] of specifications) {
    if (!collections.has(collectionName)) {
      console.log(`skip ${collectionName}: collection does not exist`);
      continue;
    }

    const collection = db.collection(collectionName);
    const indexes = await collection.indexes();
    if (indexes.some((index) => sameKey(index.key, key))) {
      existing += 1;
      console.log(`exists ${collectionName} ${JSON.stringify(key)}`);
      continue;
    }

    const name = await collection.createIndex(key);
    created += 1;
    console.log(`created ${collectionName}.${name}`);
  }

  console.log(`Performance indexes ready: ${created} created, ${existing} already present.`);
} finally {
  await client.close();
}
