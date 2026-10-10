import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {z} from 'zod';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {recipeActor,saveStaffRecipe} from '@/lib/db/repository/native-staff-recipes';
import {NativeStaffClientError} from '@/lib/db/repository/native-staff-client';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){try{const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeStaffClientError('Unauthorized',401);const db=getNativeDatabase();await recipeActor(db,session.user.id,true);const body=await req.json();if(!Array.isArray(body.recipes)||!body.recipes.length||body.recipes.length>500)throw new NativeStaffClientError('Supply between 1 and 500 recipes');const recipes=[],errors=[];for(const [index,raw] of body.recipes.entries()){try{const recipe=await saveStaffRecipe(db,session.user.id,{...raw,prepTime:Number(raw.prepTime)||0,cookTime:Number(raw.cookTime)||0,servings:raw.servings||1});recipes.push({_id:recipe._id,name:recipe.name,uuid:recipe.uuid});}catch(e){errors.push({row:index+1,message:e instanceof NativeStaffClientError?e.message:e instanceof z.ZodError?'Invalid recipe fields':'Recipe could not be imported'});}}return nativeResponseJson({success:errors.length===0,message:`Imported ${recipes.length} recipes; ${errors.length} need review`,imported:recipes.length,recipes,errors},{status:errors.length?207:201});}catch(e){return nativeResponseJson({error:e instanceof NativeStaffClientError?e.message:'Unable to import recipes'},{status:e instanceof NativeStaffClientError?e.status:e instanceof SyntaxError?400:500});}}
