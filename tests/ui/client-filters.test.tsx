import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ClientFilters } from '@/components/clients/ClientFilters';
import { EMPTY_CLIENT_FILTERS, type ClientFilterValues } from '@/components/clients/client-filter-values';
import ClientsPage from '@/app/dietician/clients/page';

jest.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams()}));
jest.mock('next-auth/react',()=>({useSession:()=>({status:'authenticated',data:{user:{id:'test-admin',role:'admin'}}})}));
jest.mock('@/hooks/usePermissions',()=>({usePermissions:()=>({hasPermission:()=>false,loading:false})}));
jest.mock('@/components/layout/DashboardLayout',()=>({__esModule:true,default:({children}:any)=><main>{children}</main>}));
function Fixture({initial=EMPTY_CLIENT_FILTERS}: {initial?:ClientFilterValues}) {
 const [draft,setDraft]=useState(initial), [applied,setApplied]=useState(initial), [search,setSearch]=useState('');
 return <ClientFilters draft={draft} applied={applied} onChange={setDraft} onApply={()=>setApplied(draft)} onClear={()=>{setDraft(EMPTY_CLIENT_FILTERS);setApplied(EMPTY_CLIENT_FILTERS);setSearch('');}} onRemove={keys=>{const clear=Object.fromEntries(keys.map(key=>[key,'']));setDraft({...draft,...clear});setApplied({...applied,...clear});}} search={search} onSearch={setSearch} dietitians={[]} tags={[]} total={12} loading={false}/>;
}
beforeEach(()=>{Element.prototype.scrollIntoView=jest.fn();Element.prototype.hasPointerCapture=jest.fn(()=>false);Element.prototype.releasePointerCapture=jest.fn();});
afterEach(()=>{cleanup();jest.useRealTimers();});
const selectOption=(label:string, option:string)=>{fireEvent.keyDown(screen.getByRole('combobox',{name:label}),{key:'ArrowDown'});fireEvent.click(screen.getByRole('option',{name:option}));};
test('starts expanded and keeps draft changes separate from applied chips',()=>{
 render(<Fixture/>);
 expect(screen.getByRole('button',{name:/More filters/})).toHaveAttribute('aria-expanded','true');
 fireEvent.change(screen.getByLabelText('Plan name'),{target:{value:'Wellness'}});
 expect(screen.getByText('You have unapplied changes.')).toBeVisible();
 expect(screen.queryByRole('button',{name:'Remove Plan: Wellness'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Apply filters'}));
 fireEvent.click(screen.getByRole('button',{name:/More filters/}));
 expect(screen.getByRole('button',{name:'Remove Plan: Wellness'})).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Remove Plan: Wellness'}));
 expect(screen.queryByRole('list',{name:'Active filters'})).not.toBeInTheDocument();
});
test('blocks reversed date ranges and removes dates when plan timing changes',()=>{
 render(<Fixture initial={{...EMPTY_CLIENT_FILTERS,planDuration:'dateRange',planDurationFrom:'2026-09-01',planDurationTo:'2026-09-30'}}/>);
 fireEvent.change(screen.getByLabelText('Dietitian assigned from'),{target:{value:'2026-09-20'}});
 fireEvent.change(screen.getByLabelText('Dietitian assigned to'),{target:{value:'2026-09-01'}});
 expect(screen.getByRole('button',{name:'Apply filters'})).toBeDisabled();
 expect(screen.getByRole('alert')).toHaveTextContent('dietitian assignment');
 fireEvent.change(screen.getByLabelText('Dietitian assigned to'),{target:{value:'2026-09-25'}});
 selectOption('Plan timing','Ongoing plans');
 fireEvent.click(screen.getByRole('button',{name:'Apply filters'}));
 expect(screen.queryByRole('button',{name:/Remove Plan dates/})).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Remove Plan timing: Ongoing plans'})).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Clear all'}));
 expect(screen.queryByRole('list',{name:'Active filters'})).not.toBeInTheDocument();
});
test('applies status on the server, preserves other drafts on chip removal, and resets search',async()=>{
 jest.useFakeTimers();
 const urls:string[]=[];
 global.fetch=jest.fn(async(url:any)=>{urls.push(String(url));return {ok:true,json:async()=>String(url).startsWith('/api/users/clients?')?{clients:[],pagination:{total:12,pages:1}}:{dietitians:[],tags:[]}};}) as any;
 render(<ClientsPage/>);
 await act(async()=>{});
 const clientUrls=()=>urls.filter(url=>url.startsWith('/api/users/clients?'));
 selectOption('Client status','Active');
 expect(clientUrls()).toHaveLength(1);
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Apply filters'}));});
 expect(clientUrls().at(-1)).toContain('status=active');
 fireEvent.change(screen.getByLabelText('Plan name'),{target:{value:'Unapplied plan'}});
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Remove Client status: Active'}));});
 expect(clientUrls().at(-1)).not.toContain('status=');
 expect(clientUrls().at(-1)).not.toContain('planName=');
 expect(screen.getByLabelText('Plan name')).toHaveValue('Unapplied plan');
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'Sample'}});
 await act(async()=>{jest.advanceTimersByTime(400);});
 expect(clientUrls().at(-1)).toContain('search=Sample');
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Clear all'}));});
 expect(screen.getByRole('searchbox')).toHaveValue('');
 expect(clientUrls().at(-1)).not.toMatch(/search=|status=|planName=/);
});
