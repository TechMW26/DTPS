import {createHash,randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {lookupNativeFile,lookupNativeMedia,nativeMediaHash} from '@/lib/db/repository/native-media';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native private media access',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 const id=()=>randomBytes(12).toString('hex');
 async function put(collection:string,key:string,data:Record<string,unknown>){const ref=db.collection(collection).doc(key);refs.push(ref);await ref.set(data);return ref;}
 it.each(['https://ik.imagekit.io/test/','https://dtps.tech/uploads/message/'])('allows a message recipient and revokes access after attachment removal: %s',async(base)=>{
  const url=base+id(),hash=nativeMediaHash(url),recipient=id(),sender=id(),message=id();
  await put('_nativeMediaUrls',hash,{sourceUrl:url,url:'https://test.public.blob.vercel-storage.com/test'});
  await put('_nativeMediaReferences',hash+'-0',{urlHash:hash,references:[{collection:'messages',id:message,path:['attachments','0','url']}]});
  await put('users',recipient,{role:'client',status:'active'});
  const source=await put('messages',message,{sender,receiver:recipient,attachments:[{url}]});
  expect(await lookupNativeMedia(db,hash,{id:recipient,role:'client'})).not.toBeNull();
  expect(await lookupNativeMedia(db,hash,{id:id(),role:'client'})).toBeNull();
  await source.update({attachments:[]});expect(await lookupNativeMedia(db,hash,{id:recipient,role:'client'})).toBeNull();
 });
 it('serves active public blog images without exposing unpublished images',async()=>{
  const url='https://ik.imagekit.io/test/'+id(),hash=nativeMediaHash(url),blog=id();
  await put('_nativeMediaUrls',hash,{sourceUrl:url,url:'https://test.public.blob.vercel-storage.com/test'});
  await put('_nativeMediaReferences',hash+'-0',{urlHash:hash,references:[{collection:'blogs',id:blog,path:['featuredImage']}]});
  const source=await put('blogs',blog,{isActive:true,featuredImage:url});expect(await lookupNativeMedia(db,hash,null)).not.toBeNull();
  await source.update({isActive:false});expect(await lookupNativeMedia(db,hash,null)).toBeNull();
 });
 it('limits private user documents to current owners or assigned staff while allowing profile images',async()=>{
  const owner=id(),viewer=id(),staff=id(),url='https://ik.imagekit.io/test/'+id(),hash=nativeMediaHash(url);
  const user=await put('users',owner,{role:'client',status:'active',assignedDietitian:staff,privateDocument:url,avatar:url});
  await put('users',viewer,{role:'client',status:'active'});await put('users',staff,{role:'dietitian',status:'active'});
  await put('_nativeMediaUrls',hash,{sourceUrl:url,url:'https://test.public.blob.vercel-storage.com/test'});
  const reference=await put('_nativeMediaReferences',hash+'-0',{urlHash:hash,references:[{collection:'users',id:owner,path:['privateDocument']}]});
  expect(await lookupNativeMedia(db,hash,{id:viewer,role:'admin'})).toBeNull();expect(await lookupNativeMedia(db,hash,{id:staff,role:'dietitian'})).not.toBeNull();
  await user.update({assignedDietitian:null});expect(await lookupNativeMedia(db,hash,{id:staff,role:'dietitian'})).toBeNull();
  await reference.update({references:[{collection:'users',id:owner,path:['avatar']}]});expect(await lookupNativeMedia(db,hash,{id:viewer,role:'client'})).not.toBeNull();
 });
 it('checks ownership and tombstones before returning migrated file references',async()=>{
  const owner=id(),file=id();const ref=await put('files',file,{uploadedBy:owner});
  await put('users',owner,{role:'client',status:'active'});
  await put('_mediaAssets',createHash('sha256').update('files\0'+file).digest('hex'),{blob:{pathname:'private/test'}});
  expect(await lookupNativeFile(db,file,{id:owner,role:'client'})).not.toBeNull();
  expect(await lookupNativeFile(db,file,{id:id(),role:'client'})).toBeNull();
  expect(await lookupNativeFile(db,file,{id:id(),role:'admin'})).toBeNull();
  await ref.update({deletedAt:new Date()});expect(await lookupNativeFile(db,file,{id:owner,role:'client'})).toBeNull();
 });
});
