import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {z} from 'zod';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {readNativeClientForm,writeNativeClientForm,NativeFormError} from './native-client-forms';
type Context={params:Promise<{clientId:string}>};
export function nativeAdminFormHandlers(collection:'medicalinfos'|'lifestyleinfos',staffRole?:'dietitian'){
 async function run(req:NextRequest,{params}:Context,write:boolean){
  try{
   const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeFormError('Unauthorized',401);if(session.user.role!==(staffRole||'admin'))throw new NativeFormError('Staff access required',403);
   const {clientId}=await params;if(!/^[a-f0-9]{24}$/.test(clientId))throw new NativeFormError('Invalid client ID',400);
   const db=getNativeDatabase(),client=await db.collection('users').doc(clientId).get();if(!client.exists||client.get('role')!=='client')throw new NativeFormError('Client not found',404);
   if(staffRole){const actor=await db.collection('users').doc(session.user.id).get();if(actor.get('role')!==staffRole||actor.get('status')!=='active'||![client.get('assignedDietitian'),...(client.get('assignedDietitians')||[])].includes(session.user.id))throw new NativeFormError('Client is not assigned to you',403);}
   if(!write)return nativeResponseJson({success:true,data:await readNativeClientForm(db,collection,clientId)||{},client:{id:clientId,firstName:client.get('firstName'),lastName:client.get('lastName'),email:client.get('email')}});
   const input=await req.json();if(!input||typeof input!=='object'||Array.isArray(input))throw new NativeFormError('Invalid form data',400);
   if(collection==='lifestyleinfos'){
    for(const field of ['heightFeet','heightInch','heightCm','weightKg','targetWeightKg','idealWeightKg','bmi'])if(typeof input[field]==='number')input[field]=String(input[field]);
    if(input.heightCm){const height=Number(input.heightCm);if(!Number.isFinite(height)||height<=0||height>300)throw new NativeFormError('Invalid height',400);const inches=Math.round(height/2.54);input.heightFeet=String(Math.floor(inches/12));input.heightInch=String(inches%12);}
   }
   const data=await writeNativeClientForm(db,collection,clientId,input,undefined,session.user.id,staffRole);return nativeResponseJson({success:true,data,message:'Client information updated successfully'});
  }catch(error){return nativeResponseJson({error:error instanceof NativeFormError?error.message:error instanceof z.ZodError?'Invalid form fields':'Unable to process client form'},{status:error instanceof NativeFormError?error.status:error instanceof z.ZodError||error instanceof SyntaxError?400:500});}
 }
 return {GET:(req:NextRequest,context:Context)=>run(req,context,false),PUT:(req:NextRequest,context:Context)=>run(req,context,true)};
}
