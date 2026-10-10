import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {uploadNativeMedicalReport} from '@/lib/db/repository/native-user-medical-upload';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
export async function POST(r:NextRequest,c:{params:Promise<{id:string}>}){try{const s=await getServerSession(authOptions);if(!s?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});const {id}=await c.params;if(!/^[a-f0-9]{24}$/i.test(id))throw new NativeDirectoryError('Invalid user ID');const f=await r.formData();return nativeResponseJson(await uploadNativeMedicalReport(getNativeDatabase(),s.user.id,id,f.get('file') as File,String(f.get('fileName')||''),String(f.get('category')||'medical-report')));}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to upload report'},{status:e instanceof NativeDirectoryError?e.status:500});}}
