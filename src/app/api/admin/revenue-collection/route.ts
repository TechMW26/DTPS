import {nativeResponseJson} from '@/lib/api/native-response';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeRevenueCollection} from '@/lib/db/repository/native-revenue-collection';
import {withJsonCache} from '@/lib/cache/json-cache';

/** Admin dashboard: last 12 months of billed vs collected payments. Read-only, cached for 5 minutes. */
export async function GET(){
 try{
  const session=await getServerSession(authOptions);if(session?.user?.role!=='admin')return nativeResponseJson({error:'Admin access required'},{status:403});
  const result=await withJsonCache('native:revenue-collection',()=>nativeRevenueCollection(getNativeDatabase()),{ttl:300000,tags:['native-dashboard'],localFallback:true});
  return nativeResponseJson(result);
 }catch{return nativeResponseJson({error:'Unable to load revenue and collection'},{status:503});}
}
