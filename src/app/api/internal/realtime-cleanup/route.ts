import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {cleanupNativeTransientDocuments} from '@/lib/realtime/native-expiry';
export const maxDuration=60;
export async function GET(request:NextRequest){const expected=process.env.CRON_SECRET,actual=request.headers.get('authorization')||'';if(!expected||actual.length!==expected.length+7||!timingSafeEqual(Buffer.from(actual),Buffer.from('Bearer '+expected)))return nativeResponseJson({error:'Unauthorized'},{status:401});if(process.env.NODE_ENV!=='production')return nativeResponseJson({skipped:'local_cleanup_disabled'});try{return nativeResponseJson({deleted:await cleanupNativeTransientDocuments(getNativeDatabase())});}catch{return nativeResponseJson({error:'Transient cleanup failed'},{status:503});}}
