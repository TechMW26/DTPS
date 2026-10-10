import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getNativeDatabase} from '@/lib/db/database';
import {listNativeBlogs,saveNativeBlog} from '@/lib/db/repository/native-blogs';
import {requireBlogAdmin,blogError,nativeBlogForm} from '@/lib/db/repository/native-blogs-route';
export async function GET(req:NextRequest){try{await requireBlogAdmin();return nativeResponseJson({blogs:await listNativeBlogs(getNativeDatabase(),req.nextUrl.searchParams)});}catch(error){return blogError(error);}}
export async function POST(req:NextRequest){try{const user=await requireBlogAdmin();return nativeResponseJson({success:true,blog:await saveNativeBlog(getNativeDatabase(),user.id,await nativeBlogForm(await req.formData()))},{status:201});}catch(error){return blogError(error);}}
