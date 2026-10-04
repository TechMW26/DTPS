import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {lookupNativeFile} from '@/lib/db/repository/native-media';
import {nativeMediaResponse} from '@/lib/api/native-media-response';
export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
 try{const {id}=await params;if(!/^[a-f0-9]{24}$/.test(id))return new NextResponse('Invalid file id',{status:400});
 const session=await getServerSession(authOptions);return await nativeMediaResponse(await lookupNativeFile(getNativeDatabase(),id,session?.user?.id?{id:session.user.id,role:session.user.role}:null),_request);}
 catch{return new NextResponse('Media service temporarily unavailable',{status:503});}
}
