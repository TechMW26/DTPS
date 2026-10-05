import React from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
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
