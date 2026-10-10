import {nativeResponseJson} from '@/lib/api/native-response';
import {NextRequest,NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {readNativeOtherPayment,reviewNativeOtherPayment,deleteNativeOtherPayment} from '@/lib/db/repository/native-other-payments';
import {NativeCheckoutError} from '@/lib/db/repository/native-checkout';
type Context={params:Promise<{id:string}>};
async function actor(){const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeCheckoutError('Unauthorized',401);return session.user.id;}
function failure(error:unknown){return nativeResponseJson({error:error instanceof NativeCheckoutError?error.message:'Unable to process payment'},{status:error instanceof NativeCheckoutError?error.status:error instanceof SyntaxError?400:503});}
export async function GET(_request:NextRequest,context:Context){try{return nativeResponseJson({success:true,payment:await readNativeOtherPayment(getNativeDatabase(),await actor(),(await context.params).id)},{headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}
export async function PUT(request:NextRequest,context:Context){try{return nativeResponseJson({success:true,payment:await reviewNativeOtherPayment(getNativeDatabase(),await actor(),(await context.params).id,await request.json())});}catch(error){return failure(error);}}
export async function DELETE(_request:NextRequest,context:Context){try{await deleteNativeOtherPayment(getNativeDatabase(),await actor(),(await context.params).id);return nativeResponseJson({success:true});}catch(error){return failure(error);}}
