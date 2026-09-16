import { createMealPlanLoader } from '@/lib/meal-plan-loader';

it('shares overlapping reads, expires positive entries, and retries unpublished dates', async () => {
  jest.useFakeTimers();
  try {
    const cache = new Map();
    const fetcher = jest.fn().mockResolvedValue({ hasPlan: true });
    const load = createMealPlanLoader(cache, fetcher);
    await Promise.all([load('today'), load('today'), load('today')]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await load('today');
    expect(fetcher).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(30_001);
    await load('today');
    expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockResolvedValueOnce({ hasPlan: false });
    await load('tomorrow');
    await load('tomorrow');
    expect(fetcher).toHaveBeenCalledTimes(4);
  } finally { jest.useRealTimers(); }
});
