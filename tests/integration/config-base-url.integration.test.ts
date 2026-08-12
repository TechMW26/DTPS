import { ensureDatabaseConnection } from '../utils/database';

describe('canonical application URLs', () => {
  const originalVercelUrl = process.env.VERCEL_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    await ensureDatabaseConnection();
  });

  afterAll(() => {
    process.env.VERCEL_URL = originalVercelUrl;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalNodeEnv,
      configurable: true,
    });
  });

  it('uses dtps.tech for production Vercel links', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true,
    });
    process.env.VERCEL_URL = 'dtps-random-preview.vercel.app';
    const { getBaseUrl } = await import('@/lib/config');

    expect(getBaseUrl()).toBe('https://dtps.tech');
  });
});
