import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeUserClientList} from '@/lib/db/repository/native-user-client-list';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
export async function GET(r:NextRequest){try{const s=await getServerSession(authOptions);if(!s?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});return nativeResponseJson(await nativeUserClientList(getNativeDatabase(),s.user.id,r.nextUrl.searchParams));}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to load clients'},{status:e instanceof NativeDirectoryError?e.status:500});}}
