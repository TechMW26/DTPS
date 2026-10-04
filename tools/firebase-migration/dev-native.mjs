// Local preview uses the dedicated native database credentials, never the push project.
import fs from 'node:fs';
import dotenv from 'dotenv';
import {spawn} from 'node:child_process';
if(process.env.VERCEL||process.env.NODE_ENV==='production')throw new Error('Native preview is local only');
const read=file=>fs.existsSync(file)?dotenv.parse(fs.readFileSync(file)):{};
const source={...read('.env'),...read('.env.local'),...process.env};
const blob=read('.migration-backups/firebase/native/blob-config.env');
const args=process.argv.slice(2),portArg=args.findIndex(arg=>arg==='--port'||arg==='-p');
const port=(portArg>=0?args[portArg+1]:process.env.NATIVE_PREVIEW_PORT)||'3002';
if(!/^\d+$/.test(port)||Number(port)<1||Number(port)>65535)throw new Error('Invalid port');
const origin='http://localhost:'+port;
const env={...source,...blob,NODE_ENV:'development',DTPS_NATIVE_PREVIEW:'true',DATABASE_PROVIDER:'firestore-native',REDIS_CACHE_ENABLED:'false',REDIS_URL:'',
 NEXTAUTH_URL:origin,NEXT_PUBLIC_APP_URL:origin,NEXT_PUBLIC_BASE_URL:origin,SMTP_HOST:'',SMTP_USER:'',SMTP_PASS:'',AISENSY_API_KEY:'',
};
for(const key of ['MONGODB_URI','FIRESTORE_MONGODB_URI','NEXT_PUBLIC_SOCKET_URL','SOCKET_BROADCAST_URL','SOCKET_INTERNAL_SECRET'])delete env[key];
if(!env.FIRESTORE_NATIVE_PROJECT_ID||env.FIRESTORE_NATIVE_DATABASE_ID!=='dtps-native-staging'||!env.FIRESTORE_NATIVE_CLIENT_EMAIL||!env.FIRESTORE_NATIVE_PRIVATE_KEY)throw new Error('Dedicated native staging credentials unavailable');
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--port',port],{env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill(signal));
child.on('exit',code=>{process.exitCode=code??1;});
