import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse,after} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {NativeHabitError,type Habit} from './native-habits';
import {nativeHabitAssignment,assignmentResponse} from './native-habit-assignment';
import {sendTaskAssignedNotification} from '@/lib/notifications/notificationService';
type Context={params:Promise<{clientId:string}>};
export function nativeAssignmentHandlers(habit:Habit){
 async function run(req:NextRequest,context:Context,action:'read'|'assign'|'remove'){
  try{
   const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeHabitError('Unauthorized',401);
   const {clientId}=await context.params,input=action==='assign'?await req.json():{},date=action==='assign'?input.date:req.nextUrl.searchParams.get('date');
   const result=await nativeHabitAssignment(getNativeDatabase(),session.user.id,clientId,habit,date,action,input);
   if(action==='assign'&&process.env.NODE_ENV==='production')after(async()=>{await sendTaskAssignedNotification(clientId,{taskType:habit==='activities'?'activity':habit,target:habit==='water'?`${input.amount}ml`:habit==='steps'?`${input.target} steps`:habit==='sleep'?`${input.targetHours}h ${input.targetMinutes||0}m`:`${input.activities.length} activities`,date:result.day.key});});
   return nativeResponseJson({...assignmentResponse(habit,result),...(action==='read'?{}:{success:true,message:action==='assign'?'Task assigned successfully':'Assigned task removed successfully'})});
  }catch(error){return nativeResponseJson({error:error instanceof NativeHabitError?error.message:'Unable to process task assignment'},{status:error instanceof NativeHabitError?error.status:error instanceof SyntaxError?400:500});}
 }
 return {GET:(req:NextRequest,context:Context)=>run(req,context,'read'),POST:(req:NextRequest,context:Context)=>run(req,context,'assign'),DELETE:(req:NextRequest,context:Context)=>run(req,context,'remove')};
}
