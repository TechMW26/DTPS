import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {removeNativeUserDocument} from '@/lib/db/repository/native-user-documents';
import {NativeDirectoryError} from '@/lib/db/repository/native-client-directory';
export async function DELETE(r:NextRequest,c:{params:Promise<{clientId:string}>}){try{const session=await getServerSession(authOptions);if(!session?.user)return nativeResponseJson({error:'Unauthorized'},{status:401});if(session.user.role!=='admin')throw new NativeDirectoryError('Admin access required',403);const {clientId}=await c.params;if(!/^[a-f0-9]{24}$/i.test(clientId))throw new NativeDirectoryError('Invalid client ID');const documentId=r.nextUrl.searchParams.get('documentId');if(!documentId)throw new NativeDirectoryError('Document ID required');const documents=await removeNativeUserDocument(getNativeDatabase(),session.user.id,clientId,{documentId},true);return nativeResponseJson({message:'Document deleted successfully',documentsCount:documents.length});}catch(e){return nativeResponseJson({error:e instanceof NativeDirectoryError?e.message:'Unable to delete document'},{status:e instanceof NativeDirectoryError?e.status:500});}}
