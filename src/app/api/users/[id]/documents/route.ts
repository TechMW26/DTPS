import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {readNativeUserDocuments,uploadNativeUserDocument,removeNativeUserDocument} from '@/lib/db/repository/native-user-documents';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
type Context={params:Promise<{id:string}>};
async function handle(r:NextRequest,c:Context,method:string){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});const {id}=await c.params;if(!/^[a-f0-9]{24}$/i.test(id))throw new NativeDirectoryError('Invalid user ID');const db=getNativeDatabase();let documents;if(method==='GET')documents=await readNativeUserDocuments(db,session.user.id,id);else if(method==='POST'){const form=await r.formData();documents=await uploadNativeUserDocument(db,session.user.id,id,String(form.get('type')||''),form.get('file') as File);}else{const p=r.nextUrl.searchParams;documents=await removeNativeUserDocument(db,session.user.id,id,{filePath:p.get('filePath')||undefined,index:p.has('index')?Number(p.get('index')):undefined});}return nativeResponseJson({documents,...(method!=='GET'?{message:method==='POST'?'Document uploaded successfully':'Document deleted successfully'}:{})});}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to process documents'},{status:e instanceof NativeDirectoryError?e.status:500});}}
export const GET=(r:NextRequest,c:Context)=>handle(r,c,'GET');
export const POST=(r:NextRequest,c:Context)=>handle(r,c,'POST');
export const DELETE=(r:NextRequest,c:Context)=>handle(r,c,'DELETE');
