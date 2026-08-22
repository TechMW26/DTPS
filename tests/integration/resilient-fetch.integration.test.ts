import {
  diagnoseApiFailure,
  resilientFetch,
} from '@/lib/api/resilient-fetch';

describe('resilient API requests', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('recovers from transient gateway failures', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'busy' }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

    const recoveryStates: string[] = [];
    const response = await resilientFetch('/api/test', {}, {
      attempts: 3,
      baseDelayMs: 50,
      maxDelayMs: 50,
      onRecoveryState: (state) => recoveryStates.push(state.phase),
    });

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requestHeaders = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(requestHeaders.get('x-dtps-retry-managed')).toBe('1');
    expect(recoveryStates).toContain('retrying');
    expect(recoveryStates).toContain('recovered');
  });

  it('does not replay a create request without duplicate protection', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ error: 'busy' }), { status: 503 }));

    const response = await resilientFetch('/api/create', { method: 'POST', body: '{}' }, {
      attempts: 4,
      baseDelayMs: 50,
    });

    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('replays protected create requests with one stable idempotency key', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 504 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 201 }));

    const response = await resilientFetch('/api/create', { method: 'POST', body: '{}' }, {
      attempts: 3,
      baseDelayMs: 50,
      maxDelayMs: 50,
      idempotencyKey: 'operation-1234',
    });

    expect(response.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstHeaders = fetchMock.mock.calls[0][1]?.headers as Headers;
    const secondHeaders = fetchMock.mock.calls[1][1]?.headers as Headers;
    expect(firstHeaders.get('x-idempotency-key')).toBe('operation-1234');
    expect(secondHeaders.get('x-idempotency-key')).toBe('operation-1234');
    expect(firstHeaders.get('x-request-id')).toBe(secondHeaders.get('x-request-id'));
  });

  it('classifies permanent failures without treating them as transient', () => {
    expect(diagnoseApiFailure({ response: new Response(null, { status: 422 }) })).toMatchObject({
      code: 'validation',
      retryable: false,
    });
    expect(diagnoseApiFailure({ response: new Response(null, { status: 503 }) })).toMatchObject({
      code: 'service-unavailable',
      retryable: true,
    });
  });
});
