import {coalesceRead} from '@/lib/api/coalesce-read';
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
