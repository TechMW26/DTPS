require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

(async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dtps-nutrition';
  await mongoose.connect(uri);

  const docs = await mongoose.connection.db
    .collection('systemalerts')
    .find({ type: { $in: ['error', 'critical', 'warning'] } })
    .sort({ createdAt: -1 })
    .toArray();

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `runtime-errors-whole-${ts}.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        total: docs.length,
        records: docs,
      },
      null,
      2
    )
  );

  const runtimeOnly = docs.filter(
    (d) => d.source === 'api' || d.category === 'api_error' || d.category === 'performance'
  );

  console.log(`TOTAL_ALERTS=${docs.length}`);
  console.log(`RUNTIME_RELATED=${runtimeOnly.length}`);
  console.log(`OUT_FILE=${outFile}`);

  await mongoose.disconnect();
})().catch(async (error) => {
  console.error('EXPORT_FAILED', error?.message || error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
