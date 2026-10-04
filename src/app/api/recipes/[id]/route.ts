import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {z} from 'zod';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {NativeStaffClientError} from '@/lib/db/repository/native-staff-client';
import {readStaffRecipe,saveStaffRecipe,recipeActor} from '@/lib/db/repository/native-staff-recipes';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
async function run(req:NextRequest,{params}:Context,method:string){try{const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeStaffClientError('Unauthorized',401);const db=getNativeDatabase(),{id}=await params;let recipe;if(method==='GET')recipe=await readStaffRecipe(db,session.user.id,id);else if(method==='POST'){await recipeActor(db,session.user.id,true);const source=await readStaffRecipe(db,session.user.id,id);recipe=await saveStaffRecipe(db,session.user.id,{...source,name:`${source.name} (Copy ${Date.now()})`,isActive:false});}else recipe=await saveStaffRecipe(db,session.user.id,method==='DELETE'?{}:await req.json(),id,method==='DELETE');return nativeResponseJson({success:true,...(method!=='DELETE'?{recipe}:{})},{status:method==='POST'?201:200});}catch(e){return nativeResponseJson({error:e instanceof NativeStaffClientError?e.message:e instanceof z.ZodError?'Invalid recipe fields':'Unable to process recipe'},{status:e instanceof NativeStaffClientError?e.status:e instanceof z.ZodError||e instanceof SyntaxError?400:500});}}
export const GET=(r:NextRequest,c:Context)=>run(r,c,'GET');export const POST=(r:NextRequest,c:Context)=>run(r,c,'POST');export const PUT=(r:NextRequest,c:Context)=>run(r,c,'PUT');export const DELETE=(r:NextRequest,c:Context)=>run(r,c,'DELETE');
