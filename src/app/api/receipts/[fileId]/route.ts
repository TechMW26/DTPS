import {nativeResponseJson} from '@/lib/api/native-response';
import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {lookupNativeReceipt} from '@/lib/db/repository/native-receipt-file';
import {nativeMediaResponse} from '@/lib/api/native-media-response';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{fileId:string}>}){
 try{const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});return await nativeMediaResponse(await lookupNativeReceipt(getNativeDatabase(),(await params).fileId,{id:session.user.id,role:session.user.role}),_request);}
 catch{return nativeResponseJson({error:'Receipt temporarily unavailable'},{status:503});}
}
