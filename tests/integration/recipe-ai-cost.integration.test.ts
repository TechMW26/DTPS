import {getServerSession} from 'next-auth';
const mockCreate=jest.fn();
jest.mock('openai',()=>({__esModule:true,default:jest.fn(()=>({chat:{completions:{create:(...args:any[])=>mockCreate(...args)}}}))}));
jest.mock('@/lib/auth/config',()=>({authOptions:{}}));
jest.mock('@/lib/db/firestore-native',()=>({getNativeDatabase:()=>({})}));
jest.mock('@/lib/db/repository/native-staff-recipes',()=>({recipeActor:jest.fn(async()=>({})),saveStaffRecipe:jest.fn(async()=>({_id:'synthetic'}))}));
jest.mock('@/lib/db/repository/native-staff-recipe-dedup',()=>({nativeRecipeDuplicateMap:jest.fn(async()=>new Map()),findNativeSimilarRecipes:jest.fn(async()=>[]),compareIngredients:jest.fn(),mergeNativeRecipe:jest.fn()}));
jest.mock('@/lib/cache/memoryCache',()=>({clearCacheByTag:jest.fn()}));
import {POST as single} from '@/app/api/recipes/ai-generate/route';
import {POST as bulk} from '@/app/api/recipes/ai-bulk/route';
import {nativeRecipeDuplicateMap} from '@/lib/db/repository/native-staff-recipe-dedup';
function request(body:unknown,signal?:AbortSignal){return new Request('http://localhost/api/recipes/ai',{method:'POST',body:JSON.stringify(body),headers:{'content-type':'application/json'},signal});}
beforeEach(()=>{
 process.env.OPENAI_API_KEY='synthetic-test-only';
 jest.mocked(getServerSession).mockResolvedValue({user:{id:'staff',role:'dietitian'}} as any);
 mockCreate.mockReset();mockCreate.mockResolvedValue({choices:[{message:{content:JSON.stringify({description:'Cooked rice',ingredients:[{name:'Rice',quantity:1,unit:'cup'}],instructions:['Cook rice'],nutrition:{calories:100,protein:1,carbs:20,fat:1}})}}]});
});
afterEach(()=>delete process.env.OPENAI_API_KEY);
it.each([single,bulk])('never calls the provider for anonymous/client/oversized/aborted input',async(post)=>{
 jest.mocked(getServerSession).mockResolvedValue(null);
 expect((await post(request({recipeName:'Rice',recipeNames:'Rice'}))).status).toBe(401);
 jest.mocked(getServerSession).mockResolvedValue({user:{id:'client',role:'client'}} as any);
 expect((await post(request({recipeName:'Rice',recipeNames:'Rice'}))).status).toBe(403);
 jest.mocked(getServerSession).mockResolvedValue({user:{id:'staff',role:'dietitian'}} as any);
 expect((await post(request({recipeName:'a'.repeat(201),recipeNames:'a'.repeat(201)}))).status).toBe(400);
 expect((await post(request({recipeName:'Rice',recipeNames:'Rice',padding:'x'.repeat(1024*1024)}))).status).toBe(413);
 const abort=new AbortController();abort.abort();
 expect((await post(request({recipeName:'Rice',recipeNames:'Rice'},abort.signal))).status).toBe(499);
 expect(mockCreate).not.toHaveBeenCalled();
});
it.each(['dietitian','health_counselor','admin'])('allows %s single generation and forwards request cancellation',async(role)=>{
 jest.mocked(getServerSession).mockResolvedValue({user:{id:'staff',role}} as any);
 const req=request({recipeName:'Rice'});expect((await single(req)).status).toBe(200);
 expect(mockCreate).toHaveBeenCalledTimes(1);expect(mockCreate.mock.calls[0][1].signal).toBe(req.signal);
});
it('stops bulk retries and subsequent recipes when the request is aborted',async()=>{
 const abort=new AbortController();
 mockCreate.mockImplementation(async()=>{abort.abort();throw {status:429};});
 const response=await bulk(request({recipeNames:'Rice,Dal,Roti,Salad'},abort.signal));
 await response.text();
 expect(mockCreate).toHaveBeenCalledTimes(1);
 expect(mockCreate.mock.calls[0][1].signal.aborted).toBe(true);
});
it('aborts in-flight calls when the response reader cancels',async()=>{
 mockCreate.mockImplementation((_body:any,{signal}:any)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true})));
 const response=await bulk(request({recipeNames:'Rice,Dal,Roti,Salad'}));
 for(let i=0;i<10&&mockCreate.mock.calls.length<3;i++)await new Promise(resolve=>setTimeout(resolve,0));
 expect(mockCreate).toHaveBeenCalledTimes(3);
 await response.body!.cancel();
 expect(mockCreate.mock.calls.every(call=>call[1].signal.aborted)).toBe(true);
});
it('retains the 500-name bulk contract and rejects the 501st before provider usage',async()=>{
 expect((await bulk(request({recipeNames:Array.from({length:501},(_,i)=>'Recipe '+i).join(',')}))).status).toBe(400);
 const names=Array.from({length:500},(_,i)=>'Recipe '+i);
 jest.mocked(nativeRecipeDuplicateMap).mockResolvedValueOnce(new Map(names.map(name=>[name,{existingName:name}])) as any);
 const accepted=await bulk(request({recipeNames:names.join(',')}));expect(accepted.status).toBe(200);await accepted.text();
 expect(mockCreate).not.toHaveBeenCalled();
});
