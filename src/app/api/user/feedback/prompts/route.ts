import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth/config';
import {getNativeDatabase} from '@/lib/db/database';
import {nativeResponseJson} from '@/lib/api/native-response';
import {FeedbackEligibilityError} from '@/lib/feedback/eligibility';
import {markFeedbackPopupShown, resolveFeedbackPrompts} from '@/lib/feedback/prompts';

export const dynamic = 'force-dynamic';
const NO_STORE = {'Cache-Control': 'private, no-store'};

async function clientId() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return {error: nativeResponseJson({error: 'Unauthorized'}, {status: 401})};
  if (session.user.role !== 'client') return {error: nativeResponseJson({error: 'Forbidden'}, {status: 403})};
  return {id: session.user.id};
}

function failed(error: unknown) {
  if (error instanceof FeedbackEligibilityError) {
    // Unknown joining date etc.: show nothing rather than an error to the client.
    return nativeResponseJson({onboardingDue: false, feedbackDue: false, feedbackDueFrom: null, showPopup: false, nextPopupAt: null}, {status: 200, headers: NO_STORE});
  }
  console.error('Feedback prompts error:', error);
  return nativeResponseJson({error: 'Unable to load feedback reminders.'}, {status: 500, headers: NO_STORE});
}

/** Which forms are due, and whether the popup may show now. Always computed on the server. */
export async function GET() {
  try {
    const user = await clientId();
    if (user.error) return user.error;
    return nativeResponseJson(await resolveFeedbackPrompts(getNativeDatabase(), user.id), {status: 200, headers: NO_STORE});
  } catch (error) {
    return failed(error);
  }
}

/** Called once the popup is on screen; starts the 24-hour gap for all sections. */
export async function POST() {
  try {
    const user = await clientId();
    if (user.error) return user.error;
    const db = getNativeDatabase();
    await markFeedbackPopupShown(db, user.id);
    return nativeResponseJson(await resolveFeedbackPrompts(db, user.id), {status: 200, headers: NO_STORE});
  } catch (error) {
    return failed(error);
  }
}
