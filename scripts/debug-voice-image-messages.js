/* eslint-disable no-console */
require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env.local');
  process.exit(1);
}

async function debugMessages() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected');

    const messagesCollection = mongoose.connection.db.collection('messages');

    // Find most recent 5 messages to verify structure
    console.log('\n🔍 RECENT 5 MESSAGES (all types - showing full structure):');
    console.log('='.repeat(80));

    const recentMessages = await messagesCollection.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    recentMessages.forEach((msg, i) => {
      console.log(`\n[${i + 1}] Full message object:`);
      console.log(JSON.stringify({
        _id: msg._id,
        type: msg.type,
        content: msg.content?.substring(0, 50) + '...',
        attachments: msg.attachments,
        sender: msg.sender,
        receiver: msg.receiver,
        createdAt: msg.createdAt
      }, null, 2));
    });

    // Find recent voice messages
    console.log('\n\n📞 VOICE MESSAGES (last 20):');
    console.log('='.repeat(80));

    const voiceMessages = await messagesCollection.find({
      $or: [
        { type: 'voice' },
        { type: 'audio' },
        { 'attachments.mimeType': { $regex: /^audio\//i } }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    console.log(`Found: ${voiceMessages.length} voice/audio messages\n`);

    voiceMessages.forEach((msg, i) => {
      console.log(`[${i + 1}] Message ID: ${msg._id}`);
      console.log(`    Type: ${msg.type}`);
      console.log(`    Content: ${msg.content?.substring(0, 50) || '(empty)'}...`);
      console.log(`    Created: ${msg.createdAt}`);
      console.log(`    Sender: ${msg.sender}`);
      console.log(`    Receiver: ${msg.receiver}`);
      console.log(`    Attachments: ${msg.attachments?.length || 0}`);
      if (msg.attachments?.length > 0) {
        msg.attachments.forEach((att, j) => {
          console.log(`      Attachment ${j + 1}:`);
          console.log(`        URL: ${att.url?.substring(0, 80) || 'MISSING'}...`);
          console.log(`        Filename: ${att.filename || 'MISSING'}`);
          console.log(`        MimeType: ${att.mimeType || 'MISSING'}`);
          console.log(`        Size: ${att.size || 'MISSING'}`);
          console.log(`        Duration: ${att.duration || 'N/A'}`);
        });
      }
      console.log('');
    });

    // Find recent image messages
    console.log('\n📷 IMAGE MESSAGES (last 20):');
    console.log('='.repeat(80));

    const imageMessages = await messagesCollection.find({
      $or: [
        { type: 'image' },
        { 'attachments.mimeType': { $regex: /^image\//i } },
        { content: { $regex: /meal\s*(picture|photo|image)/i } }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    console.log(`Found: ${imageMessages.length} image messages\n`);

    imageMessages.forEach((msg, i) => {
      console.log(`[${i + 1}] Message ID: ${msg._id}`);
      console.log(`    Type: ${msg.type}`);
      console.log(`    Content: ${msg.content?.substring(0, 50) || '(empty)'}...`);
      console.log(`    Created: ${msg.createdAt}`);
      console.log(`    Sender: ${msg.sender}`);
      console.log(`    Attachments: ${msg.attachments?.length || 0}`);
      if (msg.attachments?.length > 0) {
        msg.attachments.forEach((att, j) => {
          console.log(`      Attachment ${j + 1}:`);
          console.log(`        URL: ${att.url?.substring(0, 100) || 'MISSING'}...`);
          console.log(`        Filename: ${att.filename || 'MISSING'}`);
          console.log(`        MimeType: ${att.mimeType || 'MISSING'}`);
          console.log(`        Size: ${att.size || 'MISSING'}`);
        });
      }
      console.log('');
    });

    // Check for any messages with missing/null attachment URLs
    console.log('\n⚠️ MESSAGES WITH MISSING ATTACHMENT DATA:');
    console.log('='.repeat(80));

    const brokenMessages = await messagesCollection.find({
      attachments: { $exists: true, $ne: [] },
      $or: [
        { 'attachments.url': { $exists: false } },
        { 'attachments.url': null },
        { 'attachments.url': '' }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    console.log(`Found: ${brokenMessages.length} messages with broken attachments\n`);

    brokenMessages.forEach((msg, i) => {
      console.log(`[${i + 1}] Message ID: ${msg._id}`);
      console.log(`    Type: ${msg.type}`);
      console.log(`    Content: ${msg.content?.substring(0, 50) || '(empty)'}`);
      console.log(`    Attachments: ${JSON.stringify(msg.attachments, null, 2)}`);
      console.log('');
    });

    // Summary stats
    console.log('\n📊 MESSAGE TYPE SUMMARY:');
    console.log('='.repeat(80));

    const typeCounts = await messagesCollection.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    typeCounts.forEach(tc => {
      console.log(`  ${tc._id || 'null'}: ${tc.count} messages`);
    });

    // Check messages with attachments that have valid URLs
    console.log('\n📎 ATTACHMENT URL VALIDATION:');
    console.log('='.repeat(80));

    const messagesWithAttachments = await messagesCollection.countDocuments({
      attachments: { $exists: true, $ne: [] }
    });

    const messagesWithValidUrls = await messagesCollection.countDocuments({
      attachments: { $exists: true, $ne: [] },
      'attachments.0.url': { $regex: /^https?:\/\//i }
    });

    console.log(`  Total messages with attachments: ${messagesWithAttachments}`);
    console.log(`  Messages with valid HTTP URLs: ${messagesWithValidUrls}`);
    console.log(`  Messages with potentially broken URLs: ${messagesWithAttachments - messagesWithValidUrls}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected');
  }
}

debugMessages();
