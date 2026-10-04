import {getAccessToken,getGlobalDefaultAccount} from 'firebase-tools/lib/auth.js';
const project='dtps-2cbac',database='dtps-native-staging';
const account=getGlobalDefaultAccount();if(!account?.tokens?.refresh_token)throw new Error('Firebase CLI sign-in required');
const token=await getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
const base=`https://firestore.googleapis.com/v1/projects/${project}/databases/${database}`;
for(const [collection,field,ttl] of [['_nativeDashboardSummaries','expiresAt',true],['_nativeDashboardEvents','expiresAt',true],['_nativeDashboardSummaries','payload',false]]){
 const name=`${base}/collectionGroups/${collection}/fields/${field}`;
 const response=await fetch(name+(process.argv.includes('--execute')?'?updateMask='+encodeURIComponent(ttl?'ttlConfig,indexConfig':'indexConfig'):''),{
  method:process.argv.includes('--execute')?'PATCH':'GET',headers:{authorization:`Bearer ${token.access_token}`,'content-type':'application/json'},
  ...(process.argv.includes('--execute')?{body:JSON.stringify({...(ttl?{ttlConfig:{}}:{}),indexConfig:{indexes:[]}})}:{})
 });
 const data=await response.json();if(!response.ok)throw new Error(`Field configuration failed (${response.status}): ${data.error?.message}`);
 console.log(JSON.stringify({collection,field,ttlState:data.ttlConfig?.state,operation:data.name,indexes:data.indexConfig?.indexes?.length}));
}
