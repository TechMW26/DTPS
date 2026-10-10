import fs from 'node:fs';
import path from 'node:path';
export function archiveLock(dir,owner){
 const file=path.join(dir,'.'+owner+'.lock');
 for(let attempt=0;attempt<2;attempt++){
  try{const fd=fs.openSync(file,'wx',0o600);fs.writeFileSync(fd,JSON.stringify({pid:process.pid,owner,startedAt:new Date().toISOString()}));fs.fsyncSync(fd);fs.closeSync(fd);return ()=>{try{const current=JSON.parse(fs.readFileSync(file));if(current.pid===process.pid)fs.unlinkSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}};}
  catch(error){if(error.code!=='EEXIST')throw error;const current=JSON.parse(fs.readFileSync(file));let alive=true;try{process.kill(current.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;else throw e;}if(alive)throw new Error('A live migration worker already owns this archive checkpoint');fs.unlinkSync(file);}
 }
 throw new Error('Could not acquire archive checkpoint lock');
}
