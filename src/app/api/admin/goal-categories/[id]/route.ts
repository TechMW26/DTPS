import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest, NextResponse} from 'next/server';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {getNativeGoalCategory,saveNativeGoalCategory,deleteNativeGoalCategory} from '@/lib/db/repository/native-goal-categories';
import {requireCategoryAdmin,categoryError} from '@/lib/db/repository/native-goal-categories-route';
type Context={params:Promise<{id:string}>};
export async function GET(_req:NextRequest,{params}:Context) {
  try { return nativeResponseJson(await getNativeGoalCategory(getNativeDatabase(),(await params).id)); }
  catch(error) { return categoryError(error); }
}
export async function PUT(req:NextRequest,{params}:Context) {
  try { const user=await requireCategoryAdmin();return nativeResponseJson(await saveNativeGoalCategory(getNativeDatabase(),user.id,await req.json(),(await params).id)); }
  catch(error) { return categoryError(error); }
}
export async function DELETE(_req:NextRequest,{params}:Context) {
  try { await requireCategoryAdmin();await deleteNativeGoalCategory(getNativeDatabase(),(await params).id);return nativeResponseJson({success:true,message:'Goal category deleted'}); }
  catch(error) { return categoryError(error); }
}
