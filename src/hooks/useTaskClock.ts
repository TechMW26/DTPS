'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Ticks while open and resyncs on return, so scheduled actions unlock without a reload. */
export function useTaskClock() {
  const anchor = useRef<{ server: number; elapsed: number } | null>(null);
  const readNow = useCallback(() => anchor.current
    ? anchor.current.server + performance.now() - anchor.current.elapsed
    : Date.now(), []);
  const [now, setNow] = useState(() => Date.now());
  const syncClock = useCallback((serverNow: string | undefined) => {
    if (!serverNow || !Number.isFinite(Date.parse(serverNow))) return;
    anchor.current = { server: Date.parse(serverNow), elapsed: performance.now() };
    setNow(readNow());
  }, [readNow]);
  useEffect(() => {
    const tick = () => setNow(readNow());
    const timer = setInterval(tick, 1000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [readNow]);
  return { now, readNow, syncClock };
}
