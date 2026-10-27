import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto';

/**
 * A feedback token is handed to Google Forms as a prefilled field. It is the only
 * trusted link between a form response and a DTPS account: the browser can copy a
 * user ID, but it cannot forge this signature.
 */
export type FeedbackFormType = 'initial' | 'recurring';

export type FeedbackTokenPayload = {
  userId: string;
  formType: FeedbackFormType;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

export class FeedbackTokenError extends Error {
  constructor(message: string, public readonly reason: 'missing' | 'invalid' | 'expired') {
    super(message);
    this.name = 'FeedbackTokenError';
  }
}

export const FEEDBACK_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function tokenSecret(): string {
  const secret = process.env.FEEDBACK_TOKEN_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('Feedback token secret is not configured');
  return secret;
}

function sign(unsigned: string): string {
  return createHmac('sha256', tokenSecret()).update(unsigned).digest('base64url');
}

function isFormType(value: unknown): value is FeedbackFormType {
  return value === 'initial' || value === 'recurring';
}

export function createFeedbackToken(
  userId: string,
  formType: FeedbackFormType,
  options: {now?: number; ttlMs?: number} = {}
): string {
  if (!userId || userId.includes('/')) throw new Error('Invalid feedback target user');

  const issuedAt = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? FEEDBACK_TOKEN_TTL_MS;
  const payload: FeedbackTokenPayload = {
    userId,
    formType,
    issuedAt,
    expiresAt: issuedAt + ttlMs,
    nonce: randomBytes(12).toString('hex'),
  };

  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

export function verifyFeedbackToken(token: unknown, options: {now?: number} = {}): FeedbackTokenPayload {
  if (typeof token !== 'string' || !token.includes('.')) {
    throw new FeedbackTokenError('Feedback token is missing.', 'missing');
  }

  const [body, signature, ...rest] = token.split('.');
  if (!body || !signature || rest.length) {
    throw new FeedbackTokenError('Feedback token is malformed.', 'invalid');
  }

  const expected = Buffer.from(sign(body), 'utf8');
  const provided = Buffer.from(signature, 'utf8');
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw new FeedbackTokenError('Feedback token signature is invalid.', 'invalid');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new FeedbackTokenError('Feedback token payload is invalid.', 'invalid');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new FeedbackTokenError('Feedback token payload is invalid.', 'invalid');
  }

  const payload = parsed as Partial<FeedbackTokenPayload>;
  if (
    typeof payload.userId !== 'string' ||
    !payload.userId ||
    payload.userId.includes('/') ||
    !isFormType(payload.formType) ||
    typeof payload.issuedAt !== 'number' ||
    typeof payload.expiresAt !== 'number' ||
    typeof payload.nonce !== 'string'
  ) {
    throw new FeedbackTokenError('Feedback token payload is invalid.', 'invalid');
  }

  const now = options.now ?? Date.now();
  if (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= now) {
    throw new FeedbackTokenError('Feedback token has expired.', 'expired');
  }

  return payload as FeedbackTokenPayload;
}

/** Deduplicates replays of the same delivery even if two requests arrive together. */
export function feedbackTokenFingerprint(token: string): string {
  return createHmac('sha256', tokenSecret()).update('fingerprint:' + token).digest('hex');
}
