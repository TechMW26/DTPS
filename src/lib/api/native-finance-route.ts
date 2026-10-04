import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {NativeCheckoutError} from '@/lib/db/repository/native-checkout';
export async function nativeFinanceSession(){const session=await getServerSession(authOptions);if(!session?.user?.id)throw new NativeCheckoutError('Unauthorized',401);return session.user.id;}
export function nativeFinanceFailure(error:unknown){return NextResponse.json({error:error instanceof NativeCheckoutError?error.message:'Financial service unavailable'},{status:error instanceof NativeCheckoutError?error.status:error instanceof SyntaxError?400:503,headers:{'Cache-Control':'no-store'}});}
