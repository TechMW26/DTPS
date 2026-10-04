import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {createNativeOtherPayment,listNativeOtherPayments} from '@/lib/db/repository/native-other-payments';
import {NativeCheckoutError} from '@/lib/db/repository/native-checkout';
async function actor(){const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeCheckoutError('Unauthorized',401);return session.user.id;}
function failure(error:unknown){return nativeResponseJson({error:error instanceof NativeCheckoutError?error.message:'Unable to process payment'},{status:error instanceof NativeCheckoutError?error.status:503});}
export async function GET(request:NextRequest){try{return nativeResponseJson({success:true,payments:await listNativeOtherPayments(getNativeDatabase(),await actor(),request.nextUrl.searchParams)},{headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}
export async function POST(request:NextRequest){try{const id=await actor(),form=await request.formData(),input=Object.fromEntries([...form.entries()].filter(([key,value])=>key!=='receiptImage'&&typeof value==='string'&&value!=='')),file=form.get('receiptImage');const payment=await createNativeOtherPayment(getNativeDatabase(),id,input,file instanceof File?file:null);return nativeResponseJson({success:true,payment,message:'Payment submitted for approval'},{status:201});}catch(error){return failure(error);}}
