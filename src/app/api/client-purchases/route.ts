import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {z} from 'zod';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {NativeCheckoutError} from '@/lib/db/repository/native-checkout';
import {readStaffPurchases,createStaffPurchase,updateStaffPurchase,repairStaffPurchases} from '@/lib/db/repository/native-staff-purchases';
async function handle(req:NextRequest,method:string){try{const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeCheckoutError('Unauthorized',401);const db=getNativeDatabase(),result=method==='GET'?await readStaffPurchases(db,session.user.id,req.nextUrl.searchParams):await (method==='POST'?createStaffPurchase:method==='PUT'?updateStaffPurchase:repairStaffPurchases)(db,session.user.id,await req.json());return nativeResponseJson(result,{headers:{'Cache-Control':'no-store'}});}catch(e){return nativeResponseJson({error:e instanceof NativeCheckoutError?e.message:e instanceof z.ZodError?'Invalid purchase fields':'Unable to process purchase'},{status:e instanceof NativeCheckoutError?e.status:e instanceof z.ZodError||e instanceof SyntaxError?400:500});}}
export const GET=(req:NextRequest)=>handle(req,'GET');
export const POST=(req:NextRequest)=>handle(req,'POST');
export const PUT=(req:NextRequest)=>handle(req,'PUT');
export const PATCH=(req:NextRequest)=>handle(req,'PATCH');
