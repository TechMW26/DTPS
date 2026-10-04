import {prepareNativeDocument,hydrateNativeDocument} from '@/lib/storage/native-document';
import {createHash} from 'node:crypto';

const files=new Map<string,Buffer>();
jest.mock('@/lib/storage/migration-blob-storage',()=>({
  storeNativeFile:async(bytes:Buffer,contentType:string)=>{
    const sha256=createHash('sha256').update(bytes).digest('hex');files.set(sha256,Buffer.from(bytes));
    return {provider:'vercel-blob',sha256,size:bytes.length,contentType,storeId:'store_test',pathname:'originals/'+sha256,url:'https://test.private.blob.vercel-storage.com/originals/'+sha256};
  },
  readNativeFile:async(ref:{sha256:string})=>Buffer.from(files.get(ref.sha256)!),
}));

it('preserves large photo strings and binary metadata through Vercel Blob references',async()=>{
  const photo='data:image/jpeg;base64,'+'A'.repeat(1_200_000);
  const source={_id:'fixture',meals:[{photo},{photo:'unchanged'}],metadata:{data:Buffer.alloc(90_000,7)},when:new Date()};
  const prepared=await prepareNativeDocument(source);
  expect(JSON.stringify(prepared).length).toBeLessThan(64_000);
  expect(await hydrateNativeDocument(prepared)).toEqual(source);
  expect(source.meals[0].photo).toBe(photo);
  await expect(prepareNativeDocument({_nativeExternalFields:[]})).rejects.toThrow('reserved');
});
