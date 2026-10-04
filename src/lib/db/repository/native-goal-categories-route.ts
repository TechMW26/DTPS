import {nativeResponseJson} from '@/lib/api/native-response';
import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {NativeGoalCategoryError} from './native-goal-categories';
export async function requireCategoryAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin') throw new NativeGoalCategoryError('Admin access required',403);
  return session.user;
}
export function categoryError(error: unknown) {
  return nativeResponseJson({error:error instanceof NativeGoalCategoryError ? error.message : 'Unable to process goal category request'}, {status:error instanceof NativeGoalCategoryError ? error.status : error instanceof SyntaxError ? 400 : 500});
}
