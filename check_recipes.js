const mongoose = require('mongoose');

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dtps');
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const recipeCollection = collections.find(c => c.name === 'recipes');
    
    if (recipeCollection) {
      const count = await db.collection('recipes').countDocuments();
      console.log(`✓ recipes collection exists with ${count} documents`);
    } else {
      console.log('✗ recipes collection not found');
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

check();
