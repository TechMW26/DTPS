import {createHash,randomBytes} from 'node:crypto';
import bcrypt from 'bcryptjs';
import type {MongoDatabase,DocumentData} from '@/lib/db/mongo-types';

export class NativeDuplicateAccountError extends Error {
 constructor(){super('This phone number or email is already registered. Please sign in.');}
}
export function nativePhoneVariations(phone:string) {
 const digits=phone.replace(/^\+/,'');return [...new Set([phone,digits,...(phone.startsWith('+91')&&digits.length===12?[digits.slice(2)]:[])])];
}
function plainUser(id:string,data:DocumentData):DocumentData {const {password,...safe}=data;return {...safe,_id:id,fullName:`${data.firstName||''} ${data.lastName||''}`.trim()};}
export async function nativePhoneUser(db:MongoDatabase,phone:string,clientOnly=false,id?:string) {
 const variants=nativePhoneVariations(phone);
 if(id){if(id.includes('/'))return null;const doc=await db.collection('users').doc(id).get(),data=doc.data();return data&&variants.includes(data.phone)&&(!clientOnly||data.role==='client')?plainUser(doc.id,data):null;}
 let query=db.collection('users').where('phone','in',variants);if(clientOnly)query=query.where('role','==','client');
 const found=await query.limit(2).get();return found.size===1?plainUser(found.docs[0].id,found.docs[0].data()):null;
}
export async function nativeContactExists(db:MongoDatabase,phone:string,email?:string) {
 const [phones,emails]=await Promise.all([db.collection('users').where('phone','in',nativePhoneVariations(phone)).limit(1).get(),email?db.collection('users').where('email','==',email.trim().toLowerCase()).limit(1).get():null]);
 return phones.size>0||!!emails?.size;
}
function omitUndefined(value:any):any {
 if(Array.isArray(value))return value.map(v=>v===undefined?null:omitUndefined(v));
 if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype)return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>[k,omitUndefined(v)]));
 return value;
}
export async function createNativeAccount(db:MongoDatabase,input:DocumentData):Promise<DocumentData> {
 if(!['client','dietitian','health_counselor','admin'].includes(input.role)||typeof input.password!=='string'||!input.firstName?.trim()||!input.lastName?.trim()||!/^\+[1-9]\d{6,14}$/.test(input.phone||''))throw new Error('Invalid account details');
 const id=randomBytes(12).toString('hex'),password=await bcrypt.hash(input.password,12),email=typeof input.email==='string'?input.email.trim().toLowerCase():undefined;
 const variants=nativePhoneVariations(input.phone);
 const claims=[['phone',input.phone],...(email?[['email',email]]:[])].map(([kind,value])=>db.collection('_nativeUserKeys').doc(createHash('sha256').update(kind+'\0'+value).digest('hex')));
 return db.runTransaction(async tx=>{
  const locks=await tx.getAll(...claims);
  const phones=await tx.get(db.collection('users').where('phone','in',variants).limit(1));
  const emails=email?await tx.get(db.collection('users').where('email','==',email).limit(1)):null;
  if(locks.some(d=>d.exists)||phones.size||emails?.size)throw new NativeDuplicateAccountError();
  let clientId;
  const counter=db.collection('_nativeCounters').doc('clientIds');
  if(input.role==='client'){
   const sequence=await tx.get(counter);const seq=sequence.get('seq');
   if(!Number.isSafeInteger(seq)||seq<0)throw new Error('Native client counter must be initialized from the verified source snapshot');
   clientId='C-'+(seq+1);tx.update(counter,{seq:seq+1});
  }
  const now=new Date();
  const data=omitUndefined({status:'active',clientStatus:'lead',emailVerified:false,onboardingCompleted:false,holdStatus:{isOnHold:false,totalHoldDurationMs:0,holdCount:0},...input,firstName:input.firstName.trim(),lastName:input.lastName.trim(),email,password,_id:id,...(clientId?{clientId}:{}),createdAt:now,updatedAt:now});
  tx.create(db.collection('users').doc(id),data);
  for(const ref of claims)tx.create(ref,{userId:id,createdAt:now});
  return plainUser(id,data);
 });
}
