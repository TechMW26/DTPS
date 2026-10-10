import type * as MongoTypes from '@/lib/db/mongo-types';
import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import type {MongoDatabase,Query,DocumentData} from '@/lib/db/mongo-types';
import {hydrateNativeDocument,prepareNativeDocument,prepareNativePatch} from '@/lib/storage/native-document';
import {nativeJson} from './native-history';
const text=z.string().max(10000).optional(),strings=z.array(z.string().max(1000)).max(200).optional();
const fields=(keys:string[],schema:any)=>Object.fromEntries(keys.map(key=>[key,schema]));
const medical=z.object({
 ...fields(['medicalConditions','allergies','dietaryRestrictions','gutIssues'],strings),
 ...fields(['medicalHistory','familyHistory','medication','bloodGroup','notes'],text),
 isPregnant:z.boolean().optional(),isLactating:z.boolean().optional(),
 menstrualCycle:z.enum(['regular','irregular','not-applicable','']).optional(),bloodFlow:z.enum(['light','normal','heavy','not-applicable','']).optional(),
 diseaseHistory:z.array(z.object(fields(['id','disease','since','frequency','severity','grading','action'],text))).max(200).optional(),
 reports:z.array(z.object(fields(['id','fileName','uploadedOn','fileType','url','category'],text))).max(1000).optional(),
});
const lifestyle=z.object({
 ...fields(['heightFeet','heightInch','heightCm','weightKg','targetWeightKg','idealWeightKg','bmi','foodPreference','foodLikes','foodDislikes','eatOutFrequency','smokingFrequency','alcoholFrequency','activityRate','monthlyOilConsumption','cookingSalt','carbonatedBeverageFrequency','cravingType','stressLevel'],text),
 ...fields(['preferredCuisine','allergiesFood','fastDays','nonVegExemptDays','cookingOil'],strings),
 activityLevel:z.enum(['sedentary','lightly_active','moderately_active','very_active','extremely_active','']).optional(),
 sleepPattern:z.enum(['regular-sleep','irregular-sleep','insomnia-diagnosed','difficulty-falling-asleep','']).optional(),
});
export class NativeFormError extends Error {constructor(message:string,public status:number){super(message);}}
export type ClientFormCollection='medicalinfos'|'lifestyleinfos'|'dietaryrecalls';
export function validateClientForm(collection:ClientFormCollection,input:unknown):DocumentData{
 if(collection==='medicalinfos')return medical.parse(input);
 if(collection==='lifestyleinfos')return lifestyle.parse(input);
 return z.object({meals:z.array(z.object({mealType:z.string().max(100),hour:z.string().max(2),minute:z.string().max(2),meridian:z.enum(['AM','PM']),food:z.string().max(10000)})).max(100)}).parse(input);
}
function queryFor(db:MongoDatabase,collection:ClientFormCollection,userId:string,date?:Date):Query{
 let query:Query=db.collection(collection).where('userId','==',userId);
 if(date)query=query.where('date','>=',date).where('date','<',new Date(date.getTime()+86400000));return query;
}
export async function readNativeClientForm(db:MongoDatabase,collection:ClientFormCollection,userId:string){
 const rows=await queryFor(db,collection,userId).limit(2).get();if(rows.size>1)throw new Error('Duplicate client form requires reconciliation');
 const row=rows.docs[0];return row?nativeJson({...await hydrateNativeDocument(row.data()),_id:row.id}):null;
}
export async function writeNativeClientForm(db:MongoDatabase,collection:ClientFormCollection,userId:string,input:unknown,date?:Date,actorId?:string,staffRole?:'dietitian'){
 const patch=validateClientForm(collection,input);
 if(collection==='dietaryrecalls'&&(!date||!Number.isFinite(date.getTime())))throw new Error('Invalid recall date');
 const ref=db.collection(collection).doc(createHash('sha256').update(collection+'\0'+userId+'\0'+(date?.toISOString()||'')).digest('hex').slice(0,24));
 return db.runTransaction(async tx=>{
  let client:MongoTypes.DocumentSnapshot|undefined,actor:MongoTypes.DocumentSnapshot|undefined;
  if(actorId){
   const accounts=await tx.getAll(db.collection('users').doc(actorId),db.collection('users').doc(userId));client=accounts[1];actor=accounts[0];
   if(actor.get('role')!==(staffRole||'admin')||actor.get('status')!=='active')throw new NativeFormError('Staff access required',403);
   if(!client.exists||client.get('role')!=='client')throw new NativeFormError('Client not found',404);
   if(staffRole&&![client.get('assignedDietitian'),...(client.get('assignedDietitians')||[])].includes(actorId))throw new NativeFormError('Client is not assigned to you',403);
  }
  const rows=await tx.get(queryFor(db,collection,userId,date).limit(2));if(rows.size>1)throw new Error('Duplicate client form requires reconciliation');
  const current=rows.docs[0],now=new Date();
  const profile:DocumentData={};
  if(actorId&&collection==='lifestyleinfos'){
   for(const field of ['heightCm','weightKg'])if(patch[field]!==undefined&&patch[field]!==''){const value=Number(patch[field]);if(!Number.isFinite(value)||value<=0||value>1000)throw new NativeFormError('Invalid height or weight',400);profile[field]=value;}
   if(patch.activityLevel!==undefined)profile.activityLevel=patch.activityLevel;
  }
  const updateProfile=()=>{
   if(client&&Object.keys(profile).length)tx.update(client.ref,{...profile,updatedAt:now});
   if(actor){const id=randomBytes(12).toString('hex');tx.create(db.collection('activitylogs').doc(id),{_id:id,userId:actor.id,userRole:actor.get('role'),userName:[actor.get('firstName'),actor.get('lastName')].filter(Boolean).join(' '),action:'Updated Client Information',actionType:'update',category:'other',description:`Updated ${collection}`,targetUserId:userId,createdAt:now,updatedAt:now});}
  };
  if(actorId){patch.updatedBy=actorId;patch.updatedByRole=staffRole||'admin';}
  if(current){
   updateProfile();const next={...patch,updatedAt:now};tx.update(current.ref,await prepareNativePatch(current.data(),next));
   return nativeJson({...await hydrateNativeDocument(current.data()),...next,_id:current.id});
  }
  // Deterministic ID plus transaction query prevents duplicate forms under concurrent upserts.
  const existing=await tx.get(ref);if(existing.exists)throw new Error('Client form identity conflict');
  const defaults=collection==='medicalinfos'?{medicalConditions:[],allergies:[],dietaryRestrictions:[],gutIssues:[],diseaseHistory:[],reports:[],isPregnant:false,isLactating:false}:collection==='lifestyleinfos'?{preferredCuisine:[],allergiesFood:[],fastDays:[],nonVegExemptDays:[],cookingOil:[]}:{};
  const data={...defaults,...patch,_id:ref.id,userId,...(date?{date}:{}),createdAt:now,updatedAt:now};
  updateProfile();tx.create(ref,await prepareNativeDocument(data));return nativeJson(data);
 });
}
export async function listNativeRecalls(db:MongoDatabase,userId:string){
 const rows=await db.collection('dietaryrecalls').where('userId','==',userId).orderBy('date','desc').limit(30).get();
 return Promise.all(rows.docs.map(async doc=>nativeJson({...await hydrateNativeDocument(doc.data()),_id:doc.id})));
}
