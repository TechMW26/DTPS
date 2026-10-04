// A derived, rebuildable name index; source documents are not modified.
import fs from 'node:fs';
import dotenv from 'dotenv';
import {createHash} from 'node:crypto';
import {cert,initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
if(!process.argv.includes('--execute')||process.env.VERCEL||process.env.NODE_ENV==='production')throw new Error('Explicit local staging execution required');
const env={...dotenv.parse(fs.readFileSync('.env')),...dotenv.parse(fs.readFileSync('.env.local'))};
if(env.FIREBASE_PROJECT_ID!=='dtps-2cbac')throw new Error('Unexpected staging project');
const key=createHash('sha256').update('recipes').digest('hex');
const imported=JSON.parse(fs.readFileSync(`.migration-backups/firebase/native/imports/${key}.json`));
if(!imported.complete||imported.quarantined)throw new Error('Recipes must be fully imported first');
const app=initializeApp({projectId:env.FIREBASE_PROJECT_ID,credential:cert({projectId:env.FIREBASE_PROJECT_ID,clientEmail:env.FIREBASE_CLIENT_EMAIL,privateKey:env.FIREBASE_PRIVATE_KEY.replace(/\\n/g,'\n')})},'native-recipe-index');
const db=getFirestore(app,'dtps-native-staging');
try {
 const groups=new Map();let count=0;
 for await(const doc of db.collection('recipes').select('name').stream()){
  const name=String(doc.get('name')||'').trim().toLowerCase();if(!name)continue;
  const key=createHash('sha256').update(name).digest('hex');
  const ids=groups.get(key)||[];ids.push(doc.id);groups.set(key,ids);count++;
 }
 let batch=db.batch(),size=0;
 for(const [key,recipeIds] of groups){batch.set(db.collection('_nativeRecipeNames').doc(key),{recipeIds});if(++size===400){await batch.commit();batch=db.batch();size=0;}}
 if(size)await batch.commit();
 console.log(JSON.stringify({recipesIndexed:count,nameGroups:groups.size}));
}finally{await db.terminate();await deleteApp(app);}
