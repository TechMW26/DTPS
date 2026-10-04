import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativePurchaseEligibility} from '@/lib/db/repository/native-purchase-eligibility';
import {nativeFinanceActor} from '@/lib/db/repository/native-finance-access';
import {NativeCheckoutError} from '@/lib/db/repository/native-checkout';
import {checkPermission} from '@/lib/permissions/check';
import {PermissionKey} from '@/types/permissions';
import {UserRole} from '@/types';
export async function GET(request:NextRequest){try{
 const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 const db=getNativeDatabase(),actor=await nativeFinanceActor(db,session.user.id),permission=await checkPermission(actor.id,actor.role as UserRole,PermissionKey.CREATE_MEAL_PLANS);
 return nativeResponseJson(await nativePurchaseEligibility(db,actor.id,request.nextUrl.searchParams.get('clientId')||'',Number(request.nextUrl.searchParams.get('requestedDays')||0),permission.hasPermission),{headers:{'Cache-Control':'no-store'}});
 }catch(error){return nativeResponseJson({error:error instanceof NativeCheckoutError?error.message:'Unable to check plan eligibility'},{status:error instanceof NativeCheckoutError?error.status:503});}}
