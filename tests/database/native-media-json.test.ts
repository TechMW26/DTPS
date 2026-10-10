import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeMediaJson} from '@/lib/api/native-media-json';
import {nativeMediaHash} from '@/lib/db/repository/native-media';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native media response representation',()=>{
 let db:ReturnType<typeof getNativeDatabase>;beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{await db.terminate();});
 it('rewrites all legacy references through the authenticated resolver without mutating stored payloads or exposing private blob pointers',async()=>{
  const source='https://ik.imagekit.io/test/'+randomBytes(12).toString('hex'),missing=source+'missing',hash=nativeMediaHash(source),ref=db.collection('_nativeMediaUrls').doc(hash);
  await ref.set({sourceUrl:source,verification:'sha256-readback',blob:{pathname:'private/test',storeId:'private-store'}});
  const date=new Date(),original={attachments:[{url:source},{url:missing}],createdAt:date};
  const reads=jest.spyOn(db,'getAll');const view=await nativeMediaJson(db,original);expect(reads).not.toHaveBeenCalled();reads.mockRestore();expect(view.attachments[0].url).toBe('/api/media/'+hash);expect(view.attachments[1].url).toBe('/api/media/'+nativeMediaHash(missing));expect(original.attachments[0].url).toBe(source);expect(view.createdAt).toBe(date);expect(JSON.stringify(view)).not.toContain('private-store');
  await ref.update({verification:'pending'});expect((await nativeMediaJson(db,original)).attachments[0].url).toBe('/api/media/'+hash);await ref.delete();
 });
});
