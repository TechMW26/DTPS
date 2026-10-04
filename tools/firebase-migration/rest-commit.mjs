// Migration-only HTTPS transport. Credentials travel through stdin, never process arguments.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
export function restValue(value){
 if(value===null)return {nullValue:null};
 if(typeof value==='string')return {stringValue:value};
 if(typeof value==='boolean')return {booleanValue:value};
 if(typeof value==='number')return Number.isSafeInteger(value)?{integerValue:String(value)}:{doubleValue:Number.isFinite(value)?value:Number.isNaN(value)?'NaN':value>0?'Infinity':'-Infinity'};
 if(value instanceof Date)return {timestampValue:value.toISOString()};
 if(Buffer.isBuffer(value)||value instanceof Uint8Array)return {bytesValue:Buffer.from(value).toString('base64')};
 if(Array.isArray(value))return {arrayValue:{values:value.map(restValue)}};
 if(value&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null))return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([key,item])=>[key,restValue(item)]))}};
 throw new Error('Unsupported native REST value');
}
export async function commitNativeRest(app,records){
 if(app.options.projectId!=='dtps-2cbac'||process.env.VERCEL||process.env.NODE_ENV==='production')throw new Error('Only native staging REST imports are allowed');
 const root='projects/dtps-2cbac/databases/dtps-native-staging/documents';
 const writes=records.map(row=>{
  if(!row.ref.path||row.ref.path.split('/').length!==2)throw new Error('Invalid document path');
  if(row.delete===true)return {delete:root+'/'+row.ref.path};
  return {update:{name:root+'/'+row.ref.path,fields:restValue(row.data).mapValue.fields}};
 });
 const dir=path.resolve('.migration-backups/firebase/native/transport');fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const file=path.join(dir,randomBytes(16).toString('hex')+'.json');fs.writeFileSync(file,JSON.stringify({writes}),{mode:0o600});
 try{
  const {access_token:token}=await app.options.credential.getAccessToken();if(!token||/[\r\n"]/.test(token))throw new Error('Invalid credential');
  const config=`url = "https://firestore.googleapis.com/v1/${root}:commit"\nheader = "Authorization: Bearer ${token}"\nheader = "Content-Type: application/json"\n`;
  const result=await new Promise((resolve,reject)=>{
   const child=spawn('/usr/bin/curl',['--silent','--show-error','--fail-with-body','--max-time','60','--request','POST','--data-binary','@'+file,'--config','-'],{stdio:['pipe','pipe','pipe']});
   let output='';child.stdout.setEncoding('utf8');child.stdout.on('data',part=>{output+=part;if(output.length>2*1024*1024)child.kill();});child.stderr.resume();
   child.on('error',()=>reject(new Error('REST transport unavailable')));child.on('close',code=>{
    let parsed;try{parsed=JSON.parse(output);}catch{reject(Object.assign(new Error('REST transport failed'),{code:14}));return;}
    if(code!==0||parsed.error){reject(Object.assign(new Error('REST import request failed'),{code:parsed.error?.code===429?8:parsed.error?.code>=500?14:parsed.error?.code||14}));return;}
    resolve(parsed);
   });child.stdin.on('error',()=>{});child.stdin.end(config);
  });
  if(result.writeResults?.length!==records.length)throw new Error('REST commit acknowledgement mismatch');
 }finally{fs.unlinkSync(file);}
}
