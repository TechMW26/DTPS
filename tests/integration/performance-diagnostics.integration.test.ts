import { GET } from '@/app/api/admin/performance/route';
import { invokeRoute } from '../utils/routes';
import { measureApi } from '@/lib/api/performance';

it('restricts cache diagnostics to authenticated administrators', async () => {
  const url = 'http://localhost/api/admin/performance';
  expect((await invokeRoute(GET, { method: 'GET', url, user: null })).status).toBe(401);
  expect((await invokeRoute(GET, { method: 'GET', url, user: { id: 'test', role: 'dietitian' } })).status).toBe(403);
  const result = await invokeRoute(GET, { method: 'GET', url, user: { id: 'test', role: 'admin' } });
  expect(result.status).toBe(200);
  expect(result.json.redis.configured).toBe(false);
  expect(result.response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(JSON.stringify(result.json)).not.toContain('REDIS_URL');
});

it('adds timing without changing status or body', async () => {
  const handler = measureApi('/api/example', async () => new Response('unchanged', { status: 201 }));
  const result = await handler();
  expect(result.status).toBe(201);
  expect(await result.text()).toBe('unchanged');
  expect(result.headers.get('Server-Timing')).toMatch(/app;dur=\d+/);
});
