import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeClientSettings,updateNativeClientSettings,SettingsInputError} from '@/lib/db/repository/native-settings';
export async function GET(){
 try{
  const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
  const settings=await nativeClientSettings(getNativeDatabase(),session.user.id);
  if(!settings)return nativeResponseJson({error:'User not found'},{status:404});
  return nativeResponseJson({success:true,settings});
 }catch{return nativeResponseJson({error:'Failed to fetch settings'},{status:500});}
}
export async function PUT(request:NextRequest){
 try{
  const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
  let body;try{body=await request.json();}catch{return nativeResponseJson({error:'Invalid request'},{status:400});}
  const settings=await updateNativeClientSettings(getNativeDatabase(),session.user.id,body?.settings);
  if(!settings)return nativeResponseJson({error:'User not found'},{status:404});
  return nativeResponseJson({success:true,settings,message:'Settings updated successfully'});
 }catch(error){return nativeResponseJson({error:error instanceof SettingsInputError?error.message:'Failed to update settings'},{status:error instanceof SettingsInputError?400:500});}
}
