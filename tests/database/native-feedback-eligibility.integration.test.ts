import {createFeedbackToken, verifyFeedbackToken, FEEDBACK_TOKEN_TTL_MS, FeedbackTokenError} from '@/lib/feedback/token';
import {
  resolveFeedbackEligibility,
  recordFeedbackSubmission,
  FeedbackEligibilityError,
  FEEDBACK_FORMS,
  FEEDBACK_INITIAL_WAIT_MS,
  FEEDBACK_COOLDOWN_MS,
} from '@/lib/feedback/eligibility';
import type {MongoDatabase} from '@/lib/db/mongo-types';

const DAY = 24 * 60 * 60 * 1000;

/**
 * In-memory stand-in for the mongo-native facade. It implements only the surface the
 * feedback service uses (doc get/set/create, where/orderBy/limit/get, runTransaction)
 * so eligibility rules can be tested without a replica set.
 */
type Row = Record<string, unknown>;

class MemoryRef {
  constructor(public store: Map<string, Row>, public path: string) {}
  get id() {
    return this.path.split('/').at(-1)!;
  }
  async get() {
    const row = this.store.get(this.path);
    return {
      id: this.id,
      exists: row !== undefined,
      data: () => (row ? {...row} : undefined),
      ref: this,
    };
  }
  async set(data: Row) {
    this.store.set(this.path, {...data, _id: this.id});
  }
  async create(data: Row) {
    if (this.store.has(this.path)) throw new Error('ALREADY_EXISTS: document exists');
    this.store.set(this.path, {...data, _id: this.id});
  }
}

class MemoryQuery {
  private filters: [string, unknown][] = [];
  private order?: {field: string; dir: 'asc' | 'desc'};
  private max?: number;
  constructor(private prefix: string, private rows: () => Row[]) {}
  where(field: string, op: string, value: unknown) {
    this.filters.push([field, value]);
    return this;
  }
  orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
    this.order = {field, dir};
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  async get() {
    let matches = this.rows().filter((row) => this.filters.every(([f, v]) => row[f] === v));
    if (this.order) {
      const {field, dir} = this.order;
      matches = [...matches].sort((a, b) => {
        const left = (a[field] as Date).getTime();
        const right = (b[field] as Date).getTime();
        return dir === 'asc' ? left - right : right - left;
      });
    }
    if (this.max !== undefined) matches = matches.slice(0, this.max);
    const docs = matches.map((row) => ({id: String(row._id), exists: true, data: () => ({...row})}));
    return {size: docs.length, docs};
  }
}

function memoryDatabase() {
  const stores = new Map<string, Map<string, Row>>();
  const storeOf = (collection: string) => {
    if (!stores.has(collection)) stores.set(collection, new Map());
    return stores.get(collection)!;
  };

  const db = {
    databaseId: 'test',
    collection(name: string) {
      const store = storeOf(name);
      return Object.assign(new MemoryQuery(name, () => [...store.values()]), {
        doc: (id: string) => new MemoryRef(store, `${name}/${id}`),
      });
    },
    async runTransaction<T>(work: (tx: unknown) => Promise<T>) {
      const tx = {
        get: (target: MemoryRef | MemoryQuery) => target.get(),
        create: (ref: MemoryRef, data: Row) => {
          if (ref.store.has(ref.path)) throw new Error('ALREADY_EXISTS: document exists');
          ref.store.set(ref.path, {...data});
          return tx;
        },
        set: (ref: MemoryRef, data: Row) => {
          ref.store.set(ref.path, {...data});
          return tx;
        },
        update: (ref: MemoryRef, data: Row) => {
          const current = ref.store.get(ref.path) ?? {};
          ref.store.set(ref.path, {...current, ...data});
          return tx;
        },
      };
      return work(tx);
    },
  };

  return {db: db as unknown as MongoDatabase, stores};
}

async function seedUser(db: MongoDatabase, userId: string, joinedDaysAgo: number) {
  const joinedAt = new Date(Date.now() - joinedDaysAgo * DAY);
  await db.collection('users').doc(userId).set({email: `${userId}@example.com`, role: 'client', createdAt: joinedAt});
  return joinedAt;
}

