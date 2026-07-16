/**
 * Script to update email index to sparse for optional emails
 * Run: node scripts/fix-email-index.js
 */

require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

async function fixEmailIndex() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not found');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  const usersCollection = db.collection('users');

  try {
    // Check existing indexes
    const indexes = await usersCollection.indexes();
    console.log('Current indexes:', indexes.map(i => i.name));

    // Drop the old email index if it exists
    const emailIndex = indexes.find(i => i.key && i.key.email);
    if (emailIndex) {
      console.log('Dropping old email index:', emailIndex.name);
      await usersCollection.dropIndex(emailIndex.name);
    }

    // Create new sparse unique index
    console.log('Creating new sparse unique email index...');
    await usersCollection.createIndex(
      { email: 1 },
      { unique: true, sparse: true, name: 'email_1_sparse' }
    );

    console.log('Email index updated successfully!');

    // Verify
    const newIndexes = await usersCollection.indexes();
    console.log('Updated indexes:', newIndexes.map(i => ({ name: i.name, sparse: i.sparse })));
  } catch (err) {
    console.error('Error:', err.message);
  }

  await mongoose.disconnect();
  console.log('Done');
}

fixEmailIndex();
