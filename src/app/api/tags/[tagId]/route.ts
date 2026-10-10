import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {getNativeTag,saveNativeTag,deleteNativeTag} from '@/lib/db/repository/native-tags';
import {tagError} from '@/lib/db/repository/native-tags-route';
type Context={params:Promise<{tagId:string}>};
async function handle(r:NextRequest,c:Context,method:string){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});const db=getNativeDatabase(),id=(await c.params).tagId;if(method==='DELETE'){await deleteNativeTag(db,id,session.user.id);return nativeResponseJson({message:'Tag deleted successfully'});}if(method==='PATCH')return nativeResponseJson({message:'Tag updated successfully',tag:await saveNativeTag(db,session.user.id,await r.json(),id)});const actor=await db.collection('users').doc(session.user.id).get();if(actor.get('status')!=='active')return nativeResponseJson({error:'Access denied'},{status:403});return nativeResponseJson({tag:await getNativeTag(db,id)});}catch(e){return tagError(e);}}
export const GET=(r:NextRequest,c:Context)=>handle(r,c,'GET');
export const PATCH=(r:NextRequest,c:Context)=>handle(r,c,'PATCH');
export const DELETE=(r:NextRequest,c:Context)=>handle(r,c,'DELETE');
