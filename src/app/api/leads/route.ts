import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {readNativeLeads,writeNativeLead} from '@/lib/db/repository/native-admin-leads';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
export async function POST(r:NextRequest){try{return nativeResponseJson(await writeNativeLead(getNativeDatabase(),await r.json(),undefined,undefined,false,r.headers.get('x-forwarded-for')?.split(',')[0]||'local'));}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to submit lead'},{status:e instanceof NativeDirectoryError?e.status:500});}}
