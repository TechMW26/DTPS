import {nativeResponseJson} from '@/lib/api/native-response';
import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {uploadToBlob} from '@/lib/storage/blob-storage';
import {compressImageServer} from '@/lib/imageCompressionServer';
import {NativeBlogError,validateNativeBlog} from './native-blogs';
export async function requireBlogAdmin(){const session=await getServerSession(authOptions);if(session?.user?.role!=='admin')throw new NativeBlogError('Admin access required',403);return session.user;}
export function blogError(error:unknown){return nativeResponseJson({error:error instanceof NativeBlogError?error.message:'Unable to process blog request'},{status:error instanceof NativeBlogError?error.status:error instanceof SyntaxError?400:500});}
export async function nativeBlogForm(form:FormData,partial=false){
 const input:Record<string,unknown>={};
 for(const key of ['title','description','content','category','author','metaTitle','metaDescription'])if(form.has(key))input[key]=form.get(key);
 for(const key of ['readTime','displayOrder'])if(form.has(key))input[key]=Number(form.get(key));
 for(const key of ['isFeatured','isActive'])if(form.has(key)){const value=form.get(key);if(value!=='true'&&value!=='false')throw new NativeBlogError('Invalid blog status',400);input[key]=value==='true';}
 if(form.has('tags'))input.tags=String(form.get('tags')||'').split(',').map(tag=>tag.trim()).filter(Boolean);
 if(!partial){input.readTime??=5;input.displayOrder??=0;input.isFeatured??=false;input.isActive??=false;input.tags??=[];}
 const image=form.get('featuredImage');
 if(!partial&&!(image instanceof File))throw new NativeBlogError('Featured image is required',400);
 if(image instanceof File){
  if(!image.size||image.size>10*1024*1024||!['image/jpeg','image/png','image/webp','image/gif'].includes(image.type))throw new NativeBlogError('Choose an image up to 10 MB',400);
  // Validate text before uploading media. The placeholder is never persisted.
  validateNativeBlog({...input,featuredImage:'https://placeholder.invalid/image'},partial);
  const bytes=await compressImageServer(Buffer.from(await image.arrayBuffer()),{quality:85,maxWidth:1920,maxHeight:1080,format:'jpeg'});
  const result=await uploadToBlob(bytes,{type:'ecommerce',filename:`blog_${crypto.randomUUID()}.jpg`,contentType:'image/jpeg',compress:false});
  if(!result)throw new NativeBlogError('Media service temporarily unavailable',503);
  input.featuredImage=result.url;input.thumbnailImage=result.url;input.featuredImageFileId=result.pathname;
 }
 return validateNativeBlog(input,partial);
}
