import {NextRequest} from 'next/server';
const mockGet=jest.fn();
const mockDb={collection:jest.fn()};
jest.mock('next-auth',()=>({getServerSession:jest.fn(async()=>({user:{id:'a'.repeat(24)}}))}));
jest.mock('@/lib/auth/config',()=>({authOptions:{}}));
jest.mock('@/lib/db/database',()=>({getNativeDatabase:()=>mockDb}));
jest.mock('@/lib/storage/blob-storage',()=>({uploadToBlob:jest.fn()}));
jest.mock('@/lib/imageCompressionServer',()=>({compressImageServer:jest.fn()}));
import {nativeTransformationsRoute} from '@/lib/api/native-transformations-route';
describe('native transformation collection route context',()=>{
 beforeEach(()=>{
  const query:any={where:jest.fn(()=>query),orderBy:jest.fn(()=>query),get:mockGet,doc:jest.fn(()=>({get:async()=>({exists:true,get:(key:string)=>key==='role'?'admin':'active'})}))};
  mockDb.collection.mockReturnValue(query);
  mockGet.mockResolvedValue({docs:[{id:'b'.repeat(24),data:()=>({title:'Synthetic transformation',isActive:true,displayOrder:0})}]});
 });
 it.each([undefined,{}, {params:undefined},{params:Promise.resolve({})}])('accepts collection context without a dynamic id',async(context)=>{
  const response=await nativeTransformationsRoute(new NextRequest('http://localhost/api/admin/transformations?showInactive=false'),context);
  expect(response.status).toBe(200);expect((await response.json()).transformations).toEqual([{_id:'b'.repeat(24),title:'Synthetic transformation',isActive:true,displayOrder:0}]);
 });
});
