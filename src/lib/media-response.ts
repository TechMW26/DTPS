import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {lookupNativeFile,lookupNativeMedia,nativeMediaHash} from '@/lib/db/repository/native-media';
import {nativeMediaResponse} from '@/lib/api/native-media-response';
/** Resolve exact migrated references. Never recover by filename, which is not an ownership boundary. */
export async function handleMediaResolve(request:NextRequest):Promise<NextResponse>{
 try{
  const raw=request.nextUrl.searchParams.get('url');if(!raw)return NextResponse.json({error:'Missing media URL'},{status:400});
  let url:URL;try{url=new URL(raw,request.nextUrl.origin);}catch{return NextResponse.json({error:'Invalid media URL'},{status:400});}
  const session=await getServerSession(authOptions),actor=session?.user?.id?{id:session.user.id,role:session.user.role}:null,db=getNativeDatabase();let media:Record<string,any>|null=null,target:string|undefined;
  const file=url.pathname.match(/^\/api\/files\/([a-f0-9]{24})\/?$/i),hash=url.pathname.match(/^\/api\/media\/([a-f0-9]{64})\/?$/);
  const own=url.origin===request.nextUrl.origin||['dtps.tech','www.dtps.tech'].includes(url.hostname);
  if(own&&file){media=await lookupNativeFile(db,file[1],actor);target='/api/files/'+file[1];}
  else if(own&&hash){media=await lookupNativeMedia(db,hash[1],actor);target='/api/media/'+hash[1];}
  else if(url.protocol==='https:'){
   const digest=nativeMediaHash(url.href);media=await lookupNativeMedia(db,digest,actor);target='/api/media/'+digest;
   // Existing public Blob objects remain public; private objects always require indexed parent access.
   if(!media&&url.hostname.endsWith('.public.blob.vercel-storage.com')){media={url:url.href};target=url.href;}
  }
  if(!media)return NextResponse.json({error:'Media not found or access denied'},{status:404,headers:{'Cache-Control':'private, no-store'}});
  if(request.nextUrl.searchParams.get('metadata')==='1')return NextResponse.json({url:target,filename:media.originalName||'document',kind:'remote'},{headers:{'Cache-Control':'private, no-store'}});
  return nativeMediaResponse(media,request);
 }catch{return NextResponse.json({error:'Media service unavailable'},{status:503});}
}
export function mediaCorsOptions(){return new NextResponse(null,{status:204,headers:{Allow:'GET, OPTIONS','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Range'}});}
