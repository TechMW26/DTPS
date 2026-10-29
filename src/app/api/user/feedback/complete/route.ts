import type {NextRequest} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeResponseJson} from '@/lib/api/native-response';
import {
  recordSelfReportedFeedback,
  resolveFeedbackEligibility,
  resolveOnboardingFeedbackEligibility,
  FeedbackEligibilityError,
} from '@/lib/feedback/eligibility';

export const dynamic = 'force-dynamic';

/**
 * Called by the feedback page once Google Forms shows its "response recorded" page inside
 * the embedded form. It records that this client has filled the form, so the onboarding
 * form is not offered again and the monthly form waits 30 days. The usual rules still
 * apply inside recordFeedbackSubmission: onboarding is recorded only once, and a monthly
 * record inside the 30-day window is ignored. A client can only ever lock their own form.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return nativeResponseJson({error: 'Unauthorized'}, {status: 401});
    }
    if (session.user.role !== 'client') {
      return nativeResponseJson({error: 'Forbidden'}, {status: 403});
    }

    const body = (await request.json().catch(() => null)) as {formType?: unknown} | null;
    const formType = body?.formType;
    if (formType !== 'initial' && formType !== 'recurring') {
      return nativeResponseJson({error: 'Invalid form type.'}, {status: 400});
    }

    const db = getNativeDatabase();
    const now = new Date();
    await recordSelfReportedFeedback(db, session.user.id, formType, {now});

    const eligibility =
      formType === 'initial'
        ? await resolveOnboardingFeedbackEligibility(db, session.user.id, {now})
        : await resolveFeedbackEligibility(db, session.user.id, {now});

    return nativeResponseJson(eligibility, {status: 200, headers: {'Cache-Control': 'private, no-store'}});
  } catch (error) {
    if (error instanceof FeedbackEligibilityError) {
      return nativeResponseJson(
        {error: error.message, code: error.code},
        {status: error.status, headers: {'Cache-Control': 'no-store'}}
      );
    }
    console.error('Feedback completion error:', error);
    return nativeResponseJson({error: 'Unable to save feedback status.'}, {status: 500});
  }
}
