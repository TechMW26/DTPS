import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {z} from 'zod';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {NativeStaffClientError} from './native-staff-client';
import {nativeCommerceRead,nativeCommerceWrite} from './native-staff-ecommerce';
export async function nativeCommerceRoute(req:NextRequest,kind:'orders'|'payments',method:string,id?:string){try{const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeStaffClientError('Unauthorized',401);const db=getNativeDatabase();return nativeResponseJson(method==='GET'?await nativeCommerceRead(db,session.user.id,kind,req.nextUrl.searchParams,id):await nativeCommerceWrite(db,session.user.id,kind,method==='DELETE'?{}:await req.json(),method==='DELETE'?'delete':method==='POST'?'create':'update',id));}catch(e){return nativeResponseJson({error:e instanceof NativeStaffClientError?e.message:e instanceof z.ZodError?'Invalid commerce record':'Unable to process commerce record'},{status:e instanceof NativeStaffClientError?e.status:e instanceof z.ZodError||e instanceof SyntaxError?400:500});}}
