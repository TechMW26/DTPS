import type {MongoDatabase,DocumentData} from '@/lib/db/mongo-types';
import {nativeDates} from './native-plan-editor';
export async function nativeRecentActivity(db:MongoDatabase,now=new Date()){
 const since=new Date(now.getTime()-86400000),[users,appointments,payments]=await Promise.all([
  db.collection('users').where('createdAt','>=',since).orderBy('createdAt','desc').limit(5).select('firstName','lastName','role','createdAt').get(),
  db.collection('appointments').where('status','in',['confirmed','completed']).where('updatedAt','>=',since).orderBy('updatedAt','desc').limit(5).select('client','dietitian','status','updatedAt').get(),
  db.collection('unifiedpayments').where('paymentStatus','==','paid').where('paidAt','>=',since).orderBy('paidAt','desc').limit(3).select('client','finalAmount','amount','currency','paidAt').get(),
 ]);
 const ids=[...new Set([...appointments.docs.flatMap(row=>[row.get('client'),row.get('dietitian')]),...payments.docs.map(row=>row.get('client'))])].filter(id=>typeof id==='string'&&/^[a-f0-9]{24}$/.test(id));
 const people=new Map<string,string>();if(ids.length)for(const row of await db.getAll(...ids.map(id=>db.collection('users').doc(id)),{fieldMask:['firstName','lastName']}))if(row.exists)people.set(row.id,[row.get('firstName'),row.get('lastName')].filter(Boolean).join(' '));
 const activities:DocumentData[]=[];
 const add=(id:string,type:string,message:string,timestamp:Date)=>{const minutes=Math.max(0,Math.floor((now.getTime()-timestamp.getTime())/60000));activities.push({id,type,message,timestamp,status:'success',time:minutes<1?'Just now':minutes<60?`${minutes} minutes ago`:`${Math.floor(minutes/60)} hours ago`});};
 for(const row of users.docs){const data=nativeDates(row.data());add('user_'+row.id,'user_signup',`New ${data.role} registered: ${[data.firstName,data.lastName].filter(Boolean).join(' ')}`,data.createdAt);}
 for(const row of appointments.docs){const data=nativeDates(row.data());add('appointment_'+row.id,'appointment',`Appointment ${data.status}: ${people.get(data.dietitian)||'Staff'} & ${people.get(data.client)||'Client'}`,data.updatedAt);}
 for(const row of payments.docs){const data=nativeDates(row.data());add('payment_'+row.id,'payment',`Payment processed: ${data.currency||'INR'} ${data.finalAmount??data.amount??0} from ${people.get(data.client)||'Client'}`,data.paidAt);}
 return activities.sort((a,b)=>b.timestamp.getTime()-a.timestamp.getTime()).slice(0,10);
}
