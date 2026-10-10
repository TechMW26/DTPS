import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {journalDay,journalTargets,mutateJournal,resolveJournalPlanMeal,deleteJournalTrackerEntry,type JournalSection} from '@/lib/db/repository/native-journal';
import {taskClientAccess} from '@/lib/db/repository/native-staff-tasks';
import {nativeJson} from '@/lib/db/repository/native-history';
import {nativeMediaJson} from './native-media-json';
import {summarizeActivities,summarizeSteps,summarizeSleep,summarizeWater} from '@/app/api/journal/_utils';
import {z} from 'zod';
function mealSummary(journal:any){const meals=(journal.meals||[]).filter((entry:any)=>entry.consumed);return {consumedMeals:meals.length,...Object.fromEntries(['Calories','Protein','Carbs','Fat'].map(name=>['consumed'+name,meals.reduce((sum:number,entry:any)=>sum+Number(entry[name.toLowerCase()]||0),0)]))};}
const summary=(section:JournalSection,journal:any)=>section==='activities'?summarizeActivities(journal.activities||[],journal.targets?.activityMinutes):section==='steps'?summarizeSteps(journal.steps||[],journal.targets?.steps):section==='sleep'?summarizeSleep(journal.sleep||[],journal.targets?.sleep):section==='water'?summarizeWater(journal.water||[],journal.targets?.water):section==='meals'?mealSummary(journal):undefined;
export function nativeJournalRoute(section:JournalSection){return async(request:NextRequest)=>{try{
 const session=await getServerSession(authOptions);if(!session?.user?.id)return NextResponse.json({error:'Unauthorized'},{status:401});
 const read=request.method==='GET'||request.method==='DELETE',input=read?Object.fromEntries(request.nextUrl.searchParams):await request.json(),clientId=input.clientId||session.user.id,db=getNativeDatabase();await taskClientAccess(db,session.user.id,clientId);
 const sourceMeal=section==='meals'&&request.method==='PUT'&&typeof input.entryId==='string'&&input.entryId.includes('-')?await resolveJournalPlanMeal(db,clientId,input.date,input.entryId):undefined;
 if(request.method==='DELETE'&&(section==='progress'||section==='measurements')&&String(input.entryId||'').startsWith('pe_')){await deleteJournalTrackerEntry(db,session.user.id,clientId,section,input.entryId);return NextResponse.json({success:true});}
 let result:any;if(request.method==='GET'){const journal=await journalDay(db,clientId,input.date)||{client:clientId,targets:journalTargets,activities:[],steps:[],water:[],sleep:[],meals:[],progress:[],measurements:[],bca:[]};result=section==='targets'?{journal}:{[section]:journal[section]||[],entries:journal[section]||[],summary:summary(section,journal)};}
 else{const action=request.method==='DELETE'?'delete':request.method==='POST'?'add':'update';const {journal,entry}=await mutateJournal(db,session.user.id,clientId,section,input.date||input.measurementDate,action,input,request.headers.get('idempotency-key'),sourceMeal);result=section==='targets'?{journal}:{entry,[section]:journal[section]||[],entries:journal[section]||[],summary:summary(section,journal)};}
 return NextResponse.json(await nativeMediaJson(db,nativeJson({success:true,...result})));
 }catch(e){const status=e&&typeof e==='object'&&'status'in e?Number(e.status):e instanceof z.ZodError?400:503;return NextResponse.json({error:status<500&&e instanceof Error?e.message:'Journal operation failed'},{status});}};}
