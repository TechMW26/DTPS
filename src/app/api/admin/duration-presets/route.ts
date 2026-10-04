import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeDurationPresets,seedNativeDurationPresets,reorderNativeDurationPresets,PresetInputError} from '@/lib/db/repository/native-duration-presets';
async function admin(){const session=await getServerSession(authOptions);return session?.user?.role==='admin'?session.user:null;}
const denied=()=>nativeResponseJson({error:'Admin access required'},{status:403});
export async function GET(){
 try{if(!await admin())return denied();return nativeResponseJson({success:true,presets:await nativeDurationPresets(getNativeDatabase(),true)});}
 catch{return nativeResponseJson({error:'Failed to fetch presets'},{status:500});}
}
export async function POST(){
 try{const actor=await admin();if(!actor)return denied();const seeded=await seedNativeDurationPresets(getNativeDatabase(),actor.id);
  return nativeResponseJson({success:true,seeded,message:seeded?'Default presets seeded successfully':'Presets already exist',...(seeded?{count:9}:{})});
 }catch{return nativeResponseJson({error:'Failed to seed presets'},{status:500});}
}
export async function PUT(request:NextRequest){
 try{if(!await admin())return denied();const body=await request.json();await reorderNativeDurationPresets(getNativeDatabase(),body?.orderedIds);
  return nativeResponseJson({success:true,message:'Presets reordered successfully'});
 }catch(error){return nativeResponseJson({error:error instanceof PresetInputError?error.message:'Failed to reorder presets'},{status:error instanceof PresetInputError?400:500});}
}
