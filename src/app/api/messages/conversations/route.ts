import {nativeResponseJson} from '@/lib/api/native-response';
import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {listNativeConversations} from '@/lib/db/repository/native-conversations';
export async function GET(){
 const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 try{return nativeResponseJson({conversations:await listNativeConversations(getNativeDatabase(),session.user.id)});}
 catch{return nativeResponseJson({error:'Conversation directory is temporarily unavailable'},{status:503});}
}
