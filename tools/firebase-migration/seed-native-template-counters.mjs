import fs from 'node:fs';
import dotenv from 'dotenv';
import {cert,initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
if(!process.argv.includes('--execute')||process.env.VERCEL||process.env.NODE_ENV==='production')throw new Error('Explicit local staging operation required');
const env={...dotenv.parse(fs.readFileSync('.env')),...dotenv.parse(fs.readFileSync('.env.local'))};if(env.FIREBASE_PROJECT_ID!=='dtps-2cbac')throw new Error('Wrong staging project');
const app=initializeApp({projectId:env.FIREBASE_PROJECT_ID,credential:cert({projectId:env.FIREBASE_PROJECT_ID,clientEmail:env.FIREBASE_CLIENT_EMAIL,privateKey:env.FIREBASE_PRIVATE_KEY.replace(/\\n/g,'\n')})}),db=getFirestore(app,'dtps-native-staging');
try{for(const [collection,counter] of [['diettemplates','dietTemplateIds'],['mealplantemplates','mealPlanTemplateIds']]){let max=0;for await(const row of db.collection(collection).select('uuid').stream()){const n=Number(row.get('uuid'));if(Number.isSafeInteger(n)&&n>=0)max=Math.max(max,n);}const ref=db.collection('_nativeCounters').doc(counter),seq=await db.runTransaction(async tx=>{const current=await tx.get(ref),seq=Math.max(max,current.get('seq')||0);tx.set(ref,{seq,initializedAt:new Date()},{merge:true});return seq;});console.log(JSON.stringify({counter,seq,requiresFinalSourceReconciliation:true}));}}finally{await db.terminate();await deleteApp(app);}
