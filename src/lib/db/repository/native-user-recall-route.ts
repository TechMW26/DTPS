import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {readNativeUserRecall,writeNativeUserRecall} from './native-user-recall';
import {NativeDirectoryError} from './native-client-directory';
export async function nativeUserRecallHandler(r:NextRequest,c:{params:Promise<{id:string;recallId?:string}>},method:string){try{const s=await getServerSession(authOptions);if(!s?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});const {id,recallId}=await c.params;for(const value of [id,...(recallId?[recallId]:[])])if(!/^[a-f0-9]{24}$/i.test(value))throw new NativeDirectoryError('Invalid record ID');const db=getNativeDatabase();const remove=method==='DELETE'?r.nextUrl.searchParams.get('mealType'):undefined;if(method==='DELETE'&&!remove)throw new NativeDirectoryError('Meal type required');return nativeResponseJson(method==='GET'?await readNativeUserRecall(db,s.user.id,id):await writeNativeUserRecall(db,s.user.id,id,method==='DELETE'?{}:await r.json(),recallId,remove||undefined),{status:method==='POST'?201:200});}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to process recall'},{status:e instanceof NativeDirectoryError?e.status:500});}}
