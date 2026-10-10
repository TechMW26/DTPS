import { type MongoDatabase, type DocumentData } from '@/lib/db/mongo-types';
import { nativeJson } from './native-history';
import {nativeHabitDay} from './native-habits';
import {hydrateNativeDocument,prepareNativePatch} from '@/lib/storage/native-document';
import {nativeDates} from './native-plan-editor';
import { taskDateError } from '@/lib/task-schedule';

function journalQuery(db: MongoDatabase, clientId: string, start: Date, end: Date) {
  return db.collection('journaltrackings').where('client','==',clientId).where('date','>=',start).where('date','<',end).limit(2);
}
export async function nativeTaskJournal(db: MongoDatabase, clientId: string, start: Date, end: Date) {
  const rows=await journalQuery(db,clientId,start,end).get();
  if(rows.size>1)throw new Error('Duplicate journal dates require reconciliation');
  return rows.empty?null:nativeJson({...await hydrateNativeDocument(rows.docs[0].data()),_id:rows.docs[0].id}) as DocumentData;
}
export async function completeNativeTask(db: MongoDatabase, clientId: string, dateKey: string|undefined, taskType: string, index?: number) {
  const error=taskDateError(dateKey);if(error)throw new Error(error);
  if(!['water','steps','sleep','activity'].includes(taskType))throw new Error('Invalid task type');
  if(taskType==='activity'&&(!Number.isSafeInteger(index)||index!<0))throw new Error('Invalid activity index');
  const {start,end}=nativeHabitDay(dateKey);
  return db.runTransaction(async tx=>{
    const rows=await tx.get(journalQuery(db,clientId,start,end));
    if(rows.size>1)throw new Error('Duplicate journal dates require reconciliation');
    if(rows.empty)return false;
    const doc=rows.docs[0],journal=nativeDates(await hydrateNativeDocument(doc.data())),now=new Date();
    const update:DocumentData={updatedAt:now};
    if(taskType==='activity') {
      const activities=journal.assignedActivities?.activities;
      if(!Array.isArray(activities)||!activities[index!])return false;
      if(activities[index!].completed)return true;
      const next=activities.map((activity:any,i:number)=>i===index?{...activity,completed:true,completedAt:now}:activity);
      update.assignedActivities={...journal.assignedActivities,activities:next};
      if(next.every((activity:any)=>activity.completed)){
        update.assignedActivities.isCompleted=true;update.assignedActivities.completedAt=now;
      }
    } else {
      const [field,target]={water:['assignedWater','amount'],steps:['assignedSteps','target'],sleep:['assignedSleep','targetHours']}[taskType as 'water'|'steps'|'sleep'];
      if(!(taskType==='sleep'?Number(journal[field]?.targetHours||0)*60+Number(journal[field]?.targetMinutes||0)>0:journal[field]?.[target]>0))return false;
      if(journal[field].isCompleted)return true;
      update[field]={...journal[field],isCompleted:true,completedAt:now};
    }
    tx.update(doc.ref,await prepareNativePatch(doc.data(),update));return true;
  });
}
