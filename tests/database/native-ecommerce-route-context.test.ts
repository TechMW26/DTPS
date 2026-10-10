import {NextRequest} from 'next/server';
const mockRead=jest.fn(async(..._args:any[])=>({plans:[]}));
jest.mock('next-auth',()=>({getServerSession:jest.fn()}));
jest.mock('@/lib/auth/config',()=>({authOptions:{}}));
jest.mock('@/lib/db/database',()=>({getNativeDatabase:()=>({})}));
jest.mock('@/lib/db/repository/native-ecommerce-content',()=>({readEcommerceContent:(...args:any[])=>mockRead(...args),mutateEcommerceContent:jest.fn()}));
import {ecommerceContentRoute} from '@/lib/api/native-ecommerce-content-route';
describe('ecommerce collection route context',()=>{
 it.each([{}, {params:undefined},{params:Promise.resolve({})}])('allows list requests with no dynamic params',async(context)=>{const response=await ecommerceContentRoute('plans',true)(new NextRequest('http://localhost/api/ecommerce/plans'),context);expect(response.status).toBe(200);expect(mockRead.mock.calls.at(-1)?.[4]).toBeUndefined();});
});
