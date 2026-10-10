import type {MongoDatabase,DocumentData} from '@/lib/db/mongo-types';
import {nativeDates} from './native-plan-editor';
import {hydrateNativeDocument} from '@/lib/storage/native-document';
export async function nativeClientServices(db:MongoDatabase,userId:string){
 const [user,payments,mealPlans]=await Promise.all([
  db.collection('users').doc(userId).get(),
  db.collection('unifiedpayments').where('client','==',userId).where('status','in',['paid','completed','active']).where('paymentStatus','==','paid').orderBy('createdAt','desc').get(),
  db.collection('clientmealplans').where('clientId','==',userId).where('status','in',['active','paused','completed']).select('name','planName','startDate','endDate','duration','goal','goals','purchaseId','status','createdAt','lastPublishedAt','isDeleted').get(),
 ]);
 const people=new Map<string,DocumentData>();
 const staffIds=[...new Set([user.get('assignedDietitian'),...payments.docs.map(row=>row.get('dietitian'))].filter(id=>typeof id==='string'&&id&&!id.includes('/')))];
 if(staffIds.length){const rows=await db.getAll(...staffIds.map(id=>db.collection('users').doc(id)));for(const row of rows)if(row.exists)people.set(row.id,{_id:row.id,...Object.fromEntries(['firstName','lastName','email','phone','avatar','role'].filter(key=>row.get(key)!==undefined).map(key=>[key,row.get(key)]))});}
 const allPurchases=await Promise.all(payments.docs.map(async row=>({...nativeDates(await hydrateNativeDocument(row.data())),_id:row.id,dietitian:people.get(row.get('dietitian'))||null})));
 const plans=mealPlans.docs.filter(row=>!row.get('isDeleted')).map(row=>({...nativeDates(row.data()),_id:row.id}));
 return {primaryDietitian:people.get(user.get('assignedDietitian'))||null,allPurchases,mealPlans:plans};
}
export async function nativeServiceCatalog(db:MongoDatabase){
 const rows=await db.collection('serviceplans').where('isActive','==',true).where('showToClients','==',true).orderBy('createdAt','desc').get();
 return Promise.all(rows.docs.map(async row=>({...nativeDates(await hydrateNativeDocument(row.data())),_id:row.id})));
}
