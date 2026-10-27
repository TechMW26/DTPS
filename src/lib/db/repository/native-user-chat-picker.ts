import type * as MongoTypes from '@/lib/db/mongo-types';
import {Filter,type MongoDatabase,type DocumentData} from '@/lib/db/mongo-types';
import {NativeDirectoryError,nativeDirectoryStatuses} from './native-client-directory';
import {canSendNativeMessage} from './native-messages';
export async function nativeUserChatPicker(db:MongoDatabase,actorId:string,p:URLSearchParams){const actor=await db.collection('users').doc(actorId).get(),role=actor.get('role');if(actor.get('status')!=='active')throw new NativeDirectoryError('Access denied',403);const bulk=p.get('forBulkMessage')==='true',requested=Number(p.get('limit')||100),limit=Math.min(500,requested),search=(p.get('search')||'').trim().toLowerCase();if(!Number.isSafeInteger(limit)||limit<1)throw new NativeDirectoryError('Invalid limit');let q:MongoTypes.Query=db.collection('users');
 if(bulk&&role==='client')throw new NativeDirectoryError('Staff access required',403);if(role==='client'){const id=actor.get('assignedDietitian');if(!id)return {users:[],total:0};q=q.where('__name__','==',id);}else if(role==='dietitian'||role==='health_counselor'){const primary=role==='dietitian'?'assignedDietitian':'assignedHealthCounselor',secondary=role==='dietitian'?'assignedDietitians':'assignedHealthCounselors',assigned=Filter.or(Filter.where(primary,'==',actorId),Filter.where(secondary,'array-contains',actorId));q=q.where(bulk?assigned:Filter.or(assigned,Filter.where('role','in',['admin','dietitian','health_counselor'])));}else if(role!=='admin')throw new NativeDirectoryError('Access denied',403);
 if(bulk)q=q.where('role','==','client');else if(p.get('role'))q=q.where('role','==',p.get('role'));
 if(bulk)return bulkRecipients(db,q,actor.data()!,actorId,search);
 // Literal substring search needs a minimal directory projection; no medical or credential fields are read.
 if(!search)q=q.orderBy('firstName').limit(limit+1);const docs=await q.select('firstName','lastName','email','avatar','role','clientStatus').get();let users:DocumentData[]=docs.docs.filter(d=>d.id!==actorId).map(d=>({_id:d.id,...d.data()}));if(search)users=users.filter(d=>[d.firstName,d.lastName,d.email,`${d.firstName||''} ${d.lastName||''}`].some(v=>String(v||'').toLowerCase().includes(search)));users.sort((a,b)=>`${a.firstName||''} ${a.lastName||''}`.localeCompare(`${b.firstName||''} ${b.lastName||''}`));users=users.slice(0,limit);
 if(!bulk){const existing=new Set<string>(),ids=users.map(d=>d._id);for(let i=0;i<ids.length;i+=30){const part=ids.slice(i,i+30);const [sent,received]=await Promise.all([db.collection('messages').where('sender','==',actorId).where('receiver','in',part).select('receiver').get(),db.collection('messages').where('receiver','==',actorId).where('sender','in',part).select('sender').get()]);for(const d of sent.docs)existing.add(d.get('receiver'));for(const d of received.docs)existing.add(d.get('sender'));}users=users.map(d=>({...d,hasExistingConversation:existing.has(d._id)}));}
 return {users,total:users.length};}
// Broadcast recipients: every client the sender may message, without a name sort or page cap.
// A name sort silently dropped clients with no firstName and the 500 cap cut long lists, so
// the list is loaded whole (staff lists are bounded by assignment) and sorted in memory.
// Status is computed from payments, the same way the client list shows it, because the stored
// clientStatus goes stale once a plan's end date passes. Accounts that cannot receive messages
// are left out so the selected count matches what is actually delivered.
const BULK_SCAN_LIMIT=20000;
async function bulkRecipients(db:MongoDatabase,q:MongoTypes.Query,actor:DocumentData,actorId:string,search:string){
 const docs=await q.limit(BULK_SCAN_LIMIT).select('firstName','lastName','name','email','avatar','role','status','isDeleted','clientStatus','holdStatus','assignedDietitian','assignedDietitians','assignedHealthCounselor','assignedHealthCounselors').get();
 let rows:DocumentData[]=docs.docs.filter(d=>d.id!==actorId&&canSendNativeMessage(actor,d.data(),actorId,d.id)).map(d=>{const v=d.data(),[first,...rest]=String(v.name||'').trim().split(/\s+/);return {_id:d.id,role:v.role,holdStatus:v.holdStatus,clientStatus:v.clientStatus,firstName:v.firstName||first||'Unnamed',lastName:v.firstName?(v.lastName||''):(v.lastName||rest.join(' ')),...(v.email?{email:v.email}:{}),...(v.avatar?{avatar:v.avatar}:{})};});
 if(search)rows=rows.filter(d=>[d.firstName,d.lastName,d.email,`${d.firstName} ${d.lastName}`].some(v=>String(v||'').toLowerCase().includes(search)));
 const users=(await nativeDirectoryStatuses(db,rows)).map(({holdStatus,...d})=>d);
 users.sort((a,b)=>`${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
 return {users,total:users.length};
}
