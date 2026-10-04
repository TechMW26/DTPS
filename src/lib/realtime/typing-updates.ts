/** Ephemeral typing state. No message content, permissions, or server results are cached. */
export class TypingUpdates {
 private states=new Map<string,{desired?:boolean;confirmed?:boolean;sentAt:number;pending?:Promise<void>;controller?:AbortController;closed:boolean}>();
 send(receiverId:string,isTyping:boolean):Promise<void>{
  if(!/^[a-f0-9]{24}$/i.test(receiverId))return Promise.resolve();
  let state=this.states.get(receiverId);
  if(!state){state={sentAt:0,closed:false};this.states.set(receiverId,state);}
  state.desired=isTyping;
  if(state.pending)return state.pending;
  const current=state;
  const operation=Promise.resolve().then(async()=>{
   while(!current.closed&&current.desired!==undefined){
    const value=current.desired;current.desired=undefined;
    // Server indicators expire after ten seconds; active typing renews every four.
    if(current.confirmed===value&&(!value||Date.now()-current.sentAt<4000))continue;
    const controller=new AbortController();current.controller=controller;
    const timeout=setTimeout(()=>controller.abort(),5000);
    try{
     const response=await fetch('/api/realtime/typing',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({receiverId,isTyping:value}),signal:controller.signal});
     if(response.ok){current.confirmed=value;current.sentAt=Date.now();}else current.confirmed=undefined;
    }catch{current.confirmed=undefined;}finally{clearTimeout(timeout);current.controller=undefined;}
   }
  }).finally(()=>{if(current.pending===operation)current.pending=undefined;});
  current.pending=operation;return operation;
 }
 dispose(){for(const state of this.states.values()){state.closed=true;state.desired=undefined;state.controller?.abort();}this.states.clear();}
}
