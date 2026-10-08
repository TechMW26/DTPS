import {nativeResponseJson} from '@/lib/api/native-response';
import {withJsonCache} from '@/lib/cache/json-cache';
import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeAdminStats} from '@/lib/db/repository/native-admin-stats';
export async function GET(){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});if(session.user.role!=='admin')return nativeResponseJson({error:'Admin access required'},{status:403});return nativeResponseJson(await withJsonCache('native:admin-dashboard',()=>nativeAdminStats(getNativeDatabase()),{ttl:30000,tags:['native-dashboard'],localFallback:true}),{headers:{'Cache-Control':'private, no-store'}});}catch{return nativeResponseJson({error:'Unable to load dashboard statistics'},{status:503});}}
