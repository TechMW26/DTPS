"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { socketClient } from "@/lib/realtime/socket-client";
import { SOCKET_EVENTS } from "@/lib/realtime/socket-events";
import {
  shouldApplySystemRefresh,
  SYSTEM_REFRESH_BROWSER_EVENT,
  SYSTEM_REFRESH_STORAGE_KEY,
  type SystemRefreshPayload,
} from "@/lib/system-refresh";

const FALLBACK_CHECK_INTERVAL_MS = 2 * 60 * 1_000;

async function wait(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function verifySessionWithoutLoggingOut(): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("/api/auth/session", {
        cache: "no-store",
        credentials: "include",
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      if (response.status === 401) return false;
      if (response.ok) {
        const session = await response.json();
        if (session?.user?.id) return true;
      }
    } catch {
      // A second bounded attempt handles a short network transition. The
      // existing page remains untouched if verification still fails.
    }

    if (attempt === 0) await wait(600);
  }

  return false;
}

export async function clearDtpsApplicationCaches(): Promise<void> {
  if ("caches" in window) {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith("dtps-"))
        .map((name) => caches.delete(name)),
    );
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.controller?.postMessage({
      type: "CLEAR_ALL_CACHES",
    });
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update().catch(() => undefined);
  }
}

export default function SystemRefreshListener() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const applyingRef = useRef(false);
  const lastCheckAtRef = useRef(0);
  const reloadTimerRef = useRef<number | null>(null);

  const applyRefresh = useCallback(
    async (payload: SystemRefreshPayload) => {
      if (
        status !== "authenticated" ||
        !session?.user?.id ||
        applyingRef.current ||
        !shouldApplySystemRefresh(
          payload?.revision,
          localStorage.getItem(SYSTEM_REFRESH_STORAGE_KEY),
        )
      ) {
        return;
      }

      applyingRef.current = true;
      const notBefore = Date.parse(payload.notBefore || "");
      if (Number.isFinite(notBefore)) {
        await wait(Math.min(Math.max(0, notBefore - Date.now()), 5_000));
      }

      // Verify the cookie-backed session before touching caches or reloading.
      // On any transient failure, leave the working screen and auth state alone.
      const sessionVerified = await verifySessionWithoutLoggingOut();
      if (!sessionVerified) {
        applyingRef.current = false;
        toast.error(
          "The system refresh was postponed because your session could not be verified. Your current screen remains available.",
        );
        return;
      }

      try {
        await clearDtpsApplicationCaches();
        localStorage.setItem(
          SYSTEM_REFRESH_STORAGE_KEY,
          String(payload.revision),
        );
        window.dispatchEvent(
          new CustomEvent("dtps:system-refresh", { detail: payload }),
        );
        router.refresh();
        toast.info("The application was refreshed. You will remain signed in.");
        reloadTimerRef.current = window.setTimeout(() => {
          window.location.reload();
        }, 350);
      } catch {
        applyingRef.current = false;
        toast.error(
          "The refresh could not be completed. Your session and current screen were preserved.",
        );
      }
    },
    [router, session?.user?.id, status],
  );

  const checkForRefresh = useCallback(async () => {
    if (status !== "authenticated" || !session?.user?.id) return;

    try {
      const response = await fetch("/api/admin/system-refresh", {
        cache: "no-store",
        credentials: "include",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!response.ok) return;
      const payload = (await response.json()) as SystemRefreshPayload;
      await applyRefresh(payload);
    } catch {
      // Realtime, focus, online, and interval checks will try again later.
    }
  }, [applyRefresh, session?.user?.id, status]);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return;

    const unsubscribe = socketClient.on(
      SOCKET_EVENTS.SYSTEM_REFRESH,
      (data) => void applyRefresh(data as SystemRefreshPayload),
    );
    const handleBrowserRefresh = (event: Event) => {
      void applyRefresh((event as CustomEvent<SystemRefreshPayload>).detail);
    };
    const checkWhenActive = () => {
      const now = Date.now();
      if (
        document.visibilityState === "visible" &&
        now - lastCheckAtRef.current > 30_000
      ) {
        lastCheckAtRef.current = now;
        void checkForRefresh();
      }
    };

    lastCheckAtRef.current = Date.now();
    void checkForRefresh();
    window.addEventListener("focus", checkWhenActive);
    window.addEventListener("online", checkWhenActive);
    window.addEventListener("pageshow", checkWhenActive);
    window.addEventListener(SYSTEM_REFRESH_BROWSER_EVENT, handleBrowserRefresh);
    document.addEventListener("visibilitychange", checkWhenActive);
    const intervalId = window.setInterval(
      checkForRefresh,
      FALLBACK_CHECK_INTERVAL_MS,
    );

    return () => {
      unsubscribe();
      window.removeEventListener("focus", checkWhenActive);
      window.removeEventListener("online", checkWhenActive);
      window.removeEventListener("pageshow", checkWhenActive);
      window.removeEventListener(
        SYSTEM_REFRESH_BROWSER_EVENT,
        handleBrowserRefresh,
      );
      document.removeEventListener("visibilitychange", checkWhenActive);
      window.clearInterval(intervalId);
      if (reloadTimerRef.current) {
        window.clearTimeout(reloadTimerRef.current);
      }
    };
  }, [applyRefresh, checkForRefresh, session?.user?.id, status]);

  return null;
}
