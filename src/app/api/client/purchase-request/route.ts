import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {createNativePurchaseRequest,listNativePurchaseRequests,NativePurchaseRequestError} from '@/lib/db/repository/native-purchase-requests';
export async function POST(request:NextRequest){
 try{const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 const row=await createNativePurchaseRequest(getNativeDatabase(),session.user.id,await request.json());
 return nativeResponseJson({success:true,message:'Purchase request submitted successfully.',purchaseRequest:{_id:row._id,planName:row.planName,durationLabel:row.durationLabel,amount:row.amount,status:row.status}});
 }catch(error){return nativeResponseJson({error:error instanceof NativePurchaseRequestError?error.message:'Failed to create purchase request'},{status:error instanceof NativePurchaseRequestError?error.status:503});}
}
export async function GET(){
 try{const session=await getServerSession(authOptions);if(!session?.user?.id)return nativeResponseJson({error:'Unauthorized'},{status:401});
 return nativeResponseJson({success:true,purchaseRequests:await listNativePurchaseRequests(getNativeDatabase(),session.user.id)});
 }catch{return nativeResponseJson({error:'Failed to fetch purchase requests'},{status:503});}
}
