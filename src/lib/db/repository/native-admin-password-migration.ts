import {randomBytes} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {FieldPath,type Firestore} from 'firebase-admin/firestore';
import {requireNativeAuditAdmin} from './native-admin-audit';
import {NativeDirectoryError} from './native-client-directory';
const weak=(value:unknown)=>!value||/^Password\d{3}$/i.test(String(value));
export async function nativeCommercePasswordStatus(db:Firestore,actorId:string){
 await requireNativeAuditAdmin(db,actorId);const docs=await db.collection('woocommerceclients').select('password','name','email').get();const ready=docs.docs.filter(d=>!weak(d.get('password')));return {totalClients:docs.size,clientsWithPasswords:ready.length,clientsWithoutPasswords:docs.size-ready.length,passwordsComplete:ready.length===docs.size,sampleClients:ready.slice(0,5).map(d=>({name:d.get('name'),email:d.get('email')}))};
}
/** Bounded, resumable remediation. Passwords are never returned or sent. */
export async function migrateNativeCommercePasswords(db:Firestore,actorId:string,cursor?:string){
 await requireNativeAuditAdmin(db,actorId);if(cursor&&!/^[a-f0-9]{24}$/i.test(cursor))throw new NativeDirectoryError('Invalid cursor');let query=db.collection('woocommerceclients').orderBy(FieldPath.documentId()).select('password').limit(100);if(cursor)query=query.startAfter(cursor);const docs=await query.get();let updatedCount=0;
 for(const doc of docs.docs){if(!weak(doc.get('password')))continue;const hash=await bcrypt.hash(randomBytes(32).toString('base64url'),12);const changed=await db.runTransaction(async tx=>{const [admin,current]=await tx.getAll(db.collection('users').doc(actorId),doc.ref);if(admin.get('role')!=='admin'||admin.get('status')!=='active')throw new NativeDirectoryError('Forbidden',403);if(!current.exists||!weak(current.get('password')))return false;tx.update(doc.ref,{password:hash,requirePasswordReset:true,logoutOtherSessionsAt:new Date(),keepCurrentSessionId:'',updatedAt:new Date()});return true;});if(changed)updatedCount++;}
 return {message:'Password remediation batch processed; affected clients must reset their password.',updatedCount,totalClients:docs.size,nextCursor:docs.size===100?docs.docs.at(-1)!.id:null,complete:docs.size<100};
}
