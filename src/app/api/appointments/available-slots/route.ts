import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeAvailableSlots} from '@/lib/db/repository/native-staff-availability';
import {NativeStaffClientError} from '@/lib/db/repository/native-staff-client';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeStaffClientError('Unauthorized',401);return nativeResponseJson(await nativeAvailableSlots(getNativeDatabase(),session.user.id,req.nextUrl.searchParams));}catch(e){return nativeResponseJson({error:e instanceof NativeStaffClientError?e.message:'Unable to fetch slots'},{status:e instanceof NativeStaffClientError?e.status:500});}}
