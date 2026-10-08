/** Bound paid-provider input before parsing; never trust a client Content-Length. */
export class RecipeInputError extends Error {
  constructor(message:string,public status=400){super(message);}
}
export async function readRecipeInput(request:Request,maxBytes:number):Promise<Record<string,unknown>> {
  request.signal.throwIfAborted();
  if(Number(request.headers.get('content-length')||0)>maxBytes)throw new RecipeInputError('Recipe request is too large',413);
  const reader=request.body?.getReader();
  if(!reader)throw new RecipeInputError('Invalid request body');
  const parts:Uint8Array[]=[];let size=0;
  try {
    for(;;){
      request.signal.throwIfAborted();
      const {value,done}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>maxBytes){await reader.cancel();throw new RecipeInputError('Recipe request is too large',413);}
      parts.push(value);
    }
  }finally{reader.releaseLock();}
  request.signal.throwIfAborted();
  try{
    const body=JSON.parse(Buffer.concat(parts).toString('utf8'));
    if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();
    return body;
  }catch{throw new RecipeInputError('Invalid request body');}
}
