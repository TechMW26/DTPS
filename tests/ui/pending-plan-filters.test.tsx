import React from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import '@testing-library/jest-dom';
import HealthPendingPage from '@/app/health-counselor/pending-plans/page';
import Page from '@/app/dietician/pending-plans/page';
jest.mock('next-auth/react',()=>({useSession:()=>({status:'authenticated',data:{user:{id:'staff-one',role:'dietitian'}}})}));
jest.mock('@/components/layout/DashboardLayout',()=>({__esModule:true,default:({children}:any)=><main>{children}</main>}));
const plans=Array.from({length:121},(_,i)=>({clientId:`client-${i}`,displayClientId:`C-${i}`,clientName:`Person ${i}`,phone:'',email:'',currentPlanName:null,previousPlanName:null,purchasedPlanName:'Wellness',currentPlanRemainingDays:0,totalPurchasedDays:30,totalMealPlanDays:0,pendingDaysToCreate:30,reason:'no_meal_plan',urgency:'critical',reasonText:'No meal plan',hasNextPhase:false}));
beforeEach(()=>{global.fetch=jest.fn(async(url)=>({ok:true,text:async()=>JSON.stringify({pendingPlans:plans,criticalCount:121}),json:async()=>({dietitians:[]})})) as any;});
afterEach(cleanup);
test('starts collapsed and pages all clients without losing search matches beyond the first page',async()=>{
 render(<Page/>);
 await screen.findByRole('heading',{name:'Pending Plans'});
 expect(screen.getByRole('button',{name:/More filters/})).toHaveAttribute('aria-expanded','false');
 expect(screen.getByText('Showing 1–50 of 121 clients')).toBeVisible();
 expect(screen.queryByText('Person 120')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Next'}));
 expect(screen.getByText('Showing 51–100 of 121 clients')).toBeVisible();
 fireEvent.change(screen.getByRole('searchbox',{name:'Search clients'}),{target:{value:'C-120'}});
 expect(screen.getAllByText('Person 120')).toHaveLength(1);
 expect(screen.getByText('Showing 1–1 of 1 clients')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Clear all'}));
 expect(screen.getByText('Showing 1–50 of 121 clients')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:/More filters/}));
 expect(screen.getByLabelText('Plan Name')).toBeVisible();
 fireEvent.change(screen.getByLabelText('Plan Name'),{target:{value:'No match'}});
 expect(screen.getByText('No Results Found')).toBeVisible();
});

test('health counselor list renders each client once and retains allocation progress',async()=>{
 render(<HealthPendingPage/>);
 await screen.findByRole('table',{name:'Pending plans'});
 expect(screen.getAllByText('Person 120')).toHaveLength(1);
 expect(screen.getAllByRole('link',{name:'View'})).toHaveLength(plans.length);
 expect(screen.getAllByText('0 of 30 days created')).toHaveLength(plans.length);
});

const respondWith=(pending:any[])=>{
  global.fetch=jest.fn(async()=>({ok:true,text:async()=>JSON.stringify({pendingPlans:pending}),json:async()=>({dietitians:[]})})) as any;
};

test('date filters are visible and include missing plans and IST boundary dates',async()=>{
 respondWith([
  {...plans[0],clientName:'Missing phase',expectedStartDate:'2026-10-12T18:30:00.000Z'},
  {...plans[1],clientName:'Ending phase',currentPlanEndDate:'2026-10-12T18:29:59.000Z'},
  {...plans[2],clientName:'Old gap',previousPlanEndDate:'2026-10-09T18:30:00.000Z'},
  {...plans[3],clientName:'Undated'},
 ]);
 render(<Page/>);
 await screen.findByRole('heading',{name:'Pending Plans'});
 expect(screen.getByLabelText('Needed from')).toBeVisible();
 expect(screen.getByLabelText('Needed to')).toBeVisible();
 expect(screen.getByRole('button',{name:/More filters/})).toHaveAttribute('aria-expanded','false');
 fireEvent.change(screen.getByLabelText('Needed from'),{target:{value:'2026-10-13'}});
 fireEvent.change(screen.getByLabelText('Needed to'),{target:{value:'2026-10-13'}});
 expect(screen.getByText('Missing phase')).toBeVisible();
 expect(screen.getByText('Ending phase')).toBeVisible();
 expect(screen.queryByText('Old gap')).not.toBeInTheDocument();
 expect(screen.queryByText('Undated')).not.toBeInTheDocument();
 expect(screen.getByText('Showing 1–2 of 2 clients')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'All dates'}));
 expect(screen.getByText('Showing 1–4 of 4 clients')).toBeVisible();
});

test('quick calendar filters update the range and clear all resets it',async()=>{
 render(<Page/>);
 await screen.findByRole('heading',{name:'Pending Plans'});
 fireEvent.click(screen.getByRole('button',{name:'Today'}));
 const from=(screen.getByLabelText('Needed from') as HTMLInputElement).value;
 expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
 expect(screen.getByLabelText('Needed to')).toHaveValue(from);
 fireEvent.click(screen.getByRole('button',{name:'Next 7 days'}));
 expect(screen.getByLabelText('Needed from')).toHaveValue(from);
 expect((screen.getByLabelText('Needed to') as HTMLInputElement).value > from).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Overdue'}));
 expect(screen.getByLabelText('Needed from')).toHaveValue('');
 expect((screen.getByLabelText('Needed to') as HTMLInputElement).value < from).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Clear all'}));
 expect(screen.getByLabelText('Needed to')).toHaveValue('');
});

test('returning to the page refreshes resolved clients without resetting filters',async()=>{
 respondWith([plans[0],plans[1]]);
 render(<Page/>);
 await screen.findByRole('heading',{name:'Pending Plans'});
 fireEvent.change(screen.getByRole('searchbox',{name:'Search clients'}),{target:{value:'Person'}});
 respondWith([plans[1]]);
 fireEvent(window,new Event('focus'));
 await waitFor(()=>expect(screen.queryByText('Person 0')).not.toBeInTheDocument());
 expect(screen.getByText('Person 1')).toBeVisible();
 expect(screen.getByRole('searchbox',{name:'Search clients'})).toHaveValue('Person');
 expect(global.fetch).toHaveBeenCalledWith('/api/dashboard/pending-plans',expect.objectContaining({cache:'no-store'}));
});

test('a failed background refresh keeps the last successful list and reports the failure',async()=>{
 respondWith([plans[0]]);
 render(<Page/>);
 await screen.findByText('Person 0');
 global.fetch=jest.fn(async()=>({ok:false})) as any;
 fireEvent.click(screen.getByRole('button',{name:'Refresh'}));
 await screen.findByRole('alert');
 expect(screen.getByText('Person 0')).toBeVisible();
 expect(screen.getByRole('alert')).toHaveTextContent('last successful list is still shown');
});

test('the visible queue refreshes every minute and cleans up on unmount',async()=>{
 jest.useFakeTimers();
 try{
  respondWith([plans[0]]);
  const {unmount}=render(<Page/>);
  await act(async()=>{});
  expect(screen.getByText('Person 0')).toBeVisible();
  respondWith([]);
  await act(async()=>{jest.advanceTimersByTime(60_000);});
  expect(screen.queryByText('Person 0')).not.toBeInTheDocument();
  const calls=(global.fetch as jest.Mock).mock.calls.length;
  unmount();
  await act(async()=>{jest.advanceTimersByTime(60_000);});
  expect((global.fetch as jest.Mock).mock.calls).toHaveLength(calls);
 }finally{jest.useRealTimers();}
});
