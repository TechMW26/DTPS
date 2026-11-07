/**
 * Diwali 2026 greeting: dates and text shared by the app popup and the push notification.
 * All times are Indian time (IST = UTC+5:30).
 */

/** Popup shows from 8 Nov 2026, 12:00 AM IST ... */
export const DIWALI_POPUP_START = new Date('2026-11-08T00:00:00+05:30');
/** ... until the end of 10 Nov 2026 (11:59:59 PM IST). */
export const DIWALI_POPUP_END = new Date('2026-11-11T00:00:00+05:30');

/** Push goes out from 8 Nov, 12:00 AM IST. Anyone not reached by the end of 8 Nov is not sent a late greeting. */
export const DIWALI_PUSH_START = new Date('2026-11-08T00:00:00+05:30');
export const DIWALI_PUSH_END = new Date('2026-11-09T00:00:00+05:30');

export const DIWALI_CAMPAIGN = 'diwali-2026';
// Emoji written as codes so the file stays plain ASCII: \u{1FA94} = diya, \u2728 = sparkles.
export const DIWALI_PUSH_TITLE = '\u{1FA94} This Diwali, Let Health Shine Brighter! \u{1FA94}';
export const DIWALI_PUSH_BODY = 'May this festival of lights bring happiness to your home, positivity to your life and good health to your family. Wishing you a sparkling, healthy and joyful Diwali! \u2728';
/** Picture shown in the expanded notification (public https URL, drawn by /api/festive/diwali-banner). */
export const DIWALI_PUSH_IMAGE = 'https://dtps.tech/api/festive/diwali-banner';

export function isDiwaliPopupTime(now: Date = new Date()): boolean {
  const t = now.getTime();
  return t >= DIWALI_POPUP_START.getTime() && t < DIWALI_POPUP_END.getTime();
}

export function isDiwaliPushTime(now: Date = new Date()): boolean {
  const t = now.getTime();
  return t >= DIWALI_PUSH_START.getTime() && t < DIWALI_PUSH_END.getTime();
}
