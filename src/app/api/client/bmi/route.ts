import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeBmiView,updateNativeBmi,NativeBmiError} from '@/lib/db/repository/native-bmi';
export async function GET(){
 try{const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 const row=await getNativeDatabase().collection('users').doc(session.user.id).get();if(!row.exists)return nativeResponseJson({error:'User not found'},{status:404});
 return nativeResponseJson(nativeBmiView(row.data()!));
 }catch{return nativeResponseJson({error:'Failed to fetch BMI data'},{status:503});}
}
export async function PUT(request:NextRequest){
 try{const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 return nativeResponseJson({success:true,...await updateNativeBmi(getNativeDatabase(),session.user.id,await request.json())});
 }catch(error){return nativeResponseJson({error:error instanceof NativeBmiError?error.message:'Failed to update BMI data'},{status:error instanceof NativeBmiError?error.status:503});}
}
