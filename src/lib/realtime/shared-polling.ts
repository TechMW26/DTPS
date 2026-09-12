'use client';

import { socketClient } from './socket-client';

type Signal = { type: string; data: Record<string, unknown> };
type Subscriber = (signal: Signal) => void;

/** One signaling poll and presence heartbeat per authenticated browser tab. */
export class SharedRealtimePolling {
  private subscribers = new Set<Subscriber>();
  private pollTimer?: ReturnType<typeof setTimeout>;
  private heartbeatTimer?: ReturnType<typeof setTimeout>;
  private controller?: AbortController;
  private heartbeatController?: AbortController;
  private running = false;
  private polling = false;
  private fastUntil = 0;
  private failures = 0;
  private generation = 0;

  get subscriberCount() { return this.subscribers.size; }

  subscribe(callback: Subscriber): () => void {
    this.subscribers.add(callback);
    if (!this.running) this.start();
    return () => {
      this.subscribers.delete(callback);
      if (!this.subscribers.size) this.stop();
    };
  }

  private visible = () => document.visibilityState !== 'hidden' && navigator.onLine !== false;

  private wake = () => {
    if (!this.running || !this.visible()) return;
    if (!this.polling) {
      clearTimeout(this.pollTimer);
      void this.poll();
    }
  };

  private start() {
    this.running = true;
    this.generation += 1;
    window.addEventListener('online', this.wake);
    window.addEventListener('focus', this.wake);
    document.addEventListener('visibilitychange', this.wake);
    void this.poll();
    this.heartbeatTimer = setTimeout(() => void this.heartbeat(), 30_000);
  }

  private stop() {
    this.running = false;
    this.generation += 1;
    this.polling = false;
    clearTimeout(this.pollTimer);
    clearTimeout(this.heartbeatTimer);
    this.controller?.abort();
    this.heartbeatController?.abort();
    window.removeEventListener('online', this.wake);
    window.removeEventListener('focus', this.wake);
    document.removeEventListener('visibilitychange', this.wake);
  }

  private delay() {
    if (this.failures) return Math.min(30_000, 5_000 * 2 ** Math.min(this.failures, 3));
    if (Date.now() < this.fastUntil || window.location.pathname.includes('/messages')) return 1_250;
    // Keep a delivery fallback even when the remote socket is connected.
    return socketClient.connected ? 15_000 : 5_000;
  }

  private async poll() {
    if (!this.running || this.polling || !this.visible()) return;
    const generation = this.generation;
    this.polling = true;
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch('/api/webrtc/signal', {
        credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      });
      if (!response.ok) throw new Error('Signal polling unavailable');
      const result = await response.json();
      if (!this.running || generation !== this.generation) return;
      this.failures = 0;
      for (const signal of Array.isArray(result?.signals) ? result.signals : []) {
        if (!signal?.type || !signal?.data) continue;
        this.fastUntil = Date.now() + 120_000;
        for (const subscriber of this.subscribers) {
          try { subscriber(signal); } catch { /* One view must not block other subscribers. */ }
        }
      }
    } catch {
      this.failures += 1;
    } finally {
      clearTimeout(timeout);
      if (generation === this.generation) {
        this.polling = false;
        if (this.running && this.visible()) {
          this.pollTimer = setTimeout(() => void this.poll(), this.delay());
        }
      }
    }
  }

  private async heartbeat() {
    if (!this.running) return;
    const generation = this.generation;
    const controller = new AbortController();
    this.heartbeatController = controller;
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      if (this.visible()) await fetch('/api/realtime/status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'heartbeat' }), signal: controller.signal,
      });
    } catch { /* Presence is best effort. */ } finally {
      clearTimeout(timeout);
      if (this.running && generation === this.generation) {
        this.heartbeatTimer = setTimeout(() => void this.heartbeat(), 30_000);
      }
    }
  }
}

const pollers = new Map<string, SharedRealtimePolling>();
export function subscribeRealtimePolling(userId: string, subscriber: Subscriber): () => void {
  let poller = pollers.get(userId);
  if (!poller) {
    poller = new SharedRealtimePolling();
    pollers.set(userId, poller);
  }
  const unsubscribe = poller.subscribe(subscriber);
  return () => {
    unsubscribe();
    if (!poller.subscriberCount && pollers.get(userId) === poller) pollers.delete(userId);
  };
}

const notifiedCalls = new Set<string>();
export function claimCallNotification(key: string): boolean {
  if (notifiedCalls.has(key)) return false;
  notifiedCalls.add(key);
  if (notifiedCalls.size > 200) notifiedCalls.delete(notifiedCalls.values().next().value!);
  return true;
}
