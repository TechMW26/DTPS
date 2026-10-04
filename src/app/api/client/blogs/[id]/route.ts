import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {nativeBlogDetail,nativeBlogLike} from '@/lib/db/repository/native-content';
export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
 try{const {id}=await params;const result=await nativeBlogDetail(getNativeDatabase(),id);return result?nativeResponseJson(result):nativeResponseJson({error:'Blog not found'},{status:404});}
 catch{return nativeResponseJson({error:'Failed to fetch blog'},{status:500});}
}
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 try{const {id}=await params,{action}=await request.json();if(!/^[a-f0-9]{24}$/.test(id)||!['like','unlike'].includes(action))return nativeResponseJson({error:'Invalid blog or action'},{status:400});
  const likes=await nativeBlogLike(getNativeDatabase(),id,action);return likes===null?nativeResponseJson({error:'Blog not found'},{status:404}):nativeResponseJson({success:true,likes});
 }catch{return nativeResponseJson({error:'Failed to update likes'},{status:500});}
}
