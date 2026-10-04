import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {z} from 'zod';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {NativeStaffClientError} from './native-staff-client';
import {legacyNativeMeals,saveLegacyNativeMeal} from './native-staff-legacy-meals';
type Context={params:Promise<{id:string}>};
export async function nativeLegacyMealsHandler(req:NextRequest,ctx:Context|undefined,method:string){try{const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeStaffClientError('Unauthorized',401);const id=ctx?(await ctx.params).id:undefined,db=getNativeDatabase();return nativeResponseJson(method==='GET'?await legacyNativeMeals(db,session.user.id,req.nextUrl.searchParams,id):await saveLegacyNativeMeal(db,session.user.id,method==='DELETE'?{}:await req.json(),id,method==='DELETE'),{status:method==='POST'?201:200});}catch(e){return nativeResponseJson({error:e instanceof NativeStaffClientError?e.message:'Unable to process meal plan'},{status:e instanceof NativeStaffClientError?e.status:e instanceof z.ZodError||e instanceof SyntaxError?400:500});}}
