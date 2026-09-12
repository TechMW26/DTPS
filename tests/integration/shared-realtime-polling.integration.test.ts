import { SharedRealtimePolling, claimCallNotification } from '@/lib/realtime/shared-polling';
jest.mock('@/lib/realtime/socket-client', () => ({ socketClient: { connected: false } }));

describe('shared browser realtime polling', () => {
  let poller: SharedRealtimePolling;
  let fetchMock: jest.Mock;
  let cleanups: Array<() => void>;
  let original: Record<string, PropertyDescriptor | undefined>;
  beforeEach(() => {
    original = Object.fromEntries(['window', 'document', 'navigator', 'fetch'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
    Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(new EventTarget(), { location: { pathname: '/dashboard' } }) });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: Object.assign(new EventTarget(), { visibilityState: 'visible' }) });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
    fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ signals: [] }) }));
    Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: fetchMock });
    jest.useFakeTimers();
    poller = new SharedRealtimePolling();
    cleanups = [];
  });
  afterEach(() => {
    cleanups.forEach(fn => fn());
    jest.useRealTimers();
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });

  it('uses 13 signal reads and two heartbeats per minute for five mounted consumers', async () => {
    for (let i = 0; i < 5; i++) cleanups.push(poller.subscribe(jest.fn()));
    await jest.advanceTimersByTimeAsync(60_000);
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/webrtc/signal')).toHaveLength(13);
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/realtime/status')).toHaveLength(2);
  });

  it('delivers a signal to every consumer and accelerates active call negotiation', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ signals: [{ type: 'incoming_call', data: { callId: 'shared-test' } }] }) });
    const one = jest.fn(), two = jest.fn();
    cleanups.push(poller.subscribe(one), poller.subscribe(two));
    await jest.advanceTimersByTimeAsync(0);
    expect(one).toHaveBeenCalledTimes(1);
    expect(two).toHaveBeenCalledTimes(1);
    expect(claimCallNotification('unique-shared-test')).toBe(true);
    expect(claimCallNotification('unique-shared-test')).toBe(false);
    await jest.advanceTimersByTimeAsync(1_250);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('pauses hidden tabs, resumes on visibility, and stops after the last subscriber leaves', async () => {
    const unsubscribe = poller.subscribe(jest.fn()); cleanups.push(unsubscribe);
    await jest.advanceTimersByTimeAsync(0);
    Object.assign(document, { visibilityState: 'hidden' });
    await jest.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    Object.assign(document, { visibilityState: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await jest.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    unsubscribe();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not overlap requests on focus and aborts on unmount', async () => {
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))));
    const unsubscribe = poller.subscribe(jest.fn()); cleanups.push(unsubscribe);
    window.dispatchEvent(new Event('focus'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
