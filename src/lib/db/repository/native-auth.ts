import {randomBytes,timingSafeEqual} from 'node:crypto';
import bcrypt from 'bcryptjs';
import type {Firestore,DocumentSnapshot,DocumentData} from 'firebase-admin/firestore';
import {FieldValue} from 'firebase-admin/firestore';

export type LoginContext='staff'|'client'|undefined;
const fields=['email','firstName','lastName','role','status','avatar','emailVerified','onboardingCompleted'] as const;
function identity(doc:DocumentSnapshot):DocumentData {
  const data=doc.data()!;
  return {...Object.fromEntries(fields.filter(k=>data[k]!==undefined).map(k=>[k,data[k]])),_id:doc.id,fullName:`${data.firstName||''} ${data.lastName||''}`.trim()};
}
function allowed(role:string,context:LoginContext) {
  return (!context || (context==='client')===(role==='client')) && ['admin','dietitian','health_counselor','client'].includes(role);
}
function validId(id:string){if(!id||id.includes('/'))throw new Error('Invalid account ID');}
async function matches(password:string,stored:unknown) {
  if(typeof stored!=='string'||!stored)return false;
  if(/^\$2[aby]\$/.test(stored))return bcrypt.compare(password,stored);
  const a=Buffer.from(password),b=Buffer.from(stored);return a.length===b.length&&timingSafeEqual(a,b);
}
export async function nativePasswordLogin(db:Firestore,email:string,password:string,context:LoginContext):Promise<DocumentData|null> {
  if(!email.trim()||!password)return null;
  const found=await db.collection('users').where('email','==',email.trim().toLowerCase()).limit(2).get();
  if(found.size>1)return null;
  if(found.size===1) {
    const doc=found.docs[0],data=doc.data();
    if(data.status!=='active'||!allowed(data.role,context)||!await matches(password,data.password))return null;
    const replacement=/^\$2[aby]\$/.test(data.password)?undefined:await bcrypt.hash(password,12);
    return db.runTransaction(async tx=>{
      const current=await tx.get(doc.ref),value=current.data();
      if(!value||value.password!==data.password||value.role!==data.role||value.status!=='active')return null;
      tx.update(doc.ref,{lastLoginAt:new Date(),...(replacement?{password:replacement}:{})});return identity(current);
    });
  }
  // Legacy commerce credentials remain usable only when no main account exists.
  if(context==='staff')return null;
  const woo=await db.collection('woocommerceclients').where('email','==',email.trim().toLowerCase()).limit(2).get();
  if(woo.size!==1)return null;
  const doc=woo.docs[0],data=doc.data();
  if((data.status&&data.status!=='active')||!await matches(password,data.password))return null;
  const replacement=/^\$2[aby]\$/.test(data.password)?undefined:await bcrypt.hash(password,12);
  return db.runTransaction(async tx=>{
    const current=await tx.get(doc.ref),value=current.data();
    if(!value||value.password!==data.password||(value.status&&value.status!=='active'))return null;
    tx.update(doc.ref,{lastLoginAt:new Date(),...(replacement?{password:replacement}:{})});
    const name=String(value.name||'');
    return {_id:doc.id,email:value.email,fullName:name,role:'client',status:'active',firstName:name.split(' ')[0],lastName:name.split(' ').slice(1).join(' '),emailVerified:true,onboardingCompleted:true,isWooCommerceClient:true,...Object.fromEntries(['phone','city','country','totalOrders','totalSpent'].filter(k=>value[k]!==undefined).map(k=>[k,value[k]]))};
  });
}
export async function nativeOtpLogin(db:Firestore,id:string,context:LoginContext) {
  validId(id);const ref=db.collection('users').doc(id);
  return db.runTransaction(async tx=>{const doc=await tx.get(ref),data=doc.data();if(!data||data.status!=='active'||!allowed(data.role,context))return null;tx.update(ref,{lastLoginAt:new Date()});return identity(doc);});
}
export async function nativeSessionStatus(db:Firestore,id:string,commerce=false) {
  validId(id);const ref=db.collection(commerce?'woocommerceclients':'users').doc(id);
  const doc=await ref.get(),data=doc.data();if(!data)return null;
  const raw=data.logoutOtherSessionsAt;
  const date=raw?.toDate?raw.toDate():raw instanceof Date?raw:undefined;
  return {status:data.status||(commerce?'active':'inactive'),logoutOtherSessionsAt:date,keepCurrentSessionId:data.keepCurrentSessionId as string|undefined};
}
export async function recordNativeLogin(db:Firestore,entry:DocumentData) {
  // Match existing public ID format without retaining an ObjectId runtime dependency.
  const id=randomBytes(12).toString('hex'),now=new Date();
  const clean=JSON.parse(JSON.stringify(entry));
  await db.collection('activitylogs').doc(id).create({...clean,_id:id,createdAt:now,updatedAt:now,isRead:false});
}
export async function saveNativeCalendarCredentials(db:Firestore,id:string,account:{access_token?:string;refresh_token?:string;expires_at?:number}) {
  validId(id);const ref=db.collection('users').doc(id);
  await db.runTransaction(async tx=>{const doc=await tx.get(ref);if(!doc.exists)return;tx.update(ref,{
    ...(account.access_token?{googleCalendarAccessToken:account.access_token}:{}),
    ...(account.refresh_token?{googleCalendarRefreshToken:account.refresh_token}:{}),
    ...(account.expires_at?{googleCalendarTokenExpiry:new Date(account.expires_at*1000)}:{}),updatedAt:FieldValue.serverTimestamp(),
  });});
}
export async function nativeOnboardingStatus(db:Firestore,id:string) {
  validId(id);const user=await db.collection('users').doc(id).get();return Boolean(user.get('onboardingCompleted'));
}
