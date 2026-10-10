import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest, NextResponse} from 'next/server';
import {getNativeDatabase} from '@/lib/db/database';
import {getNativeTag, saveNativeTag, deleteNativeTag} from '@/lib/db/repository/native-tags';
import {requireTagStaff, tagError} from '@/lib/db/repository/native-tags-route';
type Context = {params:Promise<{tagId:string}>};
export async function GET(_req:NextRequest, {params}:Context) {
  try { await requireTagStaff(); return nativeResponseJson(await getNativeTag(getNativeDatabase(),(await params).tagId),{headers:{'Cache-Control':'private, no-store'}}); }
  catch(error) { return tagError(error); }
}
export async function PUT(req:NextRequest, {params}:Context) {
  try { const user = await requireTagStaff(); return nativeResponseJson(await saveNativeTag(getNativeDatabase(),user.id,await req.json(),(await params).tagId)); }
  catch(error) { return tagError(error); }
}
export async function DELETE(_req:NextRequest, {params}:Context) {
  try { const user=await requireTagStaff(); await deleteNativeTag(getNativeDatabase(),(await params).tagId,user.id); return nativeResponseJson({message:'Tag deleted successfully'}); }
  catch(error) { return tagError(error); }
}
