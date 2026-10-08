import React from 'react';
import {act,render,screen,waitFor} from '@testing-library/react';
import {UnreadCountProvider,useUnreadCounts} from '@/contexts/UnreadCountContext';
import {SOCKET_EVENTS} from '@/lib/realtime/socket-events';
const mockListeners=new Map<string,Set<(data:any)=>void>>();
const mockSession={user:{id:'client'}};
jest.mock('next-auth/react',()=>({useSession:()=>({data:mockSession,status:'authenticated'})}));
jest.mock('@/lib/realtime/socket-client',()=>({socketClient:{connected:true,on:(event:string,callback:(data:any)=>void)=>{
 const listeners=mockListeners.get(event)||new Set();listeners.add(callback);mockListeners.set(event,listeners);return ()=>listeners.delete(callback);
}}}));
function View(){const {counts}=useUnreadCounts();return <div data-testid="counts">{counts.messages}/{counts.notifications}</div>;}
function emit(event:string,data:any={}){for(const callback of mockListeners.get(event)||[])callback(data);}
beforeEach(()=>{
 mockListeners.clear();
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
 Object.defineProperty(navigator,'onLine',{configurable:true,value:true});
 global.fetch=jest.fn(async()=>({ok:true,json:async()=>({messages:7,notifications:3})})) as any;
});
it('reconciles badges when a foreground stream recovers after the replay window',async()=>{
 render(<UnreadCountProvider><View/></UnreadCountProvider>);
 await waitFor(()=>expect(screen.getByTestId('counts').textContent).toBe('7/3'));
 (fetch as jest.Mock).mockClear();
 (fetch as jest.Mock).mockResolvedValue({ok:true,json:async()=>({messages:11,notifications:4})});
 await act(async()=>{emit(SOCKET_EVENTS.SOCKET_RECOVERED);});
 expect(fetch).toHaveBeenCalledTimes(1);
 expect(screen.getByTestId('counts').textContent).toBe('11/4');
});
it('does not fetch unread counts when the stream disconnects because the tab is hidden',async()=>{
 render(<UnreadCountProvider><View/></UnreadCountProvider>);
 await waitFor(()=>expect(screen.getByTestId('counts').textContent).toBe('7/3'));
 (fetch as jest.Mock).mockClear();
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
 await act(async()=>{emit('disconnect');emit(SOCKET_EVENTS.SOCKET_RECOVERED);});
 expect(fetch).not.toHaveBeenCalled();
 expect(screen.getByTestId('counts').textContent).toBe('7/3');
});
it('does not fetch offline and still applies live active-tab badge events',async()=>{
 render(<UnreadCountProvider><View/></UnreadCountProvider>);
 await waitFor(()=>expect(screen.getByTestId('counts').textContent).toBe('7/3'));
 (fetch as jest.Mock).mockClear();
 Object.defineProperty(navigator,'onLine',{configurable:true,value:false});
 await act(async()=>{emit(SOCKET_EVENTS.SOCKET_RECOVERED);});
 expect(fetch).not.toHaveBeenCalled();
 Object.defineProperty(navigator,'onLine',{configurable:true,value:true});
 act(()=>{emit(SOCKET_EVENTS.UNREAD_COUNTS,{messages:2,notifications:1});});
 expect(screen.getByTestId('counts').textContent).toBe('2/1');
});
