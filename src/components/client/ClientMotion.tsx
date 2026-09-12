"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

const RouteMotionContext = createContext(false);

/** Animate one persistent surface; never remount forms or transform fixed dialogs. */
export function ClientRouteSurface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  useRouteFade(ref, pathname);
  return (
    <RouteMotionContext.Provider value>
      <div ref={ref} className={className} data-client-route>
        {children}
      </div>
    </RouteMotionContext.Provider>
  );
}

export function useRouteMotionOwner() {
  return useContext(RouteMotionContext);
}

export function useRouteFade(
  ref: React.RefObject<HTMLDivElement | null>,
  route: string,
  enabled = true,
) {
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element?.animate) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;
    const animation = element.animate([{ opacity: 0.35 }, { opacity: 1 }], {
      duration: 220,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
    });
    const stop = () => animation.cancel();
    preference.addEventListener?.("change", stop);
    return () => {
      stop();
      preference.removeEventListener?.("change", stop);
    };
  }, [ref, route, enabled]);
}

/** Scope shared interaction styles to clients, including dialogs rendered in portals. */
export function ClientExperience({ children }: { children: ReactNode }) {
  useEffect(() => {
    const previous = document.body.dataset.clientApp;
    document.body.dataset.clientApp = "true";
    return () => {
      if (previous === undefined) delete document.body.dataset.clientApp;
      else document.body.dataset.clientApp = previous;
    };
  }, []);
  return <div className="client-experience min-w-0">{children}</div>;
}
