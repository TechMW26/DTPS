import {TypingUpdates} from '@/lib/realtime/typing-updates';
const receiver='a'.repeat(24);
let updates:TypingUpdates,fetchMock:jest.Mock;
beforeEach(()=>{jest.useFakeTimers();updates=new TypingUpdates();fetchMock=jest.fn(async()=>({ok:true}));global.fetch=fetchMock;});
afterEach(()=>{updates.dispose();jest.useRealTimers();});
test('consolidates a keystroke burst, renews active typing, and stops immediately',async()=>{
 await Promise.all(Array.from({length:100},()=>updates.send(receiver,true)));
 expect(fetchMock).toHaveBeenCalledTimes(1);
 expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({receiverId:receiver,isTyping:true});
 await jest.advanceTimersByTimeAsync(4000);await updates.send(receiver,true);
 expect(fetchMock).toHaveBeenCalledTimes(2);
 await updates.send(receiver,false);await updates.send(receiver,false);
 expect(fetchMock).toHaveBeenCalledTimes(3);
 expect(JSON.parse(fetchMock.mock.calls[2][1].body).isTyping).toBe(false);
});
test('serializes stop after an in-flight start and isolates conversations',async()=>{
 let resolve!:(value:any)=>void;
 fetchMock.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 const started=updates.send(receiver,true);await jest.advanceTimersByTimeAsync(0);
 const stopped=updates.send(receiver,false);
 expect(fetchMock).toHaveBeenCalledTimes(1);
 resolve({ok:true});await Promise.all([started,stopped]);
 expect(fetchMock.mock.calls.map(([,o])=>JSON.parse(o.body).isTyping)).toEqual([true,false]);
 await updates.send('b'.repeat(24),true);expect(fetchMock).toHaveBeenCalledTimes(3);
});
test('failed requests can retry and disposal prevents queued work across sessions',async()=>{
 fetchMock.mockResolvedValueOnce({ok:false});await updates.send(receiver,true);await updates.send(receiver,true);
 expect(fetchMock).toHaveBeenCalledTimes(2);
 let reject!:(error:Error)=>void;
 fetchMock.mockImplementationOnce((_,options)=>new Promise((_,r)=>{reject=r;options.signal.addEventListener('abort',()=>r(new Error('aborted')));}));
 const pending=updates.send('b'.repeat(24),true);await jest.advanceTimersByTimeAsync(0);
 void updates.send('b'.repeat(24),false);updates.dispose();await pending;
 expect(fetchMock).toHaveBeenCalledTimes(3);
 expect(fetchMock.mock.calls[2][1].signal.aborted).toBe(true);
});
