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
// Emoji written as codes so the file stays plain ASCII: \u{1FA94} = diya, \u2728 = sparkles, \u{1F386} = fireworks.
export const DIWALI_PUSH_TITLE = '\u{1FA94} Happy Diwali from Team DTPS! \u2728';
export const DIWALI_PUSH_BODY = "May this festival of lights fill your home with joy and your plate with goodness. Here's to a healthier, happier you \u{1F386}";
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
