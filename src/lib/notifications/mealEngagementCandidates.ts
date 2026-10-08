import type { Firestore } from 'firebase-admin/firestore';
import { nativeDatabaseSettings } from '@/lib/db/firestore-native';
import { redisNamespace, redisOperation } from '@/lib/cache/redis';

export interface MealEngagementCandidates {
  generatedAt: number;
  expiresAt: number;
  planIds: string[];
  plans: number;
}

export interface MealEngagementCandidateCache {
  get(): Promise<MealEngagementCandidates | null>;
  set(value: MealEngagementCandidates): Promise<void>;
}

// Only plan IDs are cached, never a delivery decision or personal/medical data.
// Production instances share discovery through Redis; warm instances still benefit
// when Redis is unavailable. Expiry is checked by the caller against its run time.
const local = new WeakMap<Firestore, MealEngagementCandidates>();
export function mealEngagementCandidateCache(db: Firestore): MealEngagementCandidateCache {
  const { projectId, databaseId } = nativeDatabaseSettings();
  const key = `${redisNamespace()}:meal-candidates:v1:${projectId}:${databaseId}`;
  return {
    async get() {
      const memory = local.get(db);
      if (memory && memory.expiresAt > Date.now()) return memory;
      const raw = await redisOperation(client => client.get(key));
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as MealEngagementCandidates;
        if (!Array.isArray(parsed.planIds) || !parsed.planIds.every(id => typeof id === 'string')
          || !Number.isFinite(parsed.generatedAt) || !Number.isFinite(parsed.expiresAt)
          || !Number.isFinite(parsed.plans)) return null;
        local.set(db, parsed);
        return parsed;
      } catch { return null; }
    },
    async set(value) {
      local.set(db, value);
      const seconds = Math.max(1, Math.ceil((value.expiresAt - Date.now()) / 1000));
      await redisOperation(client => client.set(key, JSON.stringify(value), 'EX', seconds));
    },
  };
}

/** Reserve one minute for cron jitter inside the existing duplicate-safe lookback. */
export function candidateCacheDuration(lookbackMinutes: number): number {
  return Math.max(0, Math.min(2, lookbackMinutes - 2)) * 60_000;
}

export function reusableCandidates(value: MealEngagementCandidates | null, now: Date, duration: number): value is MealEngagementCandidates {
  return Boolean(duration > 0 && value && value.generatedAt <= now.getTime()
    && value.expiresAt > now.getTime() && value.expiresAt - value.generatedAt <= duration);
}
