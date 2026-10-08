import {nativeResponseJson} from '@/lib/api/native-response';
import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeRecentActivity} from '@/lib/db/repository/native-recent-activity';
import {withJsonCache} from '@/lib/cache/json-cache';
export async function GET(){try{const session=await getServerSession(authOptions);if(session?.user?.role!=='admin')return nativeResponseJson({error:'Admin access required'},{status:403});return nativeResponseJson({activities:await withJsonCache('native:recent-activity',()=>nativeRecentActivity(getNativeDatabase()),{ttl:15000,tags:['native-dashboard'],localFallback:true})});}catch{return nativeResponseJson({error:'Unable to load recent activity'},{status:503});}}
