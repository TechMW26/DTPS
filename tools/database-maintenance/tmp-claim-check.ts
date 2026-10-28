import dotenv from 'dotenv';
import {createHash} from 'node:crypto';
import {getNativeDatabase} from '../../src/lib/db/database';
dotenv.config({path: '.env', quiet: true});
dotenv.config({path: '.env.local', override: true, quiet: true});
const claim = (kind: string, value: string) => createHash('sha256').update(kind + '\0' + value).digest('hex');
const db = getNativeDatabase();
(async () => {
  const phone = '+919171920077';
  const email = 'nikitadas055@gmail.com';
  const results: Record<string, unknown> = {};
  for (const [kind, value] of [['phone', phone], ['phone', '919171920077'], ['email', email]] as const) {
    const id = claim(kind, value);
    const doc = await db.collection('_nativeUserKeys').doc(id).get();
    results[`${kind}:${value}`] = {claimId: id, exists: doc.exists, userId: doc.exists ? doc.get('userId') : null};
  }
  const phoneRows = await db.collection('users').where('phone', 'in', [phone, '9171920077', '+919171920077']).get();
  const emailRows = await db.collection('users').where('email', '==', email).get();
  const ids = [...new Set([...phoneRows.docs.map(d => d.get('userId')), ...emailRows.docs.map(d => d.id)].filter(Boolean))];
  const owners: unknown[] = [];
  for (const id of ids) {
    const u = await db.collection('users').doc(String(id)).get();
    if (u.exists) owners.push({id: u.id, name: `${u.get('firstName')} ${u.get('lastName')}`, phone: u.get('phone'), email: u.get('email'), role: u.get('role')});
  }
  console.log(JSON.stringify({results, phoneRowCount: phoneRows.size, emailRowCount: emailRows.size, owners}, null, 2));
  await db.terminate();
})();
