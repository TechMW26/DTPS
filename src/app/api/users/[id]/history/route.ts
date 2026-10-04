import {nativeResponseJson} from '@/lib/api/native-response';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { getNativeDatabase } from '@/lib/db/firestore-native';
import { nativeHistoryAccess, nativeHistoryPage, nativeJson } from '@/lib/db/repository/native-history';
import { createNativeAudit } from '@/lib/db/repository/native-audit';
import { hydrateNativeDocument } from '@/lib/storage/native-document';

const actions = new Set(['create','update','delete','upload','assign','download','view']);
const categories = new Set(['profile','medical','lifestyle','diet','payment','appointment','document','assignment','other','journal','plan']);
async function access(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return {error:nativeResponseJson({error:'Unauthorized'},{status:401})};
  if (!/^[a-f\d]{24}$/i.test(id)) return {error:nativeResponseJson({error:'Invalid user ID'},{status:400})};
  const db = getNativeDatabase();
  const result = await nativeHistoryAccess(db,id,session.user);
  if (result.status !== 200) return {error:nativeResponseJson({error:result.status===404?'User not found':'Forbidden'},{status:result.status})};
  return {db,session};
}

export async function GET(request: NextRequest,{params}:{params:Promise<{id:string}>}) {
  try {
    const {id} = await params, context = await access(id);
    if (context.error) return context.error;
    const page=Number(request.nextUrl.searchParams.get('page')||1),limit=Number(request.nextUrl.searchParams.get('limit')||50);
    if (!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(limit)||limit<1||limit>100||(page-1)*limit>100000) return nativeResponseJson({error:'Invalid pagination'},{status:400});
    const {history,total} = await nativeHistoryPage(context.db!,id,page,limit,request.nextUrl.searchParams.get('category'));
    // Hydration happens only after checking access to the client's history.
    const rows = await Promise.all(history.map(row=>hydrateNativeDocument(row)));
    return nativeResponseJson({success:true,history:nativeJson(rows),pagination:{total,page,limit,pages:Math.ceil(total/limit)}});
  } catch {
    return nativeResponseJson({success:false,error:'Failed to fetch history'},{status:500});
  }
}

export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  try {
    const {id}=await params,context=await access(id);
    if(context.error)return context.error;
    let body;try{body=await request.json();}catch{return nativeResponseJson({error:'Invalid request'},{status:400});}
    if(!body||typeof body!=='object'||Array.isArray(body))return nativeResponseJson({error:'Invalid request'},{status:400});
    const {action='update',category='other',description,changeDetails=[],metadata}=body;
    if(!actions.has(action)||!categories.has(category)||typeof description!=='string'||!description.trim()||description.length>10000||!Array.isArray(changeDetails))return nativeResponseJson({error:'Invalid history entry'},{status:400});
    const actor=context.session!.user, current=(await context.db!.collection('users').doc(actor.id).get()).data();
    const entry=await createNativeAudit(context.db!,'histories',{
      userId:id,action,category,description,changeDetails,metadata,
      performedBy:{userId:actor.id,name:`${current?.firstName||''} ${current?.lastName||''}`.trim(),email:current?.email,role:actor.role},
      ipAddress:request.headers.get('x-forwarded-for')||request.headers.get('x-real-ip')||'unknown',userAgent:request.headers.get('user-agent')||'unknown',
    });
    return nativeResponseJson({success:true,history:nativeJson(entry)},{status:201});
  }catch{return nativeResponseJson({success:false,error:'Failed to create history entry'},{status:500});}
}
