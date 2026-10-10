import {MongoMemoryReplSet} from 'mongodb-memory-server';
import {spawn} from 'node:child_process';
if(process.env.VERCEL||process.env.NODE_ENV==='production')throw new Error('Local MongoDB tests cannot run in production');
const files=process.argv.slice(2);
if(files.some(file=>!/^tests\/database\/[A-Za-z0-9_.-]+\.test\.ts$/.test(file)))throw new Error('Only explicit database test files are supported');
const replica=await MongoMemoryReplSet.create({replSet:{count:1},instanceOpts:[{storageEngine:'wiredTiger'}]});
const uri=replica.getUri('dtps_test');
const env={...process.env,DATABASE_PROVIDER:'mongodb',DTPS_MONGODB_LOCAL_TEST:'true',MONGODB_URI:uri,MONGODB_TEST_URI:uri,MONGODB_DATABASE:'dtps_test',REDIS_CACHE_ENABLED:'false',DTPS_NATIVE_PREVIEW:'true'};
try {
 const child=spawn(process.execPath,['node_modules/jest/bin/jest.js','--config','tests/database/jest.mongodb.config.cjs','--runInBand',...files],{env,stdio:'inherit'});
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>resolve(code??1));});
 process.exitCode=code;
} finally {await replica.stop();}
