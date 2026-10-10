import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse,after} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {getNativeDatabase} from '@/lib/db/database';
import {completeNativeOnboarding,NativeOnboardingError} from '@/lib/db/repository/native-onboarding';
import {grantDietPlanAccessIfPublished} from '@/lib/auth/onboarding-access';
import {logActivity} from '@/lib/utils/activityLogger';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){
 try{const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 const result=await completeNativeOnboarding(getNativeDatabase(),session.user.id,await request.json());
 if(!result.alreadyCompleted)after(async()=>{await logActivity({userId:session.user.id,userRole:'client',userName:session.user.name||'',userEmail:session.user.email||'',action:'Completed Onboarding',actionType:'update',category:'profile',description:'Client completed onboarding.'});});
 return nativeResponseJson({success:true,message:result.alreadyCompleted?'Onboarding already completed':'Onboarding completed successfully',onboardingCompleted:true,requireSessionRefresh:true,...result});
 }catch(error){return nativeResponseJson({error:error instanceof NativeOnboardingError?error.message:'Failed to complete onboarding'},{status:error instanceof NativeOnboardingError?error.status:503});}
}
export async function GET(){
 try{const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 const user=await getNativeDatabase().collection('users').doc(session.user.id).get();if(!user.exists)return nativeResponseJson({error:'User not found'},{status:404});
 const completed=user.get('onboardingCompleted')===true,dietPlanOverride=!completed?await grantDietPlanAccessIfPublished(session.user.id):false;
 return nativeResponseJson({onboardingCompleted:completed||dietPlanOverride,onboardingStep:user.get('onboardingStep')||0,dietPlanOverride},{headers:{'Cache-Control':'no-store'}});
 }catch{return nativeResponseJson({error:'Failed to fetch onboarding status'},{status:503});}
}
