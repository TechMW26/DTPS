// READ-ONLY health check. It only lists indexes and counts documents. It never writes, updates or deletes.
import {MongoClient} from 'mongodb';
import fs from 'node:fs';
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z0-9_]+\s*=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const uri=env.MONGODB_URI,dbName=env.MONGODB_DATABASE||'dtps';
if(!uri)throw new Error('MONGODB_URI not found in .env.local');
const wanted={
 users:[['role','status'],['email'],['phone']],
 unifiedpayments:[['client'],['razorpayPaymentId'],['razorpayOrderId'],['dietitian']],
 paymentlinks:[['razorpayPaymentLinkId'],['client']],
 clientmealplans:[['clientId','status']],
 journaltrackings:[['client','date']],
 dailytrackings:[['client','date']],
 foodlogs:[['client','date']],
 progressentries:[['user','type','recordedAt']],
 messages:[['receiver','isRead']],
 notifications:[['userId','read']],
 appointments:[['dietitian','status','scheduledAt'],['client']],
 clientsubscriptions:[['razorpayPaymentId']],
 lifestyleinfos:[['userId']],
 _nativeOutbox:[['status','type','createdAt']],
};
const client=new MongoClient(uri,{readPreference:'secondaryPreferred'});
try{
 await client.connect();const db=client.db(dbName);
 const existing=new Set((await db.listCollections({},{nameOnly:true}).toArray()).map(c=>c.name));
 console.log(`Database: ${dbName}\n`);
 for(const [name,list] of Object.entries(wanted)){
  if(!existing.has(name)){console.log(`${name.padEnd(20)} (collection not found)`);continue;}
  const col=db.collection(name),[count,indexes]=await Promise.all([col.estimatedDocumentCount(),col.listIndexes().toArray()]);
  const keys=indexes.map(i=>Object.keys(i.key).filter(k=>k!=='_collectionPath'&&k!=='_collectionGroup'));
  for(const fields of list){
   const need=fields.map(f=>'data.'+f),ok=keys.some(k=>need.every((f,i)=>k[i]===f));
   console.log(`${ok?'OK     ':'MISSING'}  ${name.padEnd(20)} ${String(count).padStart(8)} docs   ${need.join(' + ')}`);
  }
 }
}finally{await client.close();}