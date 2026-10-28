import type {MongoDatabase, DocumentData} from '@/lib/db/mongo-types';
import {createFeedbackToken, feedbackTokenFingerprint, type FeedbackFormType} from './token';

/** 30 days measured in exact 24-hour periods, as required by the feedback policy. */
export const FEEDBACK_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export const FEEDBACK_FORMS: Record<FeedbackFormType, string> = {
  initial: 'https://forms.gle/vh66XdtTQkky2eU7A',
  recurring: 'https://forms.gle/zXF8NyKib7T1uExG8',
};

/** Name of the Google Forms short-answer field that receives the signed token. */
export const FEEDBACK_TOKEN_FIELD = 'dtps_feedback_token';

const USER_COLLECTION = 'users';
const SUBMISSION_COLLECTION = 'user_feedback_submissions';

export type FeedbackEligibilityStatus = 'eligible_recurring' | 'cooldown';

export type FeedbackEligibility = {
  status: FeedbackEligibilityStatus;
  canSubmit: boolean;
  formType: FeedbackFormType | null;
  remainingSeconds: number;
  nextEligibleAt: string | null;
  formUrl: string | null;
  formToken: string | null;
};

/** Eligibility for the once-per-lifetime onboarding feedback form. */
export type OnboardingFeedbackEligibility = {
  canSubmit: boolean;
  formType: 'initial';
  formUrl: string | null;
  formToken: string | null;
};

export class FeedbackEligibilityError extends Error {
  constructor(message: string, public readonly code: 'user_not_found' | 'missing_registration', public readonly status: number) {
    super(message);
    this.name = 'FeedbackEligibilityError';
  }
}

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

