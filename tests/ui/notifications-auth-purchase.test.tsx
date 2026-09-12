/** @jest-environment jsdom */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import SignIn from '@/app/client-auth/signin/page';
import { NotificationPermissionBanner } from '@/components/notifications/NotificationPermissionBanner';
import ServicePlansSwiper from '@/components/client/ServicePlansSwiper';

let mockAuthenticated=false;
const mockRequestPermission=jest.fn(async()=>false);
const mockRegisterToken=jest.fn(async()=>false);
jest.mock('@/hooks/usePushNotifications',()=>({usePushNotifications:()=>({isSupported:true,permission:'default',requestPermission:mockRequestPermission,registerToken:mockRegisterToken})}));
jest.mock('next-auth/react', () => ({ useSession: () => ({status:mockAuthenticated?'authenticated':'unauthenticated',data:mockAuthenticated?{user:{id:'test-prompt',role:'client'}}:null}), signIn:jest.fn(),getSession:jest.fn() }));
jest.mock('next/navigation', () => {const router={push:jest.fn(),replace:jest.fn()};return {useRouter:()=>router};});
jest.mock('next/image', () => ({__esModule:true,default:({priority: _priority,...props}:any)=><img {...props}/>}));
jest.mock('@/lib/firebase/phoneAuthClient', () => ({isNativeIosApp:()=>false,clearFirebaseRecaptcha:jest.fn()}));
const mockOpen=jest.fn();
let mockCheckoutOptions:any;
jest.mock('@/lib/payments/razorpay-checkout', () => ({
 assertRazorpayCheckoutPayload:jest.fn(),
 loadRazorpayCheckout:jest.fn(async()=>class {constructor(options:any){mockCheckoutOptions=options;} open(){mockOpen();}}),
}));

beforeEach(()=>{
 Object.defineProperty(window,'matchMedia',{writable:true,value:jest.fn(()=>({matches:false,addEventListener:jest.fn(),removeEventListener:jest.fn()}))});
 Element.prototype.scrollIntoView=jest.fn();
 mockOpen.mockClear();
 mockAuthenticated=false;
 localStorage.clear();
});
afterEach(()=>{act(()=>toast.dismiss());cleanup();});

test('global notifications share top placement and retain accessible actions and dismissal',async()=>{
 render(<Toaster/>);
 act(()=>{toast('Appointment updated',{description:'Your new time is ready.',action:{label:'Open',onClick:jest.fn()},duration:Infinity});});
 expect(await screen.findByText('Appointment updated')).toBeVisible();
 const host=document.querySelector('[data-sonner-toaster]');
 expect(host).toHaveAttribute('data-y-position','top');
 expect(host).toHaveAttribute('data-x-position','center');
 expect(screen.getByRole('button',{name:'Open'})).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Close toast'}));
 await waitFor(()=>expect(screen.queryByText('Appointment updated')).not.toBeInTheDocument());
});

test('login keeps phone entry while switching modes and labels the password visibility control',async()=>{
 render(<SignIn/>);
 const phone=await screen.findByLabelText('Phone number');
 expect(screen.getByRole('button',{name:'Send OTP'})).toBeDisabled();
 fireEvent.change(phone,{target:{value:'9876543210'}});
 expect(screen.getByRole('button',{name:'Send OTP'})).toBeEnabled();
 fireEvent.click(screen.getByRole('button',{name:'Login with Email'}));
 expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete','email');
 expect(screen.getByLabelText('Password',{exact:true})).toHaveAttribute('type','password');
 fireEvent.click(screen.getByRole('button',{name:'Show password'}));
 expect(screen.getByLabelText('Password',{exact:true})).toHaveAttribute('type','text');
 fireEvent.click(screen.getByRole('button',{name:'Log In'}));
 expect(await screen.findByText('Email is required')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Login with Phone OTP'}));
 expect(screen.getByLabelText('Phone number')).toHaveValue('9876543210');
});

test('purchase selection is accessible, checkout blocks duplicate orders and dismissal restores selection',async()=>{
 const plans=[{_id:'demo',name:'Demo plan',category:'general-wellness',pricingTiers:[{_id:'one',durationDays:30,durationLabel:'1 Month',amount:6000,isActive:true},{_id:'three',durationDays:90,durationLabel:'3 Months',amount:15000,isActive:true}]}];
 const fetchMock=jest.fn(async (_url:any,options?:any)=>({ok:true,json:async()=>options?.method==='POST'?{paymentId:'synthetic'}:{plans,hasAnyPurchase:false}}));
 global.fetch=fetchMock as unknown as typeof fetch;
 render(<ServicePlansSwiper/>);
 fireEvent.click(await screen.findByRole('button',{name:/Get Started/i}));
 expect(screen.getByRole('dialog',{name:'Demo plan'})).toBeVisible();
 const choice=screen.getByRole('button',{name:/3 Months 90 days plan/});
 fireEvent.click(choice);
 expect(choice).toHaveAttribute('aria-pressed','true');
 fireEvent.click(screen.getByRole('button',{name:'Pay & Subscribe'}));
 await waitFor(()=>expect(mockOpen).toHaveBeenCalledTimes(1));
 expect(screen.getByRole('button',{name:/Processing/})).toBeDisabled();
 expect(fetchMock.mock.calls.filter(([,opts])=>opts?.method==='POST')).toHaveLength(1);
 act(()=>mockCheckoutOptions.modal.ondismiss());
 expect(screen.getByRole('button',{name:'Pay & Subscribe'})).toBeEnabled();
 expect(screen.getByRole('button',{name:/3 Months 90 days plan/})).toHaveAttribute('aria-pressed','true');
 fireEvent.click(screen.getByRole('button',{name:'Close purchase options'}));
 await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

 test('notification permission prompt remembers dismissal and reports permission denial',async()=>{
 mockAuthenticated=true;
 const view=render(<><Toaster/><NotificationPermissionBanner/></>);
 fireEvent.click(await screen.findByRole('button',{name:'Enable'}));
 expect(await screen.findByText('Notifications are not enabled')).toBeVisible();
 expect(mockRequestPermission).toHaveBeenCalledTimes(1);
 expect(mockRegisterToken).not.toHaveBeenCalled();
 view.unmount();
 render(<><Toaster/><NotificationPermissionBanner/></>);
 fireEvent.click(await screen.findByRole('button',{name:'Later'}));
 expect(localStorage.getItem('notification_banner_dismissed_test-prompt')).toBe('true');
 });
