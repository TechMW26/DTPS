import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {readNativeBlog,saveNativeBlog,deleteNativeBlog,NativeBlogError} from '@/lib/db/repository/native-blogs';
import {requireBlogAdmin,blogError,nativeBlogForm} from '@/lib/db/repository/native-blogs-route';
type Context={params:Promise<{id:string}>};
export async function GET(_req:NextRequest,{params}:Context){try{await requireBlogAdmin();return nativeResponseJson({blog:await readNativeBlog(getNativeDatabase(),(await params).id)});}catch(error){return blogError(error);}}
export async function PUT(req:NextRequest,{params}:Context){try{const user=await requireBlogAdmin(),{id}=await params;await readNativeBlog(getNativeDatabase(),id);return nativeResponseJson({success:true,blog:await saveNativeBlog(getNativeDatabase(),user.id,await nativeBlogForm(await req.formData(),true),id)});}catch(error){return blogError(error);}}
export async function PATCH(req:NextRequest,{params}:Context){try{const user=await requireBlogAdmin(),{isActive}=await req.json();if(typeof isActive!=='boolean')throw new NativeBlogError('Invalid blog status',400);const blog=await saveNativeBlog(getNativeDatabase(),user.id,{isActive},(await params).id);return nativeResponseJson({blog,message:`Blog ${isActive?'activated':'deactivated'} successfully`});}catch(error){return blogError(error);}}
export async function DELETE(_req:NextRequest,{params}:Context){try{await requireBlogAdmin();await deleteNativeBlog(getNativeDatabase(),(await params).id);return nativeResponseJson({success:true,message:'Blog deleted successfully'});}catch(error){return blogError(error);}}