/** Google Forms only accepts alphanumeric-with-underscores names, so DTPS document IDs must match. */
function isSafeFormValue(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export function buildFeedbackFormUrl(formType: FeedbackFormType, token: string): string {
  const base = FEEDBACK_FORMS[formType];
  const entryId = process.env.DTPS_FEEDBACK_TOKEN_ENTRY_ID;
  if (!entryId) {
    // Without the entry ID the form still opens; the token is shown for support use.
    return base;
  }
  if (!isSafeFormValue(entryId)) throw new Error('Invalid feedback form entry ID configuration');
  const url = new URL(base);
  url.searchParams.set(`entry.${entryId}`, token);
  return url.toString();
}

type SubmissionRecord = {
  userId: string;
  formType: FeedbackFormType;
  submittedAt: Date;
};

async function latestSubmission(
  db: MongoDatabase,
  userId: string,
  formType: FeedbackFormType
): Promise<SubmissionRecord | null> {
  const snapshot = await db
    .collection(SUBMISSION_COLLECTION)
    .where('userId', '==', userId)
    .where('formType', '==', formType)
    .orderBy('submittedAt', 'desc')
    .limit(1)
    .get();

  const doc = snapshot.docs[0];
  const data = doc?.data();
  const submittedAt = toDate(data?.submittedAt);
  if (!doc || !data || !submittedAt) return null;
  return {userId, formType, submittedAt};
}

async function readRegistration(db: MongoDatabase, userId: string): Promise<{email?: string; joinedAt: Date}> {
  const doc = await db.collection(USER_COLLECTION).doc(userId).get();
  if (!doc.exists) {
    throw new FeedbackEligibilityError('Client account not found.', 'user_not_found', 404);
  }

  const data = doc.data() as DocumentData;
  const joinedAt = toDate(data?.createdAt);
  // Never grant feedback eligibility from an unknown registration date.
  if (!joinedAt) {
    throw new FeedbackEligibilityError(
      'Your account joining date is unavailable. Please contact support.',
      'missing_registration',
    409
    );
  }

  return {email: typeof data?.email === 'string' ? data.email : undefined, joinedAt};
}

/**
 * Resolves eligibility for the recurring feedback form only. Every client is eligible
 * from day 1; the form is gated by a rolling 30-day cooldown after each submission.
 * All inputs are server-side.
 */
export async function resolveFeedbackEligibility(
  db: MongoDatabase,
  userId: string,
  options: {now?: Date} = {}
): Promise<FeedbackEligibility> {
  const now = options.now ?? new Date();
  await readRegistration(db, userId);

  const recurring = await latestSubmission(db, userId, 'recurring');
  if (recurring) {
    const nextEligibleAt = new Date(recurring.submittedAt.getTime() + FEEDBACK_COOLDOWN_MS);
    if (now.getTime() < nextEligibleAt.getTime()) {
      return {
        status: 'cooldown',
        canSubmit: false,
        formType: 'recurring',
        remainingSeconds: Math.ceil((nextEligibleAt.getTime() - now.getTime()) / 1000),
        nextEligibleAt: nextEligibleAt.toISOString(),
        formUrl: null,
        formToken: null,
      };
    }
  }

  const token = createFeedbackToken(userId, 'recurring', {now: now.getTime()});
  return {
    status: 'eligible_recurring',
    canSubmit: true,
    formType: 'recurring',
    remainingSeconds: 0,
    nextEligibleAt: null,
    formUrl: buildFeedbackFormUrl('recurring', token),
    formToken: token,
  };
}

/**
 * Resolves eligibility for the once-per-lifetime onboarding feedback form. Unlike
 * recurring feedback it is not gated by a wait or cooldown: it is available from day 1
 * and can only be completed once. All inputs are server-side.
 */
export async function resolveOnboardingFeedbackEligibility(
  db: MongoDatabase,
  userId: string,
  options: {now?: Date} = {}
): Promise<OnboardingFeedbackEligibility> {
  const now = options.now ?? new Date();
  await readRegistration(db, userId);

  const firstSubmission = await latestSubmission(db, userId, 'initial');
  if (firstSubmission) {
    return {
      canSubmit: false,
      formType: 'initial',
      formUrl: null,
      formToken: null,
    };
  }

  const token = createFeedbackToken(userId, 'initial', {now: now.getTime()});
  return {
    canSubmit: true,
    formType: 'initial',
    formUrl: buildFeedbackFormUrl('initial', token),
    formToken: token,
  };
}

export type FeedbackSubmissionInput = {
  token: string;
  /** Derived from the verified token signature, never from the request body. */
  tokenUserId: string;
  formType: FeedbackFormType;
  /** Email supplied by Google Forms, used only for cross-checking, never for identity. */
  email?: string;
  responseId?: string;
  submittedAt?: Date;
};

export type FeedbackSubmissionResult =
  | {status: 'recorded'; userId: string; formType: FeedbackFormType; submittedAt: Date}
  | {status: 'duplicate'; userId: string; formType: FeedbackFormType}
  | {status: 'ignored'; reason: 'already_completed_initial' | 'within_cooldown'};

/**
 * Records a verified submission. The token is the identity source; the browser/user ID
 * never is. Duplicate delivery and out-of-order submissions are rejected inside one
 * transaction so concurrent Apps Script retries cannot double-credit a client.
 */
export async function recordFeedbackSubmission(
  db: MongoDatabase,
  input: FeedbackSubmissionInput,
  options: {now?: Date} = {}
): Promise<FeedbackSubmissionResult> {
  const now = options.now ?? new Date();
  const submittedAt = input.submittedAt ?? now;
  const fingerprint = feedbackTokenFingerprint(input.token);
  const submissionRef = db.collection(SUBMISSION_COLLECTION).doc(fingerprint);

  const {email} = await readRegistration(db, input.tokenUserId);

  const existingFingerprint = await submissionRef.get();
  if (existingFingerprint.exists) {
    return {status: 'duplicate', userId: input.tokenUserId, formType: input.formType};
  }

  let outcome: FeedbackSubmissionResult = {status: 'ignored', reason: 'within_cooldown'};

  try {
    await db.runTransaction(async (tx) => {
      const duplicate = await tx.get(submissionRef);
      if (duplicate.exists) {
        outcome = {status: 'duplicate', userId: input.tokenUserId, formType: input.formType};
        return;
      }

      const submissions = await tx.get(
        db
          .collection(SUBMISSION_COLLECTION)
          .where('userId', '==', input.tokenUserId)
          .where('formType', '==', input.formType)
          .orderBy('submittedAt', 'desc')
          .limit(1)
      );

      const previous = submissions.docs[0]?.data();
      const previousAt = toDate(previous?.submittedAt);

      if (input.formType === 'initial' && previousAt) {
        outcome = {status: 'ignored', reason: 'already_completed_initial'};
        return;
      }

      if (input.formType === 'recurring' && previousAt) {
        const nextEligibleAt = previousAt.getTime() + FEEDBACK_COOLDOWN_MS;
        if (now.getTime() < nextEligibleAt) {
          outcome = {status: 'ignored', reason: 'within_cooldown'};
          return;
        }
      }

      tx.create(submissionRef, {
        userId: input.tokenUserId,
        email: email ?? null,
        formEmail: input.email ?? null,
        formType: input.formType,
        responseId: input.responseId ?? null,
        submittedAt,
        recordedAt: now,
        source: 'google_forms',
      });

      outcome = {status: 'recorded', userId: input.tokenUserId, formType: input.formType, submittedAt};
    });
  } catch (error) {
    // A concurrent delivery of the same token won the race; report it as a duplicate.
    if (error instanceof Error && /ALREADY_EXISTS|already exists/i.test(error.message)) {
      return {status: 'duplicate', userId: input.tokenUserId, formType: input.formType};
    }
    throw error;
  }

  return outcome;
}
