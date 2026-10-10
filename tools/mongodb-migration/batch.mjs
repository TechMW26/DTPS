/** Bounded independent Mongo requests, retaining the first failure until all in-flight work drains. */
export function requestPool(max=8){
 const pending=new Set();let failure;
 return {
  async add(work){
   if(failure)throw failure;
   const promise=Promise.resolve().then(work).catch(error=>{failure||=error;}).finally(()=>pending.delete(promise));pending.add(promise);
   if(pending.size>=max)await Promise.race(pending);
   if(failure)throw failure;
  },
  async drain(){await Promise.all(pending);if(failure)throw failure;},
 };
}
