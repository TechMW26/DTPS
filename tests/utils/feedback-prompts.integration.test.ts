import {feedbackStartDate, FEEDBACK_POPUP_GAP_MS} from '@/lib/feedback/prompts';

describe('feedback form start day', () => {
  it('starts on the 10th day, counting the publish day as day 1 (Indian time)', () => {
    // Published 1 Nov, 10:00 IST -> 10th day starts 10 Nov, 00:00 IST.
    expect(feedbackStartDate(new Date('2026-11-01T04:30:00Z')).toISOString()).toBe('2026-11-09T18:30:00.000Z');
    // Published 1 Nov, 23:30 IST -> still 1 Nov.
    expect(feedbackStartDate(new Date('2026-11-01T18:00:00Z')).toISOString()).toBe('2026-11-09T18:30:00.000Z');
    // Published 2 Nov, 00:30 IST -> 11 Nov.
    expect(feedbackStartDate(new Date('2026-11-01T19:00:00Z')).toISOString()).toBe('2026-11-10T18:30:00.000Z');
  });
  it('uses a 24-hour popup gap', () => {
    expect(FEEDBACK_POPUP_GAP_MS).toBe(24 * 60 * 60 * 1000);
  });
});
