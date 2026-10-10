// Read-only control-plane inventory: identifies separate databases before a data export is scoped.
import {GoogleAuth} from 'google-auth-library';
import nextEnv from '@next/env';
import {arg,save} from './archive.mjs';
nextEnv.loadEnvConfig(process.cwd(),true,{info(){},error(){}});
const e=process.env,project=arg('--project',e.FIRESTORE_NATIVE_PROJECT_ID);if(!project||!e.FIRESTORE_NATIVE_CLIENT_EMAIL||!e.FIRESTORE_NATIVE_PRIVATE_KEY)throw new Error('Firestore project credentials required');
const auth=new GoogleAuth({credentials:{client_email:e.FIRESTORE_NATIVE_CLIENT_EMAIL,private_key:e.FIRESTORE_NATIVE_PRIVATE_KEY.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/cloud-platform']});
const token=await auth.getAccessToken();const response=await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(project)}/databases`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});const data=await response.json();if(!response.ok)throw new Error(`Database inventory denied: HTTP ${response.status}`);
const report={project,checkedAt:new Date().toISOString(),configuredApplicationDatabase:e.FIRESTORE_NATIVE_DATABASE_ID,databases:(data.databases||[]).map(d=>({name:d.name,databaseId:d.name.split('/').at(-1),locationId:d.locationId,type:d.type,databaseEdition:d.databaseEdition,pointInTimeRecoveryEnablement:d.pointInTimeRecoveryEnablement,earliestVersionTime:d.earliestVersionTime})),scope:'Firestore databases only. Auth accounts, RTDB, IAM/billing and Blob bytes require independent retention/inventory.'};
if(arg('--report'))save(arg('--report'),report);console.log(JSON.stringify(report,null,2));
