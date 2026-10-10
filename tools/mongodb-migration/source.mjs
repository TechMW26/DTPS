import path from 'node:path';
import {createRequire} from 'node:module';
import {GoogleAuth} from 'google-auth-library';
import nextEnv from '@next/env';
import {arg,save} from './archive.mjs';
import {fixedTimeStream} from './inventory-stream.mjs';
export function sourceConnection(readTime){
 nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});const e=process.env;
 const project=arg('--project',e.FIRESTORE_NATIVE_PROJECT_ID),database=arg('--database',e.FIRESTORE_NATIVE_DATABASE_ID),credentials={client_email:e.FIRESTORE_NATIVE_CLIENT_EMAIL,private_key:e.FIRESTORE_NATIVE_PRIVATE_KEY?.replace(/\\n/g,'\n')};
 if(!project||!database||!credentials.client_email||!credentials.private_key)throw new Error('Source credentials required');
 const require=createRequire(path.resolve(arg('--source-runtime',e.FIRESTORE_EXPORT_RUNTIME||'.migration-backups/mongodb/export-runtime'),'package.json'));
 const {Firestore,Timestamp,Pipelines}=require('@google-cloud/firestore'),db=new Firestore({projectId:project,databaseId:database,credentials}),auth=new GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/datastore']});
 let token,expires=0;const base=`https://firestore.googleapis.com/v1/projects/${project}/databases/${database}/documents`;
 async function request(url,body,method='POST'){for(let attempt=0;attempt<7;attempt++){try{if(Date.now()>expires){token=await auth.getAccessToken();expires=Date.now()+40*60000;}const response=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)}),data=await response.json();if(!response.ok){const error=new Error(`Source request HTTP ${response.status}`);error.status=data.error?.status;error.reason=data.error?.details?.find(d=>d.reason)?.reason;error.permanent=(response.status!==429&&response.status<500)||['QUERY_MEMORY_EXCEEDED','EXECUTION_DEADLINE_EXCEEDED'].includes(error.reason);if(process.env.MIGRATION_PRIVATE_HTTP_ERROR_REPORT){save(process.env.MIGRATION_PRIVATE_HTTP_ERROR_REPORT,{code:response.status,error:data.error,at:new Date().toISOString()});}throw error;}return data;}catch(error){if(error.permanent||attempt===6)throw error;await new Promise(resolve=>setTimeout(resolve,Math.min(15000,500*2**attempt)));}}}
 const rest=(method,body)=>request(base+':'+method,body);
 const listDocuments=(collection,options={})=>{const params=new URLSearchParams({readTime,pageSize:String(options.pageSize||5000),'mask.fieldPaths':'__name__',showMissing:'true'});if(options.pageToken)params.set('pageToken',options.pageToken);return request(base+'/'+collection.split('/').map(encodeURIComponent).join('/')+'?'+params,undefined,'GET');};
 const control=(relative,body,method='GET')=>request(base.slice(0,-'/documents'.length)+'/'+relative,body,method);
 return {project,database,readTime,timestamp:Timestamp.fromDate(new Date(readTime)),db,Pipelines,base,listDocuments,control,stream:fixedTimeStream(require,db,Timestamp,readTime),snapshot:q=>db.runTransaction(tx=>tx.execute(q),{readOnly:true,readTime:Timestamp.fromDate(new Date(readTime))}),rest,close:()=>db.terminate()};
}
