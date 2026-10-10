import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeDurationPresets,writeNativeDurationPreset,deleteNativeDurationPreset,PresetInputError} from '@/lib/db/repository/native-duration-presets';
async function admin(){const session=await getServerSession(authOptions);return session?.user?.role==='admin'?session.user:null;}
const failure=(error:unknown)=>nativeResponseJson({success:false,error:error instanceof PresetInputError?error.message:'Failed to update duration presets'},{status:error instanceof PresetInputError?400:500});
export async function GET(){
 try{return nativeResponseJson({success:true,presets:await nativeDurationPresets(getNativeDatabase())});}
 catch{return nativeResponseJson({success:false,error:'Failed to fetch duration presets'},{status:500});}
}
export async function POST(request:NextRequest){
 try{
  const actor=await admin();if(!actor)return nativeResponseJson({error:'Admin access required'},{status:403});
  const body=await request.json();if(!body||typeof body!=='object'||Array.isArray(body))throw new PresetInputError('Invalid request');
  const preset=await writeNativeDurationPreset(getNativeDatabase(),actor.id,body);
  return nativeResponseJson({success:true,preset,message:'Duration preset created successfully'});
 }catch(error){return failure(error);}
}
export async function PUT(request:NextRequest){
 try{
  const actor=await admin();if(!actor)return nativeResponseJson({error:'Admin access required'},{status:403});
  const body=await request.json();if(!body||typeof body.id!=='string'||!body.id)throw new PresetInputError('Preset ID is required');
  const preset=await writeNativeDurationPreset(getNativeDatabase(),actor.id,body,body.id);
  if(!preset)return nativeResponseJson({error:'Preset not found'},{status:404});
  return nativeResponseJson({success:true,preset,message:'Duration preset updated successfully'});
 }catch(error){return failure(error);}
}
export async function DELETE(request:NextRequest){
 try{
  if(!await admin())return nativeResponseJson({error:'Admin access required'},{status:403});
  const deleted=await deleteNativeDurationPreset(getNativeDatabase(),request.nextUrl.searchParams.get('id')||'');
  if(!deleted)return nativeResponseJson({error:'Preset not found'},{status:404});
  return nativeResponseJson({success:true,message:'Duration preset deleted successfully'});
 }catch(error){return failure(error);}
}
