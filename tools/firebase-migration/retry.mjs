// Only for idempotent staging operations. Never use this for unguarded increments or messages.
export function transientCode(error){
 const allowed=[4,8,10,13,14,'ETIMEDOUT','ECONNRESET','EPIPE','ENETUNREACH','EAI_AGAIN','ERR_SSL_SSLV3_ALERT_BAD_RECORD_MAC','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET'];
 for(let current=error,depth=0;current&&depth<4;current=current.cause,depth++)if(allowed.includes(current.code))return current.code;
 if(error?.name==='TimeoutError')return 'ETIMEDOUT';
 return null;
}
export async function retryTransient(operation,{attempts=6,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),onRetry=()=>{}}={}){
 for(let attempt=0;;attempt++){
  try{return await operation();}
  catch(error){
   const code=transientCode(error);if(attempt+1>=attempts||code===null)throw error;
   onRetry({attempt:attempt+1,code});
   await wait(Math.min(30000,1000*2**attempt));
  }
 }
}
