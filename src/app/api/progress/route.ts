import type * as MongoTypes from '@/lib/db/mongo-types';
import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {saveNativeProgress} from '@/lib/db/repository/native-progress';
import {taskClientAccess} from '@/lib/db/repository/native-staff-tasks';
import {nativeDates} from '@/lib/db/repository/native-plan-editor';
import {nativeJson} from '@/lib/db/repository/native-history';
import {hydrateNativeDocument} from '@/lib/storage/native-document';
import {nativeMediaJson} from '@/lib/api/native-media-json';
import {NativeProgressError} from '@/lib/db/repository/native-progress';
const fail=(e:any)=>nativeResponseJson({error:e?.status?e.message:'Progress operation failed'},{status:e?.status||503});
export async function GET(request:NextRequest){try{
 const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 const db=getNativeDatabase(),actor=await db.collection('users').doc(session.user.id).get();if(!actor.exists||['inactive','deleted'].includes(actor.get('status')))throw new NativeProgressError('Unauthorized',401);
 const p=request.nextUrl.searchParams,clientId=actor.get('role')==='client'?session.user.id:p.get('clientId');if(clientId)await taskClientAccess(db,session.user.id,clientId);else if(actor.get('role')!=='admin')throw new NativeProgressError('Client ID required',400);
 let query:MongoTypes.Query=db.collection('progressentries');if(clientId)query=query.where('user','==',clientId);if(p.get('type'))query=query.where('type','==',p.get('type'));
 for(const [key,operator]of [['startDate','>='],['endDate','<=']]as const)if(p.get(key)){const date=new Date(p.get(key)!);if(!Number.isFinite(date.getTime()))throw new NativeProgressError('Invalid date',400);query=query.where('recordedAt',operator,date);}
 const page=Math.max(1,Math.floor(Number(p.get('page'))||1)),limit=Math.min(100,Math.max(1,Math.floor(Number(p.get('limit'))||50)));
 const all=await query.orderBy('recordedAt','desc').select('type','deletedAt','recordedAt').get(),visible=all.docs.filter(row=>!row.get('deletedAt')),latest=new Map();for(const row of visible)if(!latest.has(row.get('type')))latest.set(row.get('type'),row);
 const selected=visible.slice((page-1)*limit,page*limit),ids=[...new Set([...selected,...latest.values()].map(row=>row.id))],records=new Map<string,any>();for(let i=0;i<ids.length;i+=100)for(const row of await db.getAll(...ids.slice(i,i+100).map(id=>db.collection('progressentries').doc(id))))if(row.exists)records.set(row.id,{...nativeDates(await hydrateNativeDocument(row.data()!)),_id:row.id});
 const userIds=[...new Set<string>([...records.values()].map(row=>row.user))],users=new Map();for(let i=0;i<userIds.length;i+=100)for(const row of await db.getAll(...userIds.slice(i,i+100).map(id=>db.collection('users').doc(id)),{fieldMask:['firstName','lastName']}))users.set(row.id,{_id:row.id,...row.data()});
 const clean=(row:any)=>{const data={...row};delete data._nativeSource;delete data._nativeExternalFields;return data;};
 return nativeResponseJson(await nativeMediaJson(db,nativeJson({progressEntries:selected.map(row=>({...clean(records.get(row.id)),user:users.get(records.get(row.id).user)})),latestEntries:Object.fromEntries([...latest].map(([type,row])=>[type,clean(records.get(row.id))])),pagination:{page,limit,total:visible.length,pages:Math.ceil(visible.length/limit)}})));
 }catch(e){return fail(e);}}
export async function POST(request:NextRequest){try{const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});const db=getNativeDatabase();await taskClientAccess(db,session.user.id,session.user.id);const result=await saveNativeProgress(db,session.user.id,await request.json(),request.headers.get('idempotency-key'));return nativeResponseJson(nativeJson(result.entries[0]),{status:result.created?201:200});}catch(e){return fail(e);}}
