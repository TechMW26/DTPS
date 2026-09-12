"use client";

import { useCallback, useEffect, useRef, type MutableRefObject } from "react";

/** Retarget progress without overlapping frames; reduced motion gets the final value. */
export function useAnimatedProgress(
  setValue: (value: number) => void,
  setAnimating: (value: boolean) => void,
  animating: MutableRefObject<boolean>,
) {
  const frame = useRef<number | null>(null);
  const cancel = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);
  return useCallback(
    (from: number, to: number, goal: number) => {
      cancel();
      const percent = (value: number) =>
        goal > 0 ? Math.max(0, Math.min((value / goal) * 100, 100)) : 0;
      const target = percent(to);
      const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (preference.matches || from === to) {
        setValue(target);
        setAnimating(false);
        animating.current = false;
        return;
      }
      const start = percent(from);
      const startedAt = performance.now();
      animating.current = true;
      setAnimating(true);
      const tick = (now: number) => {
        const progress = preference.matches
          ? 1
          : Math.min((now - startedAt) / 420, 1);
        setValue(start + (target - start) * (1 - Math.pow(1 - progress, 3)));
        if (progress < 1) frame.current = requestAnimationFrame(tick);
        else {
          frame.current = null;
          setAnimating(false);
          animating.current = false;
        }
      };
      frame.current = requestAnimationFrame(tick);
    },
    [animating, cancel, setAnimating, setValue],
  );
}
