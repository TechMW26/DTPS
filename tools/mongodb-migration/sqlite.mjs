import {spawn} from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
export function sqliteIndex(file){
 const child=spawn('python3',[path.resolve('tools/mongodb-migration/baseline-index.py'),'serve',file],{stdio:['pipe','pipe','pipe']});const pending=new Map();let serial=0,errors='';
 child.stderr.on('data',bytes=>{errors=(errors+String(bytes)).slice(-4000);});
 const lines=readline.createInterface({input:child.stdout});lines.on('line',line=>{const response=JSON.parse(line),wait=pending.get(response.id);pending.delete(response.id);if(response.error)wait?.reject(new Error(response.error));else wait?.resolve(response.result);});
 const reject=error=>{for(const wait of pending.values())wait.reject(error);pending.clear();};child.on('error',reject);child.on('exit',code=>{if(code!==0)reject(new Error('Local baseline index failed: '+errors));else reject(new Error('Local baseline index closed'));});
 function call(cmd,args={}){return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,cmd,...args},(_key,value)=>typeof value==='number'&&Object.is(value,-0)?'-0':value)+'\n',error=>{if(error){pending.delete(id);reject(error);}});});}
 return {call,async close(){try{await call('close');}finally{child.stdin.end();lines.close();}},kill:()=>child.kill()};
}
