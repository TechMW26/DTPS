import {Filter,type MongoDatabase,type DocumentData} from '@/lib/db/mongo-types';
import {NativeCheckoutError} from './native-checkout';
export async function nativeFinanceActor(db:MongoDatabase,id:string){
 const row=await db.collection('users').doc(id).get();if(!row.exists||['inactive','suspended'].includes(row.get('status'))||!['admin','dietitian','health_counselor','client'].includes(row.get('role')))throw new NativeCheckoutError('Forbidden',403);
 return {id,role:row.get('role') as string};
}
export async function nativeFinanceClient(db:MongoDatabase,actor:{id:string;role:string},clientId:string,write=false){
 if(!/^[a-f0-9]{24}$/i.test(clientId))throw new NativeCheckoutError('Invalid client ID',400);
 const row=await db.collection('users').doc(clientId).get();if(!row.exists||row.get('role')!=='client')throw new NativeCheckoutError('Client not found',404);
 const data=row.data()!;
 const assigned=actor.role==='dietitian'?[data.assignedDietitian,...(data.assignedDietitians||[])]:actor.role==='health_counselor'?[data.assignedHealthCounselor,...(data.assignedHealthCounselors||[])]:[];
 if(actor.role!=='admin'&&!(actor.role==='client'&&!write&&actor.id===clientId)&&!assigned.includes(actor.id))throw new NativeCheckoutError('Client access denied',403);
 return data;
}
export async function nativeFinanceClientIds(db:MongoDatabase,actor:{id:string;role:string}){
 if(actor.role==='client')return [actor.id];if(actor.role==='admin')return null;
 const hc=actor.role==='health_counselor';const rows=await db.collection('users').where('role','==','client').where(Filter.or(Filter.where(hc?'assignedHealthCounselor':'assignedDietitian','==',actor.id),Filter.where(hc?'assignedHealthCounselors':'assignedDietitians','array-contains',actor.id))).select().get();return rows.docs.map(row=>row.id);
}
export async function nativeFinancePeople(db:MongoDatabase,records:DocumentData[]):Promise<DocumentData[]>{
 const ids=[...new Set<string>(records.flatMap(row=>[row.client,row.dietitian]).filter(value=>typeof value==='string'&&/^[a-f0-9]{24}$/i.test(value)))],people=new Map<string,DocumentData>();
 for(let i=0;i<ids.length;i+=100){const rows=await db.getAll(...ids.slice(i,i+100).map(id=>db.collection('users').doc(id)),{fieldMask:['firstName','lastName','email','phone','avatar']});for(const row of rows)if(row.exists)people.set(row.id,{...row.data(),_id:row.id});}
 return records.map(row=>({...row,client:people.get(row.client)||null,dietitian:people.get(row.dietitian)||null}));
}
