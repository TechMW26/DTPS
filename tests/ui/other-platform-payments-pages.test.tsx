import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import OtherPlatformPaymentsPage from '@/app/admin/other-platform-payments/page';

jest.mock('next/navigation',()=>({useRouter:()=>mockRouter}));
const mockSession={status:'authenticated',data:{user:{id:'admin1',role:'admin'}}};
const mockRouter={push:jest.fn()};
jest.mock('next-auth/react',()=>({useSession:()=>mockSession}));
jest.mock('@/hooks/useRealtime',()=>({useRealtime:()=>undefined}));
jest.mock('@/components/layout/DashboardLayout',()=>({__esModule:true,default:({children}:any)=><main>{children}</main>}));
jest.mock('sonner',()=>({toast:{success:jest.fn(),error:jest.fn()}}));

const payments=Array.from({length:120},(_,i)=>({
 _id:'p'+i,client:{_id:'c'+i,firstName:'Client'+i,lastName:'L',email:`c${i}@x.com`},
 platform:'upi',transactionId:'TXN'+String(i).padStart(4,'0'),amount:1000+i,paymentDate:'2026-11-01T00:00:00.000Z',
 status:i===110?'pending':'approved',planName:'Plan',createdAt:'2026-11-01T00:00:00.000Z',
}));
beforeEach(()=>{global.fetch=jest.fn(async()=>({ok:true,json:async()=>({success:true,payments})})) as any;});
afterEach(cleanup);
const bodyRows=()=>within(screen.getAllByRole('rowgroup')[1]).getAllByRole('row');

test('shows 50 rows per page with working Previous and Next',async()=>{
 render(<OtherPlatformPaymentsPage/>);
 await waitFor(()=>expect(screen.getByText('TXN0000')).toBeInTheDocument());
 expect(bodyRows()).toHaveLength(50);
 expect(screen.getByText('Showing 1-50 of 120')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Previous'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Next'}));
 expect(screen.getByText('TXN0050')).toBeInTheDocument();
 expect(screen.queryByText('TXN0000')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Next'}));
 expect(bodyRows()).toHaveLength(20);
 expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Next'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Previous'}));
 expect(screen.getByText('Showing 51-100 of 120')).toBeInTheDocument();
});

test('search still covers all payments and jumps back to page 1',async()=>{
 render(<OtherPlatformPaymentsPage/>);
 await waitFor(()=>expect(screen.getByText('TXN0000')).toBeInTheDocument());
 fireEvent.click(screen.getByRole('button',{name:'Next'}));
 fireEvent.change(screen.getByPlaceholderText('Search payments...'),{target:{value:'TXN0115'}});
 await waitFor(()=>expect(bodyRows()).toHaveLength(1));
 expect(screen.getByText('TXN0115')).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Next'})).not.toBeInTheDocument();
});

test('a pending payment on a later page can still be approved',async()=>{
 render(<OtherPlatformPaymentsPage/>);
 await waitFor(()=>expect(screen.getByText('TXN0000')).toBeInTheDocument());
 expect(screen.queryByRole('button',{name:/Approve/})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Next'}));
 fireEvent.click(screen.getByRole('button',{name:'Next'}));
 expect(within(bodyRows().find(r=>within(r).queryByText('TXN0110'))!).getByRole('button',{name:/Approve/})).toBeInTheDocument();
});
