import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {NativeStaffClientError} from '@/lib/db/repository/native-staff-client';
import {nativeStaffDocuments} from '@/lib/db/repository/native-staff-documents';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest,{params}:{params:Promise<{clientId:string}>}){try{const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});const {clientId}=await params;return nativeResponseJson(await nativeStaffDocuments(getNativeDatabase(),session.user.id,clientId));}catch(e){return nativeResponseJson({error:e instanceof NativeStaffClientError?e.message:'Unable to fetch client documents'},{status:e instanceof NativeStaffClientError?e.status:500});}}
