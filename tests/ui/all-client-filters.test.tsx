import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AllClientFilters, EMPTY_ALL_CLIENT_FILTERS, type AllClientFilterValues } from '@/components/admin/AllClientFilters';
import AdminAllClientsPage from '@/app/admin/allclients/page';

jest.mock('next-auth/react', () => ({ useSession: () => ({status:'authenticated'}) }));
jest.mock('@/components/admin/ProfessionalGrid', () => ({ProfessionalSection: () => null}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/components/layout/DashboardLayout', () => ({ __esModule: true, default: ({children}: any) => <main>{children}</main> }));
const staff = [{_id:'d1', firstName:'Sample', lastName:'Dietitian'}];
function Fixture({initial = EMPTY_ALL_CLIENT_FILTERS}: {initial?: AllClientFilterValues}) {
  const [value, onChange] = useState(initial);
  return <AllClientFilters value={value} onChange={onChange} dietitians={staff} healthCounselors={[]} total={42}/>;
}
afterEach(() => { cleanup(); jest.useRealTimers(); });
test('keeps advanced selections visible as removable chips when the panel is collapsed', () => {
  render(<Fixture initial={{...EMPTY_ALL_CLIENT_FILTERS, dietitian:'d1', assignment:'true', onboarding:'done'}}/>);
  expect(screen.getByRole('button', {name:/More filters/})).toHaveAttribute('aria-expanded','true');
  expect(screen.getByLabelText('Primary dietitian')).toBeVisible();
  fireEvent.click(screen.getByRole('button', {name:/More filters/}));
  expect(screen.getByRole('button', {name:/More filters/})).toHaveAttribute('aria-expanded','false');
  expect(screen.getByRole('button', {name:'Remove Dietitian: Sample Dietitian'})).toBeVisible();
  fireEvent.click(screen.getByRole('button', {name:'Remove Dietitian: Sample Dietitian'}));
  expect(screen.queryByRole('button', {name:/Remove Dietitian/})).not.toBeInTheDocument();
  expect(screen.getByRole('button', {name:'Remove Assignment: Assigned'})).toBeVisible();
  fireEvent.click(screen.getByRole('button', {name:'Clear all'}));
  expect(screen.queryByRole('list', {name:'Active filters'})).not.toBeInTheDocument();
});
test('clears search without losing keyboard focus and describes reversed date ranges', () => {
  render(<Fixture initial={{...EMPTY_ALL_CLIENT_FILTERS, search:'Sample'}}/>);
  fireEvent.click(screen.getByRole('button', {name:'Clear search'}));
  expect(screen.getByRole('searchbox')).toHaveFocus();
  fireEvent.change(screen.getByLabelText('From'), {target:{value:'2026-09-20'}});
  fireEvent.change(screen.getByLabelText('To'), {target:{value:'2026-09-01'}});
  expect(screen.getByRole('alert')).toHaveTextContent('Choose a “To” date');
  expect(screen.getByLabelText('To')).toHaveAttribute('aria-invalid','true');
});

test('debounces requests, rejects stale responses and skips invalid date ranges', async () => {
  jest.useFakeTimers();
  const requests: {url:string, signal:AbortSignal, resolve:(value:any)=>void}[] = [];
  global.fetch = jest.fn((url:any, options:any) => {
    if (!String(url).startsWith('/api/admin/clients?')) return Promise.resolve({ok:true,json:async()=>({})});
    return new Promise(resolve => requests.push({url:String(url),signal:options.signal,resolve}));
  }) as any;
  render(<AdminAllClientsPage/>);
  await act(async()=>{});
  expect(requests).toHaveLength(1);
  fireEvent.change(screen.getByRole('searchbox'), {target:{value:'Sam'}});
  fireEvent.change(screen.getByRole('searchbox'), {target:{value:'Sample'}});
  await act(async()=>{jest.advanceTimersByTime(299);});
  expect(requests).toHaveLength(1);
  expect(requests[0].signal.aborted).toBe(true);
  await act(async()=>{jest.advanceTimersByTime(1);});
  expect(requests).toHaveLength(2);
  expect(requests[1].url).toContain('search=Sample');
  await act(async()=>{requests[1].resolve({ok:true,json:async()=>({clients:[],pagination:{total:7,pages:1}})});});
  expect(screen.getByRole('status')).toHaveTextContent('7 clients matching your filters');
  await act(async()=>{requests[0].resolve({ok:true,json:async()=>({clients:[],pagination:{total:999,pages:20}})});});
  expect(screen.getByRole('status')).toHaveTextContent('7 clients matching your filters');
  fireEvent.change(screen.getByLabelText('From'), {target:{value:'2026-09-20'}});
  const beforeInvalid = requests.length;
  fireEvent.change(screen.getByLabelText('To'), {target:{value:'2026-09-01'}});
  await act(async()=>{jest.advanceTimersByTime(300);});
  expect(requests).toHaveLength(beforeInvalid);
  expect(screen.getByRole('alert')).toBeVisible();
});