async function submit(
  db: MongoDatabase,
  userId: string,
  formType: 'initial' | 'recurring',
  submittedAt: Date,
  now: Date = new Date()
) {
  const token = createFeedbackToken(userId, formType);
  return recordFeedbackSubmission(db, {token, tokenUserId: userId, formType, submittedAt}, {now});
}

describe('feedback tokens', () => {
  it('round-trips a signed token and rejects a forged signature', () => {
    const token = createFeedbackToken('user-1', 'initial');
    expect(verifyFeedbackToken(token)).toMatchObject({userId: 'user-1', formType: 'initial'});

    const [body] = token.split('.');
    const forged = `${body}.${Buffer.from('not-the-signature').toString('base64url')}`;
    expect(() => verifyFeedbackToken(forged)).toThrow(FeedbackTokenError);
  });

  it('rejects tokens whose payload was tampered with', () => {
    const token = createFeedbackToken('user-1', 'initial');
    const [, signature] = token.split('.');
    const tampered = Buffer.from(JSON.stringify({userId: 'user-2', formType: 'initial', issuedAt: Date.now(), expiresAt: Date.now() + DAY, nonce: 'x'})).toString('base64url');
    expect(() => verifyFeedbackToken(`${tampered}.${signature}`)).toThrow(/signature is invalid/);
  });

  it('expires tokens at the configured TTL and rejects malformed values', () => {
    const issuedAt = Date.now();
    const token = createFeedbackToken('user-1', 'recurring', {now: issuedAt});
    expect(verifyFeedbackToken(token, {now: issuedAt + FEEDBACK_TOKEN_TTL_MS - 1000})).toMatchObject({userId: 'user-1'});
    expect(() => verifyFeedbackToken(token, {now: issuedAt + FEEDBACK_TOKEN_TTL_MS + 1})).toThrow(/expired/);
    expect(() => verifyFeedbackToken(undefined)).toThrow(/missing/);
    expect(() => verifyFeedbackToken('not-a-token')).toThrow(/missing/);
  });
});

describe('feedback eligibility', () => {
  it('waits for a client who joined 2 days ago', async () => {
    const {db} = memoryDatabase();
    await seedUser(db, 'new-client', 2);

    const eligibility = await resolveFeedbackEligibility(db, 'new-client');
    expect(eligibility.status).toBe('waiting_initial');
    expect(eligibility.canSubmit).toBe(false);
    expect(eligibility.formUrl).toBeNull();
    expect(eligibility.remainingSeconds).toBeGreaterThan(7 * DAY / 1000);
    expect(eligibility.remainingSeconds).toBeLessThanOrEqual(8 * DAY / 1000);
  });

  it('unlocks the first form at exactly 10 days', async () => {
    const {db} = memoryDatabase();
    const joinedAt = new Date(Date.now() - FEEDBACK_INITIAL_WAIT_MS);
    await db.collection('users').doc('exact').set({email: 'a@b.co', createdAt: joinedAt});

    const eligibility = await resolveFeedbackEligibility(db, 'exact', {now: new Date(joinedAt.getTime() + FEEDBACK_INITIAL_WAIT_MS)});
    expect(eligibility.status).toBe('eligible_initial');
    expect(eligibility.formUrl).toBe(FEEDBACK_FORMS.initial);
  });

  it('never grants eligibility when the registration timestamp is missing', async () => {
    const {db} = memoryDatabase();
    await db.collection('users').doc('no-date').set({email: 'a@b.co'});
    await expect(resolveFeedbackEligibility(db, 'no-date')).rejects.toBeInstanceOf(FeedbackEligibilityError);
  });

  it('fails safely for an unknown client', async () => {
    const {db} = memoryDatabase();
    await expect(resolveFeedbackEligibility(db, 'ghost')).rejects.toMatchObject({code: 'user_not_found', status: 404});
  });

  it('allows recurring feedback once the first form is recorded', async () => {
    const {db} = memoryDatabase();
    await seedUser(db, 'client', 20);
    await submit(db, 'client', 'initial', new Date(Date.now() - 5 * DAY));

    const eligibility = await resolveFeedbackEligibility(db, 'client');
    expect(eligibility.status).toBe('eligible_recurring');
    expect(eligibility.formUrl).toBe(FEEDBACK_FORMS.recurring);
  });

  it('applies the cooldown after a recurring submission', async () => {
    const {db} = memoryDatabase();
    await seedUser(db, 'client', 30);
    await submit(db, 'client', 'initial', new Date(Date.now() - 20 * DAY));
    await submit(db, 'client', 'recurring', new Date(Date.now() - DAY));

    const eligibility = await resolveFeedbackEligibility(db, 'client');
    expect(eligibility.status).toBe('cooldown');
    expect(eligibility.canSubmit).toBe(false);
    expect(eligibility.remainingSeconds).toBeGreaterThan(8 * DAY / 1000);
  });

  it('reopens recurring feedback once the cooldown expires', async () => {
    const {db} = memoryDatabase();
    await seedUser(db, 'client', 40);
    await submit(db, 'client', 'initial', new Date(Date.now() - 30 * DAY));
    await submit(db, 'client', 'recurring', new Date(Date.now() - FEEDBACK_COOLDOWN_MS - 60_000));

    const eligibility = await resolveFeedbackEligibility(db, 'client');
    expect(eligibility.status).toBe('eligible_recurring');
  });
});

