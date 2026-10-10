import fs from 'node:fs';
import path from 'node:path';
import {FieldValue,type MongoDatabase,type DocumentData} from '@/lib/db/mongo-types';
export const RECIPE_ADMIN_INDEX_FIELD='_nativeAdminUuid';
export const RECIPE_ADMIN_INDEX_VERSION=1;
export function recipeSourceWatermark():number|null{
 if((process.env.NODE_ENV==='test'&&process.env.DTPS_MONGODB_LOCAL_TEST==='true'))return null;
 try{const value=JSON.parse(fs.readFileSync(path.resolve('.migration-backups/firebase/native/reconciliation/state.json'),'utf8')).line;return Number.isSafeInteger(value)?value:null;}catch{return null;}
}

export function recipeAdminOrder(data:DocumentData){return data.deletedAt||data.mergedInto?FieldValue.delete():(parseInt(String(data.uuid||'0'),10)||0);}
/** Staging maintenance only. The native database factory rejects production. */
export async function seedRecipeAdminIndex(db:MongoDatabase){
 const sourceWatermark=recipeSourceWatermark();if(!(process.env.NODE_ENV==='test'&&process.env.DTPS_MONGODB_LOCAL_TEST==='true')&&sourceWatermark===null)throw new Error('Verified source watermark required');
 const marker=db.collection('_nativeIndexes').doc('recipeAdmin');await marker.set({ready:false,version:RECIPE_ADMIN_INDEX_VERSION});
 const rows=await db.collection('recipes').select('uuid','deletedAt','mergedInto').get();
 for(let i=0;i<rows.size;i+=100){const group=rows.docs.slice(i,i+100);await db.runTransaction(async tx=>{const fresh=await tx.getAll(...group.map(row=>row.ref));for(const row of fresh)if(row.exists)tx.update(row.ref,{[RECIPE_ADMIN_INDEX_FIELD]:recipeAdminOrder(row.data()!)});});}
 const indexed=await db.collection('recipes').orderBy(RECIPE_ADMIN_INDEX_FIELD).count().get();
 const visible=rows.docs.filter(row=>!row.get('deletedAt')&&!row.get('mergedInto')).length;
 if(recipeSourceWatermark()!==sourceWatermark||indexed.data().count!==visible)throw new Error('Recipe index reconciliation changed during seed; retry');
 const maximum=rows.docs.reduce((max,row)=>{const value=Number(row.get('uuid'));return Number.isSafeInteger(value)&&value>=0?Math.max(max,value):max;},0);
 const counter=db.collection('_nativeCounters').doc('recipeIds');await db.runTransaction(async tx=>{const current=await tx.get(counter);tx.set(counter,{seq:Math.max(maximum,Number(current.get('seq'))||0),initializedAt:new Date()},{merge:true});});
 await marker.set({ready:true,version:RECIPE_ADMIN_INDEX_VERSION,count:visible,sourceWatermark,updatedAt:new Date()});return {indexed:visible};
}
