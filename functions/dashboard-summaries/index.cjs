const {initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {onDocumentWritten}=require('firebase-functions/v2/firestore');
const {invalidateDashboardSummary}=require('./invalidate.cjs');
initializeApp();
const emulator=process.env.FUNCTIONS_EMULATOR==='true';
const database=emulator?'(default)':'dtps-native-staging';
const options={database,region:'asia-south1',retry:true,maxInstances:5,memory:'256MiB'};
for(const [name,collection] of [['invalidatePlanSummaries','clientmealplans'],['invalidatePaymentSummaries','unifiedpayments']]){
 exports[name]=onDocumentWritten({...options,document:`${collection}/{id}`},async event=>{
  if((emulator?!event.project.startsWith('demo-'):event.project!=='dtps-2cbac')||event.database!==database)throw new Error('Unexpected database');
  await invalidateDashboardSummary(getFirestore(database),collection,event.id);
 });
}
