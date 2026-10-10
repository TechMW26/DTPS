import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {z} from 'zod';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {NativeStaffClientError} from '@/lib/db/repository/native-staff-client';
import {listStaffRecipes,saveStaffRecipe} from '@/lib/db/repository/native-staff-recipes';
export const dynamic='force-dynamic';
async function run(req:NextRequest,write=false){try{const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeStaffClientError('Unauthorized',401);const db=getNativeDatabase();return nativeResponseJson(write?{success:true,recipe:await saveStaffRecipe(db,session.user.id,await req.json())}:await listStaffRecipes(db,session.user.id,req.nextUrl.searchParams),{status:write?201:200});}catch(e){return nativeResponseJson({error:e instanceof NativeStaffClientError?e.message:e instanceof z.ZodError?'Invalid recipe fields':'Unable to process recipes'},{status:e instanceof NativeStaffClientError?e.status:e instanceof z.ZodError||e instanceof SyntaxError?400:500});}}
export const GET=(req:NextRequest)=>run(req);
export const POST=(req:NextRequest)=>run(req,true);
