import {nativeResponseJson} from '@/lib/api/native-response';
import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {NativeTagError} from './native-tags';
export async function requireTagStaff(adminOnly = true) {
  const session = await getServerSession(authOptions);
  if (!session || !(adminOnly ? ['admin'] : ['admin','dietitian','health_counselor']).includes(session.user.role)) throw new NativeTagError('Staff access required',403);
  return session.user;
}
export function tagError(error: unknown) {
  return nativeResponseJson({error:error instanceof NativeTagError ? error.message : 'Unable to process tag request'}, {status:error instanceof NativeTagError ? error.status : error instanceof SyntaxError ? 400 : 500});
}
