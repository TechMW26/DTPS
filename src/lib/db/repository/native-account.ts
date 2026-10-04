import type {Firestore,DocumentSnapshot} from 'firebase-admin/firestore';
import bcrypt from 'bcryptjs';
import {FieldValue} from 'firebase-admin/firestore';

export async function nativeAccountByEmail(db:Firestore,email:string) {
 const result=await db.collection('users').where('email','==',email.trim().toLowerCase()).limit(2).get();
 if(result.size!==1)return null;
 const doc=result.docs[0];return {_id:doc.id,firstName:doc.get('firstName') as string|undefined,role:doc.get('role') as string,email:doc.get('email') as string};
}
export async function setNativeResetToken(db:Firestore,id:string,hash:string,expires:Date) {
 await db.collection('users').doc(id).update({passwordResetToken:hash,passwordResetTokenExpiry:expires,updatedAt:new Date()});
}
function validReset(doc:DocumentSnapshot,hash:string,now:number) {
 const data=doc.data(),expiry=data?.passwordResetTokenExpiry;
 const milliseconds=expiry?.toMillis?expiry.toMillis():expiry instanceof Date?expiry.getTime():NaN;
 return !!data && data.passwordResetToken===hash && Number.isFinite(milliseconds) && milliseconds>now;
}
export async function validateNativeReset(db:Firestore,email:string,hash:string,requiredRole?:string) {
 const user=await nativeAccountByEmail(db,email);if(!user)return null;
 const doc=await db.collection('users').doc(user._id).get();return validReset(doc,hash,Date.now())&&(!requiredRole||doc.get('role')===requiredRole)?user:null;
}
export async function consumeNativeReset(db:Firestore,email:string,hash:string,password:string,requiredRole?:string) {
 const user=await nativeAccountByEmail(db,email);if(!user)return null;
 const encoded=await bcrypt.hash(password,12),ref=db.collection('users').doc(user._id);
 return db.runTransaction(async tx=>{
  const doc=await tx.get(ref);if(!validReset(doc,hash,Date.now()) || requiredRole&&doc.get('role')!==requiredRole || doc.get('email')!==email.trim().toLowerCase())return null;
  tx.update(ref,{password:encoded,passwordResetToken:FieldValue.delete(),passwordResetTokenExpiry:FieldValue.delete(),logoutOtherSessionsAt:new Date(),keepCurrentSessionId:'',updatedAt:new Date()});
  return {_id:doc.id,role:doc.get('role') as string};
 });
}
export async function revokeNativeOtherSessions(db:Firestore,id:string,keepSessionId:string,commerce=false) {
 if(!id||id.includes('/'))throw new Error('Invalid account ID');
 await db.collection(commerce?'woocommerceclients':'users').doc(id).update({logoutOtherSessionsAt:new Date(),keepCurrentSessionId:keepSessionId,updatedAt:new Date()});
}

export class NativeAccountError extends Error {constructor(message:string,public status:number){super(message);}}
export async function adminResetNativePassword(db:Firestore,adminId:string,userId:string,password:unknown){
 if(!/^[a-f0-9]{24}$/.test(adminId)||!/^[a-f0-9]{24}$/.test(userId))throw new NativeAccountError('Invalid user ID',400);
 if(typeof password!=='string'||password.length<4||Buffer.byteLength(password,'utf8')>72)throw new NativeAccountError('Password must be at least 4 characters and at most 72 bytes',400);
 const encoded=await bcrypt.hash(password,12);
 return db.runTransaction(async tx=>{
  const [admin,user]=await tx.getAll(db.collection('users').doc(adminId),db.collection('users').doc(userId));
  if(admin.get('role')!=='admin'||admin.get('status')!=='active')throw new NativeAccountError('Admin access required',403);
  if(!user.exists)throw new NativeAccountError('User not found',404);
  const now=new Date();
  tx.update(user.ref,{password:encoded,passwordResetToken:FieldValue.delete(),passwordResetTokenExpiry:FieldValue.delete(),logoutOtherSessionsAt:now,keepCurrentSessionId:'',updatedAt:now});
  tx.create(db.collection('adminauditlogs').doc(),{adminId,targetUserId:userId,action:'password-reset',createdAt:now});
  return {name:[user.get('firstName'),user.get('lastName')].filter(Boolean).join(' ')};
 });
}
