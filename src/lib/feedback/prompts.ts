import type {MongoDatabase, DocumentData} from '@/lib/db/mongo-types';
import {resolveFeedbackEligibility, resolveOnboardingFeedbackEligibility} from './eligibility';

/** Feedback form starts on this day, counting the day the DT first publishes the diet plan as day 1. */
export const FEEDBACK_PROMPT_START_DAY = 10;
/** After the popup is shown once (app open, Meal, Message or Profile), it waits this long. */
export const FEEDBACK_POPUP_GAP_MS = 24 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const PROMPT_COLLECTION = 'user_feedback_prompts';

export type FeedbackPrompts = {
  /** Onboarding form not submitted yet. */
  onboardingDue: boolean;
  /** Feedback form open for this client (10th day reached and not submitted in the current cycle). */
  feedbackDue: boolean;
  /** When the feedback form starts (null until the DT publishes a diet plan). */
  feedbackDueFrom: string | null;
  /** True when the popup may be shown now (something is due and 24 hours have passed). */
  showPopup: boolean;
  /** When the popup may show again after the last time it was shown. */
  nextPopupAt: string | null;
};

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as {toDate?: unknown}).toDate === 'function') {
    const result = (value as {toDate: () => unknown}).toDate();
    return result instanceof Date && !Number.isNaN(result.getTime()) ? result : null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const result = new Date(value);
    return Number.isNaN(result.getTime()) ? null : result;
  }
  return null;
}

/** First time the DT published a diet plan for this client. Drafts never count. */
export async function firstDietPlanPublishedAt(db: MongoDatabase, userId: string): Promise<Date | null> {
  const plans = await db.collection('clientmealplans').where('clientId', '==', userId).get();
  let first: Date | null = null;
  for (const doc of plans.docs) {
    const plan = doc.data() as DocumentData;
    if (plan.isDeleted) continue;
    // Older plans have no firstPublishedAt; a non-draft plan was published when it was created.
    const at = toDate(plan.firstPublishedAt) ?? (plan.status && plan.status !== 'draft' ? toDate(plan.createdAt) : null);
    if (at && (!first || at.getTime() < first.getTime())) first = at;
  }
  return first;
}

/** Start (Indian time midnight) of the 10th day, where the publish day is day 1. */
export function feedbackStartDate(publishedAt: Date): Date {
  const istMidnight = Math.floor((publishedAt.getTime() + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
  return new Date(istMidnight + (FEEDBACK_PROMPT_START_DAY - 1) * DAY_MS);
}

async function lastPopupShownAt(db: MongoDatabase, userId: string): Promise<Date | null> {
  const doc = await db.collection(PROMPT_COLLECTION).doc(userId).get();
  return doc.exists ? toDate(doc.get('lastShownAt')) : null;
}

export async function resolveFeedbackPrompts(db: MongoDatabase, userId: string, options: {now?: Date} = {}): Promise<FeedbackPrompts> {
  const now = options.now ?? new Date();

  const onboarding = await resolveOnboardingFeedbackEligibility(db, userId, {now});
  const onboardingDue = onboarding.status !== 'completed';

  const publishedAt = await firstDietPlanPublishedAt(db, userId);
  const dueFrom = publishedAt ? feedbackStartDate(publishedAt) : null;
  let feedbackDue = false;
  if (dueFrom && now.getTime() >= dueFrom.getTime()) {
    const feedback = await resolveFeedbackEligibility(db, userId, {now});
    feedbackDue = feedback.status !== 'cooldown';
  }

  const shownAt = await lastPopupShownAt(db, userId);
  const nextPopupAt = shownAt ? new Date(shownAt.getTime() + FEEDBACK_POPUP_GAP_MS) : null;
  const showPopup = (onboardingDue || feedbackDue) && (!nextPopupAt || now.getTime() >= nextPopupAt.getTime());

  return {
    onboardingDue,
    feedbackDue,
    feedbackDueFrom: dueFrom ? dueFrom.toISOString() : null,
    showPopup,
    nextPopupAt: nextPopupAt ? nextPopupAt.toISOString() : null,
  };
}

/**
 * Records that the popup was shown. Inside the 24-hour window nothing changes, so a
 * refresh or a second section cannot restart or skip the window.
 */
export async function markFeedbackPopupShown(db: MongoDatabase, userId: string, options: {now?: Date} = {}): Promise<{nextPopupAt: string}> {
  const now = options.now ?? new Date();
  const ref = db.collection(PROMPT_COLLECTION).doc(userId);
  return db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    const shownAt = current.exists ? toDate(current.get('lastShownAt')) : null;
    if (shownAt && now.getTime() < shownAt.getTime() + FEEDBACK_POPUP_GAP_MS) {
      return {nextPopupAt: new Date(shownAt.getTime() + FEEDBACK_POPUP_GAP_MS).toISOString()};
    }
    tx.set(ref, {userId, lastShownAt: now, updatedAt: now});
    return {nextPopupAt: new Date(now.getTime() + FEEDBACK_POPUP_GAP_MS).toISOString()};
  });
}
