// Additive index management for the isolated native staging database. Never drops indexes.
import fs from 'node:fs';
import dotenv from 'dotenv';
import {initializeApp,cert,deleteApp} from 'firebase-admin/app';
const read=p=>fs.existsSync(p)?dotenv.parse(fs.readFileSync(p)):{};
const env={...read('.env'),...read('.env.local'),...process.env};
if(env.VERCEL||env.NODE_ENV==='production'||env.FIRESTORE_NATIVE_DATABASE_ID!=='dtps-native-staging')throw Error('Native staging only');
const manifest=JSON.parse(fs.readFileSync('firestore.native.indexes.json'));
const credential=cert({projectId:env.FIRESTORE_NATIVE_PROJECT_ID,clientEmail:env.FIRESTORE_NATIVE_CLIENT_EMAIL,privateKey:env.FIRESTORE_NATIVE_PRIVATE_KEY.replace(/\\n/g,'\n')});
const app=initializeApp({projectId:env.FIRESTORE_NATIVE_PROJECT_ID,credential},'native-index-manager');
const base=`https://firestore.googleapis.com/v1/projects/${env.FIRESTORE_NATIVE_PROJECT_ID}/databases/${env.FIRESTORE_NATIVE_DATABASE_ID}`;
async function accessToken(){if(!process.argv.includes('--use-cli-account'))return credential.getAccessToken();const auth=await import('firebase-tools/lib/auth.js');const account=auth.getGlobalDefaultAccount();if(!account?.tokens?.refresh_token)throw Error('Sign in to Firebase CLI for index administration');return auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);}
async function request(url,body){const token=await accessToken();const r=await fetch(url,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token.access_token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(`Index API ${r.status}: ${data.error?.message||'request failed'}`);return data;}
const fieldKey=fields=>JSON.stringify(fields.filter(f=>f.fieldPath!=='__name__').map(f=>[f.fieldPath,f.order||f.arrayConfig]));
try{
 const existing=[];let page='';do{const data=await request(base+'/collectionGroups/-/indexes?pageSize=0'+(page?'&pageToken='+encodeURIComponent(page):''));existing.push(...data.indexes||[]);page=data.nextPageToken||'';}while(page);
 for(const spec of manifest.indexes){const found=existing.find(i=>i.name.split('/')[5]===spec.collectionGroup&&fieldKey(i.fields)===fieldKey(spec.fields));
  if(found){console.log(JSON.stringify({collection:spec.collectionGroup,state:found.state,fields:spec.fields.map(f=>f.fieldPath)}));continue;}
  if(!process.argv.includes('--execute')){console.log(JSON.stringify({collection:spec.collectionGroup,state:'MISSING',fields:spec.fields.map(f=>f.fieldPath)}));continue;}
  const result=await request(base+'/collectionGroups/'+encodeURIComponent(spec.collectionGroup)+'/indexes',{queryScope:'COLLECTION_GROUP',apiScope:'ANY_API',density:'DENSE',fields:spec.fields});
  console.log(JSON.stringify({collection:spec.collectionGroup,state:'CREATING',operation:result.name}));
 }
}finally{await deleteApp(app);}
