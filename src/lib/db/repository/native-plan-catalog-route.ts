import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {NativeCatalogError,listNativeCatalog,saveNativeCatalog,deleteNativeCatalog,type NativeCatalog} from './native-plan-catalog';
export function nativeCatalogHandlers(collection:NativeCatalog){
 const label=collection==='serviceplans'?'Service plan':'Subscription plan';
 async function actor(write:boolean){const session=await getServerSession(authOptions);if(!session?.user)throw new NativeCatalogError('Unauthorized',401);if(write?session.user.role!=='admin':collection==='subscriptionplans'&&!['admin','dietitian'].includes(session.user.role))throw new NativeCatalogError('Forbidden',403);return session.user;}
 function failure(error:unknown){return nativeResponseJson({error:error instanceof NativeCatalogError?error.message:'Unable to process plan request'},{status:error instanceof NativeCatalogError?error.status:error instanceof SyntaxError?400:500});}
 return {
 GET:async(req:NextRequest)=>{try{await actor(false);const plans=await listNativeCatalog(getNativeDatabase(),collection,req.nextUrl.searchParams);return nativeResponseJson({success:true,plans,...(collection==='serviceplans'?{total:plans.length}:{count:plans.length})});}catch(error){return failure(error);}},
 POST:async(req:NextRequest)=>{try{const user=await actor(true),plan=await saveNativeCatalog(getNativeDatabase(),collection,user.id,await req.json());return nativeResponseJson({success:true,plan,message:`${label} created successfully`},{status:201});}catch(error){return failure(error);}},
 PUT:async(req:NextRequest)=>{try{const user=await actor(true),{id,...input}=await req.json();if(typeof id!=='string'||!id)throw new NativeCatalogError('Plan ID is required',400);const plan=await saveNativeCatalog(getNativeDatabase(),collection,user.id,input,id);return nativeResponseJson({success:true,plan,message:`${label} updated successfully`});}catch(error){return failure(error);}},
 DELETE:async(req:NextRequest)=>{try{await actor(true);await deleteNativeCatalog(getNativeDatabase(),collection,req.nextUrl.searchParams.get('id'));return nativeResponseJson({success:true,message:`${label} deleted successfully`});}catch(error){return failure(error);}}
 };
}
