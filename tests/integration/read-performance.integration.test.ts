import { coalesceRead } from '@/lib/api/coalesce-read';
import { getUserDirectorySummary } from '@/lib/services/user-directory-summary';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { createUser, ensureDatabaseConnection } from '../utils/database';

it('coalesces fifty overlapping reads but does not cache the completed result', async () => {
  let finish!: (value: number) => void;
  const fetcher = jest.fn(() => new Promise<number>(resolve => { finish = resolve; }));
  const reads = Array.from({ length: 50 }, () => coalesceRead('burst', fetcher));
  await Promise.resolve();
  expect(fetcher).toHaveBeenCalledTimes(1);
  finish(42);
  expect(await Promise.all(reads)).toEqual(Array(50).fill(42));
  expect(await coalesceRead('burst', async () => 43)).toBe(43);
});

it('isolates keys and clears failed reads so a retry can succeed', async () => {
  const results = await Promise.all([
    coalesceRead('scope-a', async () => 'a'), coalesceRead('scope-b', async () => 'b'),
  ]);
  expect(results).toEqual(['a', 'b']);
  await expect(coalesceRead('failure', () => { throw new Error('offline'); })).rejects.toThrow('offline');
  expect(await coalesceRead('failure', async () => 'online')).toBe('online');
});

it('computes directory counts and numeric latest client ID in one query and sees subsequent changes', async () => {
  await ensureDatabaseConnection();
  await createUser({ role: UserRole.ADMIN });
  await createUser({ role: UserRole.DIETITIAN });
  await createUser({ role: UserRole.HEALTH_COUNSELOR });
  const first = await createUser({ role: UserRole.CLIENT });
  const second = await createUser({ role: UserRole.CLIENT });
  await User.updateOne({ _id: first._id }, { $set: { clientId: 'C-99' } });
  await User.updateOne({ _id: second._id }, { $set: { clientId: 'C-1000' } });
  const aggregate = jest.spyOn(User, 'aggregate');
  const summaries = await Promise.all(Array.from({ length: 20 }, getUserDirectorySummary));
  expect(aggregate).toHaveBeenCalledTimes(1);
  expect(summaries[0]).toEqual({ adminsCount: 1, dietitiansCount: 1, healthCounselorsCount: 1,
    clientsCount: 2, latestClientIdNumber: 1000 });
  await User.updateOne({ _id: second._id }, { $set: { clientId: 'C-1001' } });
  expect((await getUserDirectorySummary()).latestClientIdNumber).toBe(1001);
  expect(aggregate).toHaveBeenCalledTimes(2);
});
