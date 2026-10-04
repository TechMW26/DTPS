import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {createNativeAudit} from '@/lib/db/repository/native-audit';
import {nativeDates} from '@/lib/db/repository/native-plan-editor';
import {z} from 'zod';
const schema=z.object({type:z.enum(['info','warning','error','success','critical']).default('info'),message:z.string().trim().min(1).max(1000),priority:z.enum(['low','medium','high','critical']).default('low'),category:z.enum(['database_error','api_error','auth_failure','payment_failure','email_failure','validation_error','performance','security','maintenance','other']).default('other')});
async function admin(){const session=await getServerSession(authOptions);return session?.user?.role==='admin'?session.user:null;}
function timeAgo(value:Date){const minutes=Math.max(0,Math.floor((Date.now()-value.getTime())/60000));if(minutes<1)return 'Just now';const count=minutes<60?minutes:minutes<1440?Math.floor(minutes/60):Math.floor(minutes/1440),unit=minutes<60?'minute':minutes<1440?'hour':'day';return `${count} ${unit}${count===1?'':'s'} ago`;}
function view(id:string,data:Record<string,any>){return {id,type:data.type,message:data.message,priority:data.priority||'low',category:data.category||'other',createdAt:data.createdAt,time:timeAgo(data.createdAt)};}
export async function GET(){try{
 if(!await admin())return nativeResponseJson({error:'Admin access required'},{status:403});const db=getNativeDatabase(),now=new Date();
 const [saved,recent,pending,inactive]=await Promise.all([db.collection('systemalerts').orderBy('createdAt','desc').limit(50).get(),db.collection('users').where('createdAt','>=',new Date(now.getTime()-86400000)).count().get(),db.collection('appointments').where('status','==','pending').where('date','>=',now).count().get(),db.collection('users').where('role','in',['dietitian','health_counselor']).where('lastLoginAt','<',new Date(now.getTime()-7*86400000)).count().get()]);
 const alerts=saved.docs.map(row=>view(row.id,nativeDates(row.data())));
 if(recent.data().count>10)alerts.push(view('high_user_growth',{type:'info',message:`High user registration activity: ${recent.data().count} new users in the last 24 hours`,priority:'medium',category:'growth',createdAt:now}));
 if(pending.data().count>5)alerts.push(view('pending_appointments',{type:'warning',message:`${pending.data().count} appointments pending confirmation`,priority:'high',category:'appointments',createdAt:now}));
 if(inactive.data().count>0)alerts.push(view('inactive_dietitians',{type:'warning',message:`${inactive.data().count} staff members haven't logged in for over a week`,priority:'medium',category:'staff',createdAt:now}));
 // Report persisted or measured conditions only; never invent backups or simulated incidents.
 const priorities:Record<string,number>={critical:4,high:3,medium:2,low:1};alerts.sort((a,b)=>(priorities[b.priority]||1)-(priorities[a.priority]||1)||b.createdAt.getTime()-a.createdAt.getTime());const selected=alerts.slice(0,15);
 return nativeResponseJson({alerts:selected,summary:{total:selected.length,critical:selected.filter(a=>a.priority==='critical').length,high:selected.filter(a=>a.priority==='high').length,medium:selected.filter(a=>a.priority==='medium').length,low:selected.filter(a=>a.priority==='low').length}});
 }catch{return nativeResponseJson({error:'Unable to load system alerts'},{status:503});}}
export async function POST(req:NextRequest){try{const user=await admin();if(!user)return nativeResponseJson({error:'Admin access required'},{status:403});const data=schema.safeParse(await req.json());if(!data.success)return nativeResponseJson({error:'Invalid alert fields'},{status:400});const alert=await createNativeAudit<Record<string,any>>(getNativeDatabase(),'systemalerts',{...data.data,source:'user_action',status:'new',createdBy:user.id,notificationSent:false,isRead:false});return nativeResponseJson(view(alert._id,alert),{status:201});}catch{return nativeResponseJson({error:'Unable to create alert'},{status:500});}}
export async function DELETE(req:NextRequest){try{if(!await admin())return nativeResponseJson({error:'Admin access required'},{status:403});const id=req.nextUrl.searchParams.get('id');if(!id||!/^[a-f0-9]{24}$/.test(id))return nativeResponseJson({error:'Only saved alerts can be deleted'},{status:400});const db=getNativeDatabase(),deleted=await db.runTransaction(async tx=>{const ref=db.collection('systemalerts').doc(id),row=await tx.get(ref);if(!row.exists)return false;tx.delete(ref);return true;});return deleted?nativeResponseJson({success:true}):nativeResponseJson({error:'Alert not found'},{status:404});}catch{return nativeResponseJson({error:'Unable to delete alert'},{status:500});}}
