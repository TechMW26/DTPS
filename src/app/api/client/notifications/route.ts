import {nativeResponseJson} from '@/lib/api/native-response';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { getNativeDatabase } from '@/lib/db/firestore-native';
import { nativeUnreadCounts,mutateNativeNotifications } from '@/lib/db/repository/native-notifications';
import { nativeJson } from '@/lib/db/repository/native-history';
import { hydrateNativeDocument } from '@/lib/storage/native-document';
import { broadcastUnreadCounts } from '@/lib/realtime/broadcast-counts';

export async function GET(request:NextRequest){
 try{
  const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
  const search=request.nextUrl.searchParams,page=Number(search.get('page')||1),limit=Number(search.get('limit')||20);
  if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(limit)||limit<1||limit>100||(page-1)*limit>100000)return nativeResponseJson({error:'Invalid pagination'},{status:400});
  const db=getNativeDatabase();let query=db.collection('notifications').where('userId','==',session.user.id);
  if(search.get('type'))query=query.where('type','==',search.get('type'));
  if(search.get('unread')==='true')query=query.where('read','==',false);
  const [rows,total,unread]=await Promise.all([query.orderBy('createdAt','desc').offset((page-1)*limit).limit(limit).get(),query.count().get(),db.collection('notifications').where('userId','==',session.user.id).where('read','==',false).count().get()]);
  const notifications=await Promise.all(rows.docs.map(doc=>hydrateNativeDocument({...doc.data(),_id:doc.id})));
  return nativeResponseJson({success:true,notifications:nativeJson(notifications),pagination:{page,limit,total:total.data().count,pages:Math.ceil(total.data().count/limit)},unreadCount:unread.data().count});
 }catch{return nativeResponseJson({error:'Failed to fetch notifications'},{status:500});}
}
export async function POST(request:NextRequest){
 try{
  const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
  let body;try{body=await request.json();}catch{return nativeResponseJson({error:'Invalid request'},{status:400});}
  const ids=body?.notificationIds;
  if(body?.markAll!==true&&(!Array.isArray(ids)||ids.length>100||ids.some((id:unknown)=>typeof id!=='string'||!id||id.includes('/'))))return nativeResponseJson({error:'Invalid notification IDs'},{status:400});
  const db=getNativeDatabase();await mutateNativeNotifications(db,session.user.id,'read',body.markAll===true?undefined:ids);
  const counts=await nativeUnreadCounts(db,session.user.id);broadcastUnreadCounts(session.user.id,counts);
  return nativeResponseJson({success:true,unreadCount:counts.notifications});
 }catch{return nativeResponseJson({error:'Failed to mark notifications as read'},{status:500});}
}
export async function DELETE(request:NextRequest){
 try{
  const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
  const all=request.nextUrl.searchParams.get('all')==='true',id=request.nextUrl.searchParams.get('id');
  if(!all&&(!id||id.includes('/')))return nativeResponseJson({error:'Invalid notification ID'},{status:400});
  await mutateNativeNotifications(getNativeDatabase(),session.user.id,'delete',all?undefined:[id!]);
  return nativeResponseJson({success:true});
 }catch{return nativeResponseJson({error:'Failed to delete notifications'},{status:500});}
}
