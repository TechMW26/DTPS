/* eslint-disable no-console */
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const TARGET_EMAIL = 'vajeda.rahaman@mushroomworldgroup.com';

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI not found in .env.local');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const users = mongoose.connection.db.collection('users');

  const vajeda = await users.findOne(
    { role: 'dietitian', email: TARGET_EMAIL },
    { projection: { _id: 1, firstName: 1, lastName: 1, email: 1, dtps_id: 1 } }
  );

  if (!vajeda) {
    throw new Error(`Dietitian not found for ${TARGET_EMAIL}`);
  }

  const clients = await users.find(
    { role: 'client', assignedDietitian: vajeda._id },
    { projection: { clientId: 1, firstName: 1, lastName: 1, phone: 1, email: 1 } }
  ).sort({ clientId: 1 }).toArray();

  console.log(`PRIMARY_COUNT=${clients.length}`);
  clients.forEach((c) => {
    console.log([c.clientId || '', `${c.firstName || ''} ${c.lastName || ''}`.trim(), c.phone || '', c.email || ''].join('\t'));
  });

  const reportDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportDir, `vajeda-current-primary-clients-${timestamp}.csv`);
  const lines = ['clientId,name,phone,email'];
  for (const c of clients) {
    const name = `${c.firstName || ''} ${c.lastName || ''}`.trim().replace(/"/g, '""');
    lines.push([c.clientId || '', `"${name}"`, c.phone || '', c.email || ''].join(','));
  }
  fs.writeFileSync(reportPath, lines.join('\n'));
  console.log(`REPORT=${reportPath}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(`❌ ${err.message}`);
  try { await mongoose.disconnect(); } catch { }
  process.exit(1);
});
