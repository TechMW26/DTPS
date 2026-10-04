import {nativeResponseJson} from '@/lib/api/native-response';
import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeAnalyticsStats} from '@/lib/db/repository/native-admin-analytics';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
export async function GET(){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});return nativeResponseJson(await nativeAnalyticsStats(getNativeDatabase(),session.user.id));}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to fetch analytics'},{status:e instanceof NativeDirectoryError?e.status:500});}}
