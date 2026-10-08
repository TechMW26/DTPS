import {SocketClient} from '@/lib/realtime/socket-client';
import {SOCKET_EVENTS} from '@/lib/realtime/socket-events';

class FakeEventSource {
 static sources:FakeEventSource[]=[];
 onmessage:((event:any)=>void)|null=null;
 onerror:(()=>void)|null=null;
 closed=false;
 constructor(public url:string){FakeEventSource.sources.push(this);}
 close(){this.closed=true;}
 message(event:string,data:unknown={},id=''){
  this.onmessage?.({data:JSON.stringify({event,data}),lastEventId:id});
 }
}
describe('foreground event-stream cost controls',()=>{
 let client:SocketClient;
 let descriptors:Record<string,PropertyDescriptor|undefined>;
 beforeEach(()=>{
  descriptors=Object.fromEntries(['window','document','navigator','EventSource'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  Object.defineProperty(globalThis,'window',{configurable:true,value:new EventTarget()});
  Object.defineProperty(globalThis,'document',{configurable:true,value:Object.assign(new EventTarget(),{visibilityState:'visible'})});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
  Object.defineProperty(globalThis,'EventSource',{configurable:true,value:FakeEventSource});
  FakeEventSource.sources=[];jest.useFakeTimers();client=new SocketClient();
 });
 afterEach(()=>{
  client.disconnect();jest.useRealTimers();
  for(const [key,descriptor] of Object.entries(descriptors)){
   if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);
  }
 });
 function hide(){Object.assign(document,{visibilityState:'hidden'});document.dispatchEvent(new Event('visibilitychange'));}
 function show(){Object.assign(document,{visibilityState:'visible'});document.dispatchEvent(new Event('visibilitychange'));}
 it('does not open or retry streams in a hidden tab',()=>{
  hide();client.connect();jest.advanceTimersByTime(300_000);
  expect(FakeEventSource.sources).toHaveLength(0);
  show();expect(FakeEventSource.sources).toHaveLength(1);
 });
 it('closes hidden streams, retains the cursor, and resyncs after reconnect',()=>{
  const message=jest.fn(),recovered=jest.fn();client.on('message',message);client.on(SOCKET_EVENTS.SOCKET_RECOVERED,recovered);
  client.connect();const first=FakeEventSource.sources[0];
  first.message('connected');first.message('message',{text:'one'},'1000:a');
  hide();jest.advanceTimersByTime(10_000);expect(first.closed).toBe(true);expect(client.connected).toBe(false);
  // Late transport callbacks cannot trigger retries or leak stale events.
  first.onerror?.();first.message('message',{text:'stale'},'1001:b');
  jest.advanceTimersByTime(300_000);expect(FakeEventSource.sources).toHaveLength(1);
  show();const resumed=FakeEventSource.sources[1];
  expect(resumed.url).toContain('cursor=1000%3Aa');
  resumed.message('connected');resumed.message('message',{text:'duplicate'},'1000:a');resumed.message('message',{text:'two'},'2000:b');
  expect(recovered).toHaveBeenCalledTimes(1);
  expect(message.mock.calls.map(([data])=>data.text)).toEqual(['one','two']);
  expect(client.connected).toBe(true);
 });
 it('cancels pending retry timers offline and resumes once online',()=>{
  client.connect();FakeEventSource.sources[0].onerror?.();
  Object.assign(navigator,{onLine:false});window.dispatchEvent(new Event('offline'));
  jest.advanceTimersByTime(120_000);expect(FakeEventSource.sources).toHaveLength(1);
  Object.assign(navigator,{onLine:true});window.dispatchEvent(new Event('online'));
  window.dispatchEvent(new Event('online'));expect(FakeEventSource.sources).toHaveLength(2);
 });
 it('never reconnects after explicit disconnect/signout, even on browser lifecycle events',()=>{
  client.connect();hide();client.disconnect();show();
  window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('pageshow'));
  jest.advanceTimersByTime(120_000);expect(FakeEventSource.sources).toHaveLength(1);
 });
 it('retains active-tab error backoff and event delivery',()=>{
  client.connect();FakeEventSource.sources[0].onerror?.();
  jest.advanceTimersByTime(999);expect(FakeEventSource.sources).toHaveLength(1);
  jest.advanceTimersByTime(1);expect(FakeEventSource.sources).toHaveLength(2);
  const receive=jest.fn();client.on('notification',receive);
  FakeEventSource.sources[1].message('connected');FakeEventSource.sources[1].message('notification',{unread:3});
  expect(receive).toHaveBeenCalledWith({unread:3});
 });
 it('retains the same stream during a brief tab switch',()=>{
  client.connect();hide();jest.advanceTimersByTime(5000);show();jest.advanceTimersByTime(10_000);
  expect(FakeEventSource.sources).toHaveLength(1);expect(FakeEventSource.sources[0].closed).toBe(false);
 });
 it('closes on pagehide and reconnects after a BFCache return',()=>{
  client.connect();window.dispatchEvent(new Event('pagehide'));
  expect(FakeEventSource.sources[0].closed).toBe(true);
  window.dispatchEvent(new Event('pageshow'));expect(FakeEventSource.sources).toHaveLength(2);
 });
});
