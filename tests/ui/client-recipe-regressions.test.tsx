import '@testing-library/jest-dom';
import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import UserPlanPage from '@/app/user/plan/page';
jest.mock('next-auth/react',()=>({useSession:()=>({data:{user:{id:'client'}},status:'authenticated'})}));
jest.mock('@/contexts/ThemeContext',()=>({useTheme:()=>({isDarkMode:false})}));
jest.mock('@/hooks/useRealtime',()=>({useRealtime:jest.fn()}));
jest.mock('@/components/engagement/MealCompletionCelebration',()=>({__esModule:true,default:()=>null}));
jest.mock('next/image',()=>({__esModule:true,default:(props:any)=><img {...props}/> }));
jest.mock('@/lib/client-upload',()=>({uploadFileReliably:jest.fn()}));
jest.mock('@/lib/imageCompression',()=>({compressImage:jest.fn(),validateImageFile:jest.fn()}));
jest.mock('sonner',()=>({toast:{success:jest.fn(),error:jest.fn(),info:jest.fn()}}));
const items=[{id:'raita',name:'Homemade Jeera Raita',recipeId:'old-smoothie-id',portion:'1 katori',calories:0,alternatives:[]},{id:'salad',name:'Salad (1 Katori 100.0g)',portion:'1 katori',calories:0,alternatives:[]}];
const recipe=(name:string,ingredient:string)=>({_id:name,name,ingredients:[{quantity:1,unit:'g',name:ingredient}],instructions:['Prepare '+ingredient]});
beforeEach(()=>{
 jest.useFakeTimers({now:new Date('2026-10-12T10:00:00Z')});
 HTMLElement.prototype.scrollTo=jest.fn();
 window.history.replaceState({},'','/user/plan');
 global.fetch=jest.fn(async(url)=>({ok:true,json:async()=>String(url).includes('/api/client/meal-plan')?{success:true,hasPlan:true,serverNow:'2026-10-12T10:00:00Z',meals:[{id:'dinner',type:'dinner',time:'07:00 PM',items,totalCalories:0}],planDetails:{id:'phase',name:'Published phase',startDate:'2026-10-12',endDate:'2026-10-21'}}:{hasActivePlan:true,activePurchases:[]}})) as any;
});
afterEach(()=>{cleanup();jest.useRealTimers();window.history.replaceState({},'','/');});
const normalFetch=()=>global.fetch as jest.Mock;
it('honors the dashboard calendar date link instead of opening a different date',async()=>{
 window.history.replaceState({},'','/user/plan?date=2026-10-21');
 await act(async()=>{render(<UserPlanPage/>);});
 expect(normalFetch().mock.calls.some(([url])=>url==='/api/client/meal-plan?date=2026-10-21')).toBe(true);
 expect(screen.getByRole('button',{name:'Wed 21'})).toHaveAttribute('aria-pressed','true');
});
it('rejects a stale smoothie link and loads the exact named raita',async()=>{
 const original=normalFetch();global.fetch=jest.fn(async(url,...args)=>{
  if(String(url)==='/api/recipes/old-smoothie-id')return {ok:true,json:async()=>({success:true,recipe:recipe('Banana Smoothie','Banana')})};
  if(String(url).startsWith('/api/recipes?'))return {ok:true,json:async()=>({success:true,recipes:[recipe('Homemade Jeera Raita','Curd')]})};
  return original(url,...args);
 }) as any;
 await act(async()=>{render(<UserPlanPage/>);});
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:/Homemade Jeera Raita/}));});
 expect(within(screen.getByRole('dialog',{name:'Homemade Jeera Raita details'})).getAllByText(/Curd/).length).toBeGreaterThan(0);
 expect(screen.queryByText(/Banana/)).not.toBeInTheDocument();
});
it('ignores a late recipe response after switching from raita to salad',async()=>{
 let resolveRaita!:(value:any)=>void;
 const original=normalFetch();global.fetch=jest.fn(async(url,...args)=>{
  if(String(url)==='/api/recipes/old-smoothie-id')return new Promise(resolve=>{resolveRaita=resolve;});
  if(String(url).startsWith('/api/recipes?'))return {ok:true,json:async()=>({success:true,recipes:[recipe('Salad','Cucumber')]})};
  return original(url,...args);
 }) as any;
 await act(async()=>{render(<UserPlanPage/>);});
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:/Homemade Jeera Raita/}));});
 fireEvent.click(within(screen.getByRole('dialog')).getByLabelText('Close'));
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:/Salad \(1 Katori/}));});
 await act(async()=>{resolveRaita({ok:true,json:async()=>({success:true,recipe:recipe('Homemade Jeera Raita','Curd')})});});
 const modal=within(screen.getByRole('dialog',{name:'Salad (1 Katori 100.0g) details'}));
 expect(modal.getAllByText(/Cucumber/).length).toBeGreaterThan(0);expect(modal.queryByText(/Curd/)).not.toBeInTheDocument();
});
