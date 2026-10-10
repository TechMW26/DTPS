import {toISTDateKey} from '@/lib/utils/ist';
import type {MongoDatabase} from '@/lib/db/mongo-types';
import {NativePlanEditor} from './native-plan-editor';
import {NativeStaffClientError} from './native-staff-client';
import {planNeedsDateCorrection,validPlanDate} from '@/lib/meal-plan-date-validity';
const fail=(message:string,status=400):never=>{throw new NativeStaffClientError(message,status);};
export async function correctNativePlanDates(db:MongoDatabase,actorId:string,id:string,input:any){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Enter both valid dates');
 const editor=new NativePlanEditor(db),actor=await editor.document('users',actorId);
 if(actor?.role!=='admin'||actor.isActive===false||['inactive','suspended'].includes(actor.status))fail('Administrator access required',403);
 let plan=await editor.plan(id);if(!plan)fail('Plan not found',404);plan=await editor.hydrate(plan!);
 if(!planNeedsDateCorrection(plan))fail('This plan does not need a migration date correction',409);
 if(!validPlanDate(input.startDate)||!validPlanDate(input.endDate))fail('Enter both valid dates');
 const start=new Date(input.startDate),end=new Date(input.endDate);
 if(start>end)fail('Start date must be on or before end date');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)||start.toISOString().slice(0,10)!==input.startDate||end.toISOString().slice(0,10)!==input.endDate)fail('Use valid calendar dates');
 const siblings=await editor.siblings(plan!);
 if(siblings.some(p=>['active','paused','completed'].includes(p.status)&&validPlanDate(p.startDate)&&validPlanDate(p.endDate)&&toISTDateKey(p.startDate)!<=input.endDate&&toISTDateKey(p.endDate)!>=input.startDate))fail('These dates overlap another published phase',409);
 if(plan!.purchaseId){const purchase=await editor.document('unifiedpayments',String(plan!.purchaseId));if(!purchase||purchase.client!==plan!.clientId)fail('Linked purchase not found',409);
 const from=purchase!.expectedStartDate||purchase!.startDate,to=purchase!.expectedEndDate||purchase!.endDate;
 if(!validPlanDate(from)||!validPlanDate(to))fail('Correct the purchase dates first',409);
 const startKey=toISTDateKey(from)!,endKey=toISTDateKey(to)!;
 if(input.startDate<startKey||input.endDate>endKey)fail('Dates must remain inside the purchased program');}
 const now=new Date();
 const issues=(plan!._nativeMigrationIssues||[]).map((issue:any)=>['startDate','endDate'].includes(issue.path)&&issue.status==='needs-staff-correction'?{...issue,status:'corrected',correctedAt:now,correctedBy:actorId,correctedValue:issue.path==='startDate'?input.startDate:input.endDate}:issue);
 const saved=await editor.save(plan!,{startDate:start,endDate:end,_nativeMigrationIssues:issues},[{action:'migration_date_correction',at:now,by:actorId,previousStartDate:plan!.startDate??null,previousEndDate:plan!.endDate??null,startDate:start,endDate:end}],false,[]);
 if(!saved)fail('Plan or permissions changed. Reload and try again.',409);
 return {success:true};
}
