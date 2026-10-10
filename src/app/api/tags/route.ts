import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {listNativeTags,saveNativeTag} from '@/lib/db/repository/native-tags';
import {tagError} from '@/lib/db/repository/native-tags-route';
export async function GET(){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});const db=getNativeDatabase(),actor=await db.collection('users').doc(session.user.id).get();if(actor.get('status')!=='active')return nativeResponseJson({error:'Access denied'},{status:403});const tags=await listNativeTags(db,'admin',null);return nativeResponseJson({tags,count:tags.length});}catch(e){return tagError(e);}}
export async function POST(r:NextRequest){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});const tag=await saveNativeTag(getNativeDatabase(),session.user.id,await r.json());return nativeResponseJson({message:'Tag created successfully',tag},{status:201});}catch(e){return tagError(e);}}
