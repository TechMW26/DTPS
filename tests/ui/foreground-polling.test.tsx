import {startForegroundPolling} from '@/lib/browser/foreground-polling';
let stop:()=>void;
beforeEach(()=>{
 jest.useFakeTimers();
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
 Object.defineProperty(navigator,'onLine',{configurable:true,value:true});
});
afterEach(()=>{stop?.();jest.useRealTimers();});
test('skips hidden/offline ticks and coalesces focus with visibility on resume',async()=>{
 const refresh=jest.fn(async()=>{});stop=startForegroundPolling(refresh,20000);
 await jest.advanceTimersByTimeAsync(20000);expect(refresh).toHaveBeenCalledTimes(1);
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
 await jest.advanceTimersByTimeAsync(60000);expect(refresh).toHaveBeenCalledTimes(1);
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
 window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));
 await jest.advanceTimersByTimeAsync(0);expect(refresh).toHaveBeenCalledTimes(2);
 Object.defineProperty(navigator,'onLine',{configurable:true,value:false});
 await jest.advanceTimersByTimeAsync(60000);expect(refresh).toHaveBeenCalledTimes(2);
 Object.defineProperty(navigator,'onLine',{configurable:true,value:true});window.dispatchEvent(new Event('online'));
 await jest.advanceTimersByTimeAsync(0);expect(refresh).toHaveBeenCalledTimes(3);
});
test('never overlaps a slow refresh and resumes after a rejection',async()=>{
 let reject!:(error:Error)=>void;
 const refresh=jest.fn().mockImplementationOnce(()=>new Promise((_,r)=>{reject=r;})).mockResolvedValue(undefined);
 stop=startForegroundPolling(refresh,15000);
 await jest.advanceTimersByTimeAsync(60000);window.dispatchEvent(new Event('focus'));
 expect(refresh).toHaveBeenCalledTimes(1);
 reject(new Error('temporary'));await jest.advanceTimersByTimeAsync(15000);
 expect(refresh).toHaveBeenCalledTimes(2);
});
test('removes listeners and cancels a queued refresh after unmount',async()=>{
 const refresh=jest.fn();stop=startForegroundPolling(refresh,15000);
 window.dispatchEvent(new Event('focus'));stop();
 await jest.advanceTimersByTimeAsync(60000);window.dispatchEvent(new Event('online'));
 expect(refresh).not.toHaveBeenCalled();
});
