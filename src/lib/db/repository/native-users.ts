import { timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { type Firestore, Timestamp } from 'firebase-admin/firestore';

const publicFields = ['email','firstName','lastName','role','status','avatar','emailVerified','onboardingCompleted'] as const;

function profile(id: string, data: FirebaseFirestore.DocumentData) {
  const fields = Object.fromEntries(publicFields.filter(key=>data[key]!==undefined).map(key=>[key,data[key]]));
  return {...fields,_id:id,fullName:`${data.firstName||''} ${data.lastName||''}`.trim()};
}

export async function nativeUserProfile(db: Firestore, id: string) {
  if(!id || id.includes('/')) throw new Error('Invalid user ID');
  const doc = await db.collection('users').doc(id).get();
  return doc.exists ? profile(doc.id,doc.data()!) : null;
}

/** Authenticate on the server; passwords/tokens must never be included in returned profiles. */
export async function authenticateNativeUser(db: Firestore, email: string, password: string, context: 'staff'|'client') {
  if(!email.trim() || !password) return null;
  const matches = await db.collection('users').where('email','==',email.trim().toLowerCase()).limit(2).get();
  // Ambiguous legacy accounts need review; never authenticate an arbitrary duplicate.
  if(matches.size !== 1) return null;
  const doc = matches.docs[0], data = doc.data();
  if(data.status !== 'active' || (context==='client') !== (data.role==='client')) return null;
  const stored = data.password;
  if(typeof stored!=='string' || !stored) return null;
  let valid=false;
  if(/^\$2[aby]\$/.test(stored)) valid=await bcrypt.compare(password,stored);
  else {
    // Keep historical account access during migration, then replace plaintext on successful login.
    const candidate=Buffer.from(password), original=Buffer.from(stored);
    valid=candidate.length===original.length && timingSafeEqual(candidate,original);
  }
  if(!valid) return null;
  const replacement = /^\$2[aby]\$/.test(stored) ? undefined : await bcrypt.hash(password,12);
  return db.runTransaction(async tx=>{
    const current=(await tx.get(doc.ref)).data();
    // Do not accept a password, role or account status changed during authentication.
    if(!current || current.password!==stored || current.status!=='active' || current.role!==data.role) return null;
    tx.update(doc.ref,{lastLoginAt:Timestamp.now(),...(replacement?{password:replacement}:{})});
    return profile(doc.id,current);
  });
}
