import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {readEcommerceContent,mutateEcommerceContent,type EcommerceContentKind} from '@/lib/db/repository/native-ecommerce-content';
import {assertNativeAlertAdmin,NativeAlertError} from '@/lib/db/repository/native-system-alerts';
import {nativeMediaJson} from './native-media-json';
import {z} from 'zod';
export function ecommerceContentRoute(kind:EcommerceContentKind,publicOnly=false){return async(request:NextRequest,context?:{params?:Promise<{id?:string}>})=>{try{
 const db=getNativeDatabase(),id=(await context?.params)?.id;let actorId='';
 if(!publicOnly){const session=await getServerSession(authOptions);if(!session?.user?.id)return NextResponse.json({error:'Unauthorized'},{status:401});actorId=session.user.id;await assertNativeAlertAdmin(db,actorId);}
 const result=request.method==='GET'?await readEcommerceContent(db,kind,request.nextUrl.searchParams,publicOnly,id):await mutateEcommerceContent(db,kind,actorId,request.method==='DELETE'?{}:await request.json(),id,request.method==='DELETE');
 return NextResponse.json(await nativeMediaJson(db,result));
 }catch(e){return NextResponse.json({error:e instanceof NativeAlertError?e.message:e instanceof z.ZodError?'Invalid content':'Content operation failed'},{status:e instanceof NativeAlertError?e.status:e instanceof z.ZodError?400:503});}};}
