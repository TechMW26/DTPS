import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeUserForm} from './native-user-forms';
import {NativeDirectoryError} from './native-client-directory';
import {ZodError} from 'zod';
export function nativeUserFormHandlers(collection:'medicalinfos'|'lifestyleinfos'){
 const handle=async(r:NextRequest,c:{params:Promise<{id:string}>},write=false)=>{try{const s=await getServerSession(authOptions);if(!s?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});const {id}=await c.params;if(!/^[a-f0-9]{24}$/i.test(id))throw new NativeDirectoryError('Invalid user ID');const data=await nativeUserForm(getNativeDatabase(),s.user.id,id,collection,write?await r.json():undefined);return nativeResponseJson({[collection==='medicalinfos'?'medicalInfo':'lifestyleInfo']:data});}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:e instanceof ZodError?'Invalid form data':'Unable to process form'},{status:e instanceof NativeDirectoryError?e.status:e instanceof ZodError?400:500});}};
 return {GET:(r:NextRequest,c:{params:Promise<{id:string}>})=>handle(r,c),POST:(r:NextRequest,c:{params:Promise<{id:string}>})=>handle(r,c,true)};
}
