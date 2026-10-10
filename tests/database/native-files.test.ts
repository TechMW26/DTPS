import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {reserveNativeUpload,saveNativeUpload,deleteNativeUpload,nativeUploadId} from '@/lib/db/repository/native-files';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native upload durability and ownership',()=>{
 let db:ReturnType<typeof getNativeDatabase>;
 const ids:string[]=[];
 beforeAll(()=>{db=getNativeDatabase();});
 afterAll(async()=>{for(const id of ids)await db.collection('files').doc(id).delete();await db.terminate();});
 const metadata=(path:string)=>({filename:'test.png',originalName:'test.png',mimeType:'image/png',size:10,type:'message',imageKitFileId:path,imageKitUrl:'https://example.invalid/'+path,uploadedBy:'synthetic-owner'});
 it('binds concurrent token reservations to exactly one owner',async()=>{
  const path='test/'+randomBytes(12).toString('hex');
  const results=await Promise.allSettled(['one','two'].map(user=>reserveNativeUpload(db,path,user,'same-content')));
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
  expect(results.filter(result=>result.status==='rejected')).toHaveLength(1);
 });
 it('makes completed callback retries idempotent and rejects ownership or content changes',async()=>{
  const path='test/'+randomBytes(12).toString('hex'),id=nativeUploadId(path);ids.push(id);
  await Promise.all([saveNativeUpload(db,id,metadata(path)),saveNativeUpload(db,id,metadata(path))]);
  const row=await db.collection('files').doc(id).get();expect(row.get('uploadedBy')).toBe('synthetic-owner');
  await expect(saveNativeUpload(db,id,{...metadata(path),uploadedBy:'other'})).rejects.toThrow('identity');
  await expect(saveNativeUpload(db,id,{...metadata(path),size:11})).rejects.toThrow('content');
 });
 it('retains deletion tombstones, prevents callback resurrection, and rejects a different owner',async()=>{
  const path='test/'+randomBytes(12).toString('hex'),id=nativeUploadId(path);ids.push(id);
  await saveNativeUpload(db,id,metadata(path));
  expect(await deleteNativeUpload(db,id,'other')).toBe(false);
  expect(await deleteNativeUpload(db,id,'synthetic-owner')).toBe(true);
  expect(await deleteNativeUpload(db,id,'synthetic-owner')).toBe(true);
  await expect(saveNativeUpload(db,id,metadata(path))).rejects.toThrow('identity');
  expect((await db.collection('files').doc(id).get()).get('deletedAt')).toBeDefined();
 });
});
