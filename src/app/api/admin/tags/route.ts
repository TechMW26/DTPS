import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest, NextResponse} from 'next/server';
import {getNativeDatabase} from '@/lib/db/database';
import {listNativeTags, saveNativeTag} from '@/lib/db/repository/native-tags';
import {requireTagStaff, tagError} from '@/lib/db/repository/native-tags-route';
export async function GET(req: NextRequest) {
  try {
    const user = await requireTagStaff(false);
    return nativeResponseJson(await listNativeTags(getNativeDatabase(),user.role,req.nextUrl.searchParams.get('tagType')), {headers:{'Cache-Control':'private, no-store'}});
  } catch(error) { return tagError(error); }
}
export async function POST(req: NextRequest) {
  try {
    const user = await requireTagStaff();
    return nativeResponseJson(await saveNativeTag(getNativeDatabase(),user.id,await req.json()),{status:201});
  } catch(error) { return tagError(error); }
}
