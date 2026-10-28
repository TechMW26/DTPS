import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeResponseJson} from '@/lib/api/native-response';
import {
  startFeedbackOpenWindow,
  resolveOnboardingFeedbackEligibility,
  FeedbackEligibilityError,
} from '@/lib/feedback/eligibility';

export const dynamic = 'force-dynamic';

/**
 * Called when the client opens the onboarding Google Form. Starts the 2-minute
 * open→lock window server-side; after it elapses the submission is recorded and the
 * form is hidden permanently, even if the client closes the tab.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return nativeResponseJson({error: 'Unauthorized'}, {status: 401});
    }

    if (session.user.role !== 'client') {
      return nativeResponseJson({error: 'Forbidden'}, {status: 403});
    }

    const db = getNativeDatabase();
    const now = new Date();

    const eligibility = await resolveOnboardingFeedbackEligibility(db, session.user.id, {now});
    if (eligibility.status !== 'eligible_initial') {
      return nativeResponseJson(eligibility, {status: 200, headers: {'Cache-Control': 'private, no-store'}});
    }

    await startFeedbackOpenWindow(db, session.user.id, 'initial', {now});
    const pending = await resolveOnboardingFeedbackEligibility(db, session.user.id, {now});

    return nativeResponseJson(pending, {status: 200, headers: {'Cache-Control': 'private, no-store'}});
  } catch (error) {
    if (error instanceof FeedbackEligibilityError) {
      return nativeResponseJson(
        {error: error.message, code: error.code},
        {status: error.status, headers: {'Cache-Control': 'no-store'}}
      );
    }

    console.error('Onboarding feedback open error:', error);
    return nativeResponseJson({error: 'Unable to start onboarding feedback.'}, {status: 500});
  }
}