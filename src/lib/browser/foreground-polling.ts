/** Fallback refreshes only: explicit user actions and realtime events remain separate. */
export function startForegroundPolling(refresh:()=>void|Promise<unknown>,intervalMs:number){
 let stopped=false,pending=false,lastStarted=-Infinity;
 const tick=()=>{
  if(stopped||pending||document.visibilityState==='hidden'||navigator.onLine===false||Date.now()-lastStarted<1000)return;
  pending=true;lastStarted=Date.now();
  void Promise.resolve().then(()=>{if(!stopped)return refresh();}).catch(()=>{
   // Background refresh is best effort; the next tick retries.
  }).finally(()=>{pending=false;});
 };
 const timer=window.setInterval(tick,intervalMs);
 for(const name of ['focus','online'])window.addEventListener(name,tick);
 document.addEventListener('visibilitychange',tick);
 return ()=>{stopped=true;window.clearInterval(timer);for(const name of ['focus','online'])window.removeEventListener(name,tick);document.removeEventListener('visibilitychange',tick);};
}
