import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeStaffDirectory} from './native-staff-directory';
export function staffDirectoryHandler(role:'dietitian'|'health_counselor'){
 return async(req:NextRequest)=>{try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});if(session.user.role!=='admin')return nativeResponseJson({error:'Admin access required'},{status:403});const people=await nativeStaffDirectory(getNativeDatabase(),role,req.nextUrl.searchParams.get('search')||'');return nativeResponseJson(role==='dietitian'?{dietitians:people}:{success:true,healthCounselors:people},{headers:{'Cache-Control':'private, no-store'}});}catch{return nativeResponseJson({error:'Unable to load staff directory'},{status:500});}};
}
