import {createHash,createHmac,randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
import type {MongoDatabase} from '@/lib/db/mongo-types';
import {OTP_CONFIG} from '@/lib/auth/otpStore';
const key=(phone:string)=>createHash('sha256').update(phone).digest('hex');
function digest(phone:string,nonce:string,otp:string) {const secret=process.env.NEXTAUTH_SECRET;if(!secret)throw new Error('OTP secret is required');return createHmac('sha256',secret).update(phone+'\0'+nonce+'\0'+otp).digest('hex');}
export async function issueNativeOtp(db:MongoDatabase,phone:string,purpose:'login'|'signup') {
 const id=key(phone),nonce=randomBytes(16).toString('hex'),otp=randomInt(1000,10000).toString(),hash=digest(phone,nonce,otp);
 const challenge=db.collection('_nativeOtpChallenges').doc(id),limit=db.collection('_nativeOtpLimits').doc(id);
 return db.runTransaction(async tx=>{
  const doc=await tx.get(limit),now=Date.now();const active=(doc.get('resetAt')?.toMillis?.()||0)>now;
  const count=active?doc.get('count')||0:0;
  if(count>=OTP_CONFIG.MAX_REQUESTS_PER_HOUR)return null;
  tx.set(limit,{count:count+1,resetAt:active?doc.get('resetAt'):new Date(now+3600000)});
  tx.set(challenge,{phone,purpose,nonce,hash,attempts:0,createdAt:new Date(now),expiresAt:new Date(now+OTP_CONFIG.EXPIRY_MS)});
  return {id,nonce,otp};
 });
}
export async function cancelNativeOtp(db:MongoDatabase,id:string,nonce:string) {
 const ref=db.collection('_nativeOtpChallenges').doc(id);
 await db.runTransaction(async tx=>{const doc=await tx.get(ref);if(doc.get('nonce')===nonce)tx.delete(ref);});
}
export async function consumeNativeOtp(db:MongoDatabase,phone:string,purpose:'login'|'signup',otp:string) {
 if(!/^\d{4}$/.test(otp))return {ok:false,reason:'format'} as const;
 const ref=db.collection('_nativeOtpChallenges').doc(key(phone));
 return db.runTransaction(async tx=>{
  const doc=await tx.get(ref),data=doc.data();if(!data)return {ok:false,reason:'missing'} as const;
  if(data.purpose!==purpose)return {ok:false,reason:'purpose'} as const;
  if(!data.expiresAt?.toMillis || data.expiresAt.toMillis()<=Date.now()){tx.delete(ref);return {ok:false,reason:'expired'} as const;}
  if(data.attempts>=OTP_CONFIG.MAX_ATTEMPTS){tx.delete(ref);return {ok:false,reason:'attempts'} as const;}
  const expected=Buffer.from(String(data.hash)),actual=Buffer.from(digest(phone,data.nonce,otp));
  if(expected.length!==actual.length||!timingSafeEqual(expected,actual)){
   const remaining=OTP_CONFIG.MAX_ATTEMPTS-data.attempts-1;tx.update(ref,{attempts:data.attempts+1});return {ok:false,reason:'incorrect',remaining} as const;
  }
  tx.delete(ref);return {ok:true} as const;
 });
}