describe('feedback submission recording', () => {
  it('ignores duplicate delivery of the same Google Forms response', async () => {
    const {db} = memoryDatabase();
    await seedUser(db, 'client', 20);

    const token = createFeedbackToken('client', 'initial');
    const first = await recordFeedbackSubmission(db, {token, tokenUserId: 'client', formType: 'initial'});
    const second = await recordFeedbackSubmission(db, {token, tokenUserId: 'client', formType: 'initial'});

    expect(first.status).toBe('recorded');
    expect(second.status).toBe('duplicate');
  });

  it('refuses a second first-time submission even with a fresh token', async () => {
    const {db} = memoryDatabase();
    await seedUser(db, 'client', 20);

    await submit(db, 'client', 'initial', new Date(Date.now() - DAY));
    const replay = await submit(db, 'client', 'initial', new Date());

    expect(replay).toMatchObject({status: 'ignored', reason: 'already_completed_initial'});
  });

  it('refuses a recurring submission inside the cooldown but accepts it after', async () => {
    const {db} = memoryDatabase();
    await seedUser(db, 'client', 40);
    await submit(db, 'client', 'initial', new Date(Date.now() - 35 * DAY));
    const first = new Date(Date.now() - DAY);
    await submit(db, 'client', 'recurring', first);

    expect(await submit(db, 'client', 'recurring', new Date())).toMatchObject({status: 'ignored', reason: 'within_cooldown'});

    const later = new Date(first.getTime() + FEEDBACK_COOLDOWN_MS + 60_000);
    expect(await submit(db, 'client', 'recurring', later, later)).toMatchObject({status: 'recorded'});
  });

  it('records one submission when the same response arrives concurrently', async () => {
    const {db} = memoryDatabase();
    await seedUser(db, 'client', 20);

    const token = createFeedbackToken('client', 'initial');
    const results = await Promise.all(
      Array.from({length: 5}, () => recordFeedbackSubmission(db, {token, tokenUserId: 'client', formType: 'initial'}))
    );

    expect(results.filter((r) => r.status === 'recorded')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'duplicate')).toHaveLength(4);
  });

  it('keeps eligibility unchanged when a form is opened but never submitted', async () => {
    const {db} = memoryDatabase();
    await seedUser(db, 'client', 20);

    const before = await resolveFeedbackEligibility(db, 'client');
    // Opening the form issues a token but records nothing.
    expect(before.formToken).toBeTruthy();
    const after = await resolveFeedbackEligibility(db, 'client');

    expect(after.status).toBe('eligible_initial');
    expect(after.status).toBe(before.status);
  });
});
