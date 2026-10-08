const mockRead=jest.fn();
jest.mock('@/lib/storage/migration-blob-storage',()=>({readNativeFile:(...args:any[])=>mockRead(...args)}));
import {nativeMediaResponse} from '@/lib/api/native-media-response';
describe('authenticated media response ranges',()=>{
 beforeEach(()=>{mockRead.mockClear();mockRead.mockResolvedValue(Buffer.from('0123456789'));});
 it.each([['bytes=2-4','234'],['bytes=-3','789'],['bytes=8-','89']])('serves %s',async(range,body)=>{const result=await nativeMediaResponse({blob:{},mimeType:'audio/mpeg'},new Request('http://localhost/api/media/a',{headers:{range}}));expect(result.status).toBe(206);expect(await result.text()).toBe(body);});
 it('rejects invalid or unsatisfiable ranges',async()=>{for(const range of ['bytes=30-40','bytes=4-2','bytes=-0','bytes=0-1,3-4'])expect((await nativeMediaResponse({blob:{}},new Request('http://localhost/a',{headers:{range}}))).status).toBe(416);});
 it('rejects ranges outside trusted reference size without downloading',async()=>{
  expect((await nativeMediaResponse({blob:{size:10}},new Request('http://localhost/a',{headers:{range:'bytes=30-40'}}))).status).toBe(416);
  expect(mockRead).not.toHaveBeenCalled();
 });
 it('returns no body for HEAD after verification and ignores Range on HEAD',async()=>{
  const result=await nativeMediaResponse({blob:{size:10},mimeType:'audio/mpeg'},new Request('http://localhost/a',{method:'HEAD',headers:{range:'bytes=30-40'}}));
  expect(result.status).toBe(200);expect(result.headers.get('content-length')).toBe('10');expect(await result.text()).toBe('');expect(mockRead).toHaveBeenCalledTimes(1);
 });
 it('does not download when authorization resolved to no media',async()=>{
  expect((await nativeMediaResponse(null)).status).toBe(404);expect(mockRead).not.toHaveBeenCalled();
 });
 it('supports explicit download with sanitized filename',async()=>{const result=await nativeMediaResponse({blob:{},mimeType:'application/pdf',originalName:'report.pdf'},new Request('http://localhost/a?download=1'));expect(result.headers.get('content-disposition')).toBe('attachment; filename="report.pdf"');expect(result.headers.get('content-length')).toBe('10');});
});
