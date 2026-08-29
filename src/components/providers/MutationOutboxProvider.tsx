"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import {
  flushMutationOutbox,
  mutationOutboxEventName,
} from "@/lib/api/mutation-outbox";

interface MutationOutboxEventDetail {
  phase?: "pending" | "synced";
}

export default function MutationOutboxProvider() {
  useEffect(() => {
    const flush = () => {
      if (navigator.onLine === false) return;
      void flushMutationOutbox();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") flush();
    };
    const handleOutboxEvent = (event: Event) => {
      const detail = (event as CustomEvent<MutationOutboxEventDetail>).detail;
      if (detail?.phase === "pending") {
        toast.warning(
          "Connection interrupted. Your change is saved on this device and will sync automatically.",
          { id: "mutation-outbox-pending" },
        );
      } else if (detail?.phase === "synced") {
        toast.success("Pending changes synced successfully.", {
          id: "mutation-outbox-synced",
        });
      }
    };

    const intervalId = window.setInterval(flush, 20_000);
    window.addEventListener("online", flush);
    window.addEventListener("focus", flush);
    window.addEventListener(mutationOutboxEventName, handleOutboxEvent);
    document.addEventListener("visibilitychange", handleVisibility);
    flush();

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("online", flush);
      window.removeEventListener("focus", flush);
      window.removeEventListener(mutationOutboxEventName, handleOutboxEvent);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return null;
}
