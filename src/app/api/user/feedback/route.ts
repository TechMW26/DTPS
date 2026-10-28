import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeResponseJson} from '@/lib/api/native-response';
import {
  startFeedbackOpenWindow,
  resolveFeedbackEligibility,
  FeedbackEligibilityError,
} from '@/lib/feedback/eligibility';

export const dynamic = 'force-dynamic';

/**
 * Called when the client opens the recurring Google Form. Starts the 2-minute
 * open→lock window server-side; after it elapses the submission is recorded and the
 * 30-day cooldown begins, even if the client closes the tab.
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

    const eligibility = await resolveFeedbackEligibility(db, session.user.id, {now});
    if (eligibility.status !== 'eligible_recurring') {
      return nativeResponseJson(eligibility, {status: 200, headers: {'Cache-Control': 'private, no-store'}});
    }

    await startFeedbackOpenWindow(db, session.user.id, 'recurring', {now});
    const pending = await resolveFeedbackEligibility(db, session.user.id, {now});

    return nativeResponseJson(pending, {status: 200, headers: {'Cache-Control': 'private, no-store'}});
  } catch (error) {
    if (error instanceof FeedbackEligibilityError) {
      return nativeResponseJson(
        {error: error.message, code: error.code},
        {status: error.status, headers: {'Cache-Control': 'no-store'}}
      );
    }

    console.error('Feedback open error:', error);
    return nativeResponseJson({error: 'Unable to start feedback.'}, {status: 500});
  }
}