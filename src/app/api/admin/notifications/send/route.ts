import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeNotificationTargets,deleteNativeRecipientNotifications,NativeNotificationError,targetRoles} from '@/lib/db/repository/native-notification-targets';
import {sendNotificationToUser} from '@/lib/firebase/firebaseNotification';
import {z} from 'zod';
import {nativeDirectoryStatuses} from '@/lib/db/repository/native-client-directory';
const target=z.object({targetType:z.enum(['particular','selected','all','single','multiple']),userIds:z.array(z.string().regex(/^[a-f0-9]{24}$/)).max(10000).optional(),clientIds:z.array(z.string().regex(/^[a-f0-9]{24}$/)).max(10000).optional(),recipientRole:z.enum(['client','dietitian','health_counselor']).optional(),recipientRoles:z.array(z.enum(['client','dietitian','health_counselor'])).optional()});
const notification=target.extend({title:z.string().trim().min(1).max(100),body:z.string().trim().min(1).max(500),clickAction:z.string().max(2000).optional(),data:z.object({type:z.string().max(80).optional(),url:z.string().max(2000).optional()}).optional()});
const deletion=target.extend({readState:z.enum(['all','read','unread']).default('all')});
const fail=(e:unknown)=>nativeResponseJson({success:false,message:e instanceof NativeNotificationError?e.message:e instanceof z.ZodError?'Invalid notification request':'Notification operation failed'},{status:e instanceof NativeNotificationError?e.status:e instanceof z.ZodError?400:503});
async function selection(userId:string,input:z.infer<typeof target>){
 const roles=[...new Set([...(input.recipientRoles||[]),...(input.recipientRole?[input.recipientRole]:[])])];
 const ids=input.targetType==='all'?undefined:[...new Set([...(input.userIds||[]),...(input.clientIds||[])])];
 if(ids&&!ids.length)throw new NativeNotificationError('Select at least one recipient',400);
 return nativeNotificationTargets(getNativeDatabase(),userId,roles.length?roles:targetRoles,ids);
}
export async function GET(request:NextRequest){
 const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 try{
  const requested=request.nextUrl.searchParams.get('roles')?.split(',').filter(Boolean)||targetRoles;
  const {rows,actorRole}=await nativeNotificationTargets(getNativeDatabase(),session.user.id,requested);
  const statusRows=await nativeDirectoryStatuses(getNativeDatabase(),rows);
  const recipients=statusRows.map(row=>{
   const tokens=new Set((row.fcmTokens||[]).map((entry:any)=>typeof entry==='string'?entry:entry?.token).filter((token:unknown)=>typeof token==='string'&&token.trim()&&!['null','undefined','nan'].includes(token.toLowerCase())));
   return {id:row._id,name:`${row.firstName||''} ${row.lastName||''}`.trim()||'Unnamed User',email:row.email||'',avatar:row.avatar,role:row.role,status:row.role==='client'?row.clientStatus||row.status||'':row.status||'',hasFcmToken:tokens.size>0,tokenCount:tokens.size};
  });
  return nativeResponseJson({success:true,recipients,clients:recipients.filter(row=>row.role==='client'),availableRoles:actorRole==='admin'?targetRoles:['client']});
 }catch(e){return fail(e);}
}
export async function POST(request:NextRequest){
 const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 try{
  const input=notification.parse(await request.json()),{rows,actorRole}=await selection(session.user.id,input);
  // Never contact real devices during migration acceptance tests.
  if(process.env.NODE_ENV!=='production')return nativeResponseJson({success:false,message:'Push delivery is disabled during local migration testing'},{status:409});
  if(!rows.length)throw new NativeNotificationError('No matching recipients',400);
  const stats={total:rows.length,success:0,failed:0,skippedNoToken:0,firebaseUnavailable:0};
  for(let offset=0;offset<rows.length;offset+=10)await Promise.all(rows.slice(offset,offset+10).map(async row=>{
   try{
    const url=input.clickAction||input.data?.url||(row.role==='client'?'/user/notifications':row.role==='dietitian'?'/dietician':'/health-counselor');
    if(!url.startsWith('/')||url.startsWith('//'))throw new Error('Invalid notification destination');
    const result=await sendNotificationToUser(row._id,{title:input.title,body:input.body,clickAction:url,data:{type:input.data?.type||'custom',actionType:'custom',recipientRole:row.role,url,sentBy:session.user.id,sentByRole:actorRole}});
    if(result.successCount>0)stats.success++;else if(result.skippedNoToken||result.errorCode==='NO_TOKEN')stats.skippedNoToken++;else {stats.failed++;if(result.errorCode==='FIREBASE_UNAVAILABLE')stats.firebaseUnavailable++;}
   }catch{stats.failed++;}
  }));
  return nativeResponseJson({success:stats.success>0,message:stats.success?'Notification dispatch completed':'No push notifications delivered',stats},{status:stats.success?200:503});
 }catch(e){return fail(e);}
}
export async function DELETE(request:NextRequest){
 const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 try{
  const input=deletion.parse(await request.json()),{rows,actorRole}=await selection(session.user.id,input);
  if(actorRole!=='admin')throw new NativeNotificationError('Only admins can delete notifications',403);
  const deletedNotifications=await deleteNativeRecipientNotifications(getNativeDatabase(),session.user.id,rows.map(row=>row._id),input.readState);
  return nativeResponseJson({success:true,message:'Notifications deleted successfully',stats:{deletedNotifications,targetUsers:rows.length}});
 }catch(e){return fail(e);}
}
