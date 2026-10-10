import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest, NextResponse} from 'next/server';
import {getNativeDatabase} from '@/lib/db/database';
import {listNativeGoalCategories,saveNativeGoalCategory} from '@/lib/db/repository/native-goal-categories';
import {requireCategoryAdmin,categoryError} from '@/lib/db/repository/native-goal-categories-route';
export async function GET(req:NextRequest) {
  try { return nativeResponseJson(await listNativeGoalCategories(getNativeDatabase(),req.nextUrl.searchParams.get('active')!=='false')); }
  catch(error) { return categoryError(error); }
}
export async function POST(req:NextRequest) {
  try { const user=await requireCategoryAdmin();return nativeResponseJson(await saveNativeGoalCategory(getNativeDatabase(),user.id,await req.json()),{status:201}); }
  catch(error) { return categoryError(error); }
}
