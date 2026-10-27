import {timingSafeEqual} from 'node:crypto';
import type {NextRequest} from 'next/server';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeResponseJson} from '@/lib/api/native-response';
import {recordFeedbackSubmission, FeedbackEligibilityError} from '@/lib/feedback/eligibility';
import {verifyFeedbackToken, FeedbackTokenError} from '@/lib/feedback/token';

export const dynamic = 'force-dynamic';

function authorized(header: string | null): boolean {
  const expected = process.env.FEEDBACK_CONFIRM_SECRET;
  if (!expected) return false;
  const provided = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Called by the Google Apps Script bound to each form's linked Sheet after a real
 * submission row appears. Opening or clicking the form never reaches this endpoint,
 * so eligibility only moves after Google confirms a response exists.
 */
export async function POST(request: NextRequest) {
  if (!process.env.FEEDBACK_CONFIRM_SECRET) {
    return nativeResponseJson({error: 'Feedback confirmation is not configured.'}, {status: 503});
  }

  if (!authorized(request.headers.get('authorization'))) {
    return nativeResponseJson({error: 'Unauthorized'}, {status: 401});
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return nativeResponseJson({error: 'Invalid JSON request body.'}, {status: 400});
  }

  if (!body || typeof body !== 'object') {
    return nativeResponseJson({error: 'Invalid feedback confirmation data.'}, {status: 400});
  }

  const {token, email, responseId, submittedAt} = body as {
    token?: unknown;
    email?: unknown;
    responseId?: unknown;
    submittedAt?: unknown;
  };

  let payload: ReturnType<typeof verifyFeedbackToken>;
  try {
    payload = verifyFeedbackToken(token);
  } catch (error) {
    if (error instanceof FeedbackTokenError) {
      return nativeResponseJson({error: error.message, code: error.reason}, {status: 400});
    }
    throw error;
  }

  let submitted: Date | undefined;
  if (typeof submittedAt === 'string' || typeof submittedAt === 'number') {
    const parsed = new Date(submittedAt);
    if (!Number.isNaN(parsed.getTime())) submitted = parsed;
  }

  try {
    const result = await recordFeedbackSubmission(getNativeDatabase(), {
      token: token as string,
      tokenUserId: payload.userId,
      formType: payload.formType,
      email: typeof email === 'string' ? email : undefined,
      responseId: typeof responseId === 'string' ? responseId : undefined,
      submittedAt: submitted,
    });

    return nativeResponseJson(result, {status: 200, headers: {'Cache-Control': 'no-store'}});
  } catch (error) {
    if (error instanceof FeedbackEligibilityError) {
      return nativeResponseJson({error: error.message, code: error.code}, {status: error.status});
    }

    console.error('Feedback confirmation error:', error);
    return nativeResponseJson({error: 'Unable to record feedback submission.'}, {status: 500});
  }
}
