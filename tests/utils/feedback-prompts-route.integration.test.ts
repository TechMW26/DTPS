import {getServerSession} from 'next-auth';

jest.mock('@/lib/auth/config', () => ({authOptions: {}}));
jest.mock('@/lib/db/database', () => ({getNativeDatabase: () => ({})}));
jest.mock('@/lib/feedback/prompts', () => ({
  resolveFeedbackPrompts: jest.fn(async () => ({onboardingDue: true, feedbackDue: false, feedbackDueFrom: null, showPopup: true, nextPopupAt: null})),
  markFeedbackPopupShown: jest.fn(async () => ({nextPopupAt: '2026-11-06T00:00:00.000Z'})),
}));

import {GET, POST} from '@/app/api/user/feedback/prompts/route';
import {markFeedbackPopupShown, resolveFeedbackPrompts} from '@/lib/feedback/prompts';
import {FeedbackEligibilityError} from '@/lib/feedback/eligibility';

const session = (role: string) => jest.mocked(getServerSession).mockResolvedValue({user: {id: 'u1', role}} as never);

describe('feedback prompts API', () => {
  it('rejects signed-out users and staff', async () => {
    jest.mocked(getServerSession).mockResolvedValue(null as never);
    expect((await GET()).status).toBe(401);
    session('dietitian');
    expect((await GET()).status).toBe(403);
    expect((await POST()).status).toBe(403);
    expect(markFeedbackPopupShown).not.toHaveBeenCalled();
  });
  it('returns the prompts for a client and never caches them', async () => {
    session('client');
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toMatchObject({onboardingDue: true, showPopup: true});
  });
  it('records the popup only on POST', async () => {
    session('client');
    await GET();
    expect(markFeedbackPopupShown).not.toHaveBeenCalled();
    expect((await POST()).status).toBe(200);
    expect(markFeedbackPopupShown).toHaveBeenCalledTimes(1);
  });
  it('shows nothing (not an error) when the joining date is unknown', async () => {
    session('client');
    jest.mocked(resolveFeedbackPrompts).mockRejectedValueOnce(new FeedbackEligibilityError('unknown', 'missing_registration', 409));
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({showPopup: false, feedbackDue: false, onboardingDue: false});
  });
});
