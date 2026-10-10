import {NextResponse,after} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {getNativeDatabase} from '@/lib/db/database';
import {readNativeHabit,mutateNativeHabit,nativeHabitDay,NativeHabitError,type Habit} from '@/lib/db/repository/native-habits';
import {logActivity} from '@/lib/utils/activityLogger';
export function nativeHabitRoute(habit:Habit,build:(journal:any,date:Date,goal?:number)=>unknown){
 return async (request:Request)=>{
  try{
   const session=await getServerSession(authOptions);if(!session?.user?.id)return NextResponse.json({error:'Unauthorized'},{status:401});
   const db=getNativeDatabase(),params=new URL(request.url).searchParams;
   const body=request.method==='POST'||request.method==='PATCH'?await request.json():{};
   const date=body.date??params.get('date'),day=nativeHabitDay(date);
   let journal:any,entryId:string|undefined;
   if(request.method==='GET')journal=await readNativeHabit(db,session.user.id,date);
   else{
    const action=request.method==='POST'?'add':request.method==='DELETE'?'delete':body.action;
    if(!['add','delete','complete','complete-entry'].includes(action))throw new NativeHabitError('Invalid action');
    const result=await mutateNativeHabit(db,session.user.id,habit,date,action,{...body,entryId:body.entryId??params.get('id')},request.headers.get('x-idempotency-key'));
    journal=result.journal;entryId=result.entryId;
    if(request.method==='POST')after(async()=>{await logActivity({userId:session.user.id,userRole:'client',userName:session.user.name||'',userEmail:session.user.email||'',action:`Logged ${habit}`,actionType:'create',category:'fitness',description:`Client logged ${habit}.`,details:{date:day.key}});});
   }
   let goal:number|undefined;
   if(habit==='water'){const user=await db.collection('users').doc(session.user.id).get();const daily=user.get('dailyGoals.water'),legacy=user.get('goals.water');goal=daily>=100?daily:legacy>0?legacy*250:2500;}
   const result=build(journal,day.start,goal) as any;
   return NextResponse.json({...result,...(request.method!=='GET'?{success:true}:{}),...(request.method==='POST'&&habit!=='water'?{entry:result.entries.find((item:any)=>item._id===entryId)}:{})});
  }catch(error){return NextResponse.json({error:error instanceof NativeHabitError?error.message:'Unable to load or save habit data'},{status:error instanceof NativeHabitError?error.status:503});}
 };
}
