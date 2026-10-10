import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {listNativeUserNotes,saveNativeUserNote} from './native-user-notes';
import {readNativeUserTasks,saveNativeUserTask} from './native-user-tasks';
import {deleteNativeUserChild} from './native-user-children';
import {NativeDirectoryError} from './native-client-directory';
export async function nativeUserChildHandler(r:NextRequest,c:{params:Promise<{id:string;noteId?:string;taskId?:string}>},kind:'tasks'|'clientnotes',method:string){try{const s=await getServerSession(authOptions);if(!s?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});const p=await c.params,id=p.taskId||p.noteId;for(const v of [p.id,...(id?[id]:[])])if(!/^[a-f0-9]{24}$/i.test(v))throw new NativeDirectoryError('Invalid record ID');const db=getNativeDatabase();let result;if(method==='DELETE'){if(!id)throw new NativeDirectoryError('Record ID required');result=await deleteNativeUserChild(db,s.user.id,p.id,kind,id);}else if(kind==='tasks')result=method==='GET'?await readNativeUserTasks(db,s.user.id,p.id,id):await saveNativeUserTask(db,s.user.id,p.id,await r.json(),id,r.headers.get('x-idempotency-key')||undefined);else result=method==='GET'?await listNativeUserNotes(db,s.user.id,p.id):await saveNativeUserNote(db,s.user.id,p.id,await r.json(),id,r.headers.get('x-idempotency-key')||undefined);return nativeResponseJson(result,{status:method==='POST'&&!('replayed'in result)?201:200});}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to process record'},{status:e instanceof NativeDirectoryError?e.status:500});}}
