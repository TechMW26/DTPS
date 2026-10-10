import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeTopDietitians} from '@/lib/db/repository/native-top-dietitians';
import {withJsonCache} from '@/lib/cache/json-cache';
export async function GET(request:NextRequest){
 try{
  const session=await getServerSession(authOptions);if(session?.user?.role!=='admin')return nativeResponseJson({error:'Admin access required'},{status:403});
  const value=request.nextUrl.searchParams.get('limit')||'10',limit=value==='all'?null:Number(value);
  if(limit!==null&&(!Number.isSafeInteger(limit)||limit<1||limit>200))return nativeResponseJson({error:'Invalid limit'},{status:400});
  const result=await withJsonCache('native:top-dietitians',()=>nativeTopDietitians(getNativeDatabase(),null),{ttl:30000,tags:['native-dashboard'],localFallback:true});
  return nativeResponseJson({...result,topDietitians:limit===null?result.topDietitians:result.topDietitians.slice(0,limit)});
 }catch{return nativeResponseJson({error:'Unable to load staff activity'},{status:503});}
}
