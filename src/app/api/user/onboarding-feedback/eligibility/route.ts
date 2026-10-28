import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeResponseJson} from '@/lib/api/native-response';
import {resolveOnboardingFeedbackEligibility, FeedbackEligibilityError} from '@/lib/feedback/eligibility';

export const dynamic = 'force-dynamic';

/**
 * Onboarding feedback eligibility is always recomputed from persisted server-side data,
 * so refreshing the page or calling this endpoint directly cannot unlock it early.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return nativeResponseJson({error: 'Unauthorized'}, {status: 401});
    }

    if (session.user.role !== 'client') {
      return nativeResponseJson({error: 'Forbidden'}, {status: 403});
    }

    const eligibility = await resolveOnboardingFeedbackEligibility(getNativeDatabase(), session.user.id);

    return nativeResponseJson(eligibility, {
      status: 200,
      headers: {'Cache-Control': 'private, no-store'},
    });
  } catch (error) {
    if (error instanceof FeedbackEligibilityError) {
      return nativeResponseJson(
        {error: error.message, code: error.code},
        {status: error.status, headers: {'Cache-Control': 'private, no-store'}}
      );
    }

    console.error('Onboarding feedback eligibility error:', error);
    return nativeResponseJson(
      {error: 'Unable to load onboarding feedback eligibility.'},
      {status: 500, headers: {'Cache-Control': 'private, no-store'}}
    );
  }
}
