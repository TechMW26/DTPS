"use client";

import { usePathname } from "next/navigation";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

export type ClientScreen =
  | "home"
  | "plan"
  | "tracker"
  | "progress"
  | "messages"
  | "grid"
  | "detail"
  | "form"
  | "profile"
  | "list";

export function clientScreenForPath(pathname: string): {
  screen: ClientScreen;
  label: string;
} {
  const segment = pathname.split("/")[2] || "";
  const detail = pathname.split("/").filter(Boolean).length > 2;
  if (!segment || segment === "dashboard")
    return { screen: "home", label: "your day" };
  if (["hydration", "sleep", "steps", "activity", "watch"].includes(segment))
    return {
      screen: "tracker",
      label: segment === "hydration" ? "water tracker" : `${segment} tracker`,
    };
  if (segment === "progress" || segment === "weight-tracker")
    return { screen: "progress", label: "your progress" };
  if (segment === "messages") return { screen: "messages", label: "messages" };
  if (segment === "plan") return { screen: "plan", label: "meal plan" };
  if (["recipes", "blogs", "services", "subscriptions"].includes(segment))
    return { screen: detail ? "detail" : "grid", label: segment };
  if (segment === "profile")
    return { screen: "profile", label: "your profile" };
  if (
    segment.endsWith("-info") ||
    [
      "dietary-recall",
      "onboarding",
      "reset-password",
      "forget-password",
    ].includes(segment) ||
    (detail && ["appointments", "settings"].includes(segment))
  )
    return {
      screen: "form",
      label:
        segment === "appointments" ? "appointment booking" : "your details",
    };
  return { screen: "list", label: segment.replaceAll("-", " ") };
}

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 ${className}`}
    >
      {children}
    </div>
  );
}

export function ConversationSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading conversation"
      className="space-y-5 p-4"
    >
      <span className="sr-only">Loading conversation</span>
      <div aria-hidden="true" className="space-y-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton
            key={i}
            className={`h-16 w-3/4 max-w-sm rounded-2xl ${i % 2 ? "ml-auto" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}

export function TimeSlotsSkeleton() {
  return (
    <div role="status" aria-label="Loading available times">
      <span className="sr-only">Loading available times</span>
      <div aria-hidden="true" className="grid grid-cols-3 gap-2 py-3">
        {Array.from({ length: 9 }, (_, i) => (
          <Skeleton key={i} className="h-11 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function ClientScreenSkeleton({
  screen,
  label,
  standalone = false,
}: {
  screen?: ClientScreen;
  label?: string;
  standalone?: boolean;
}) {
  const route = clientScreenForPath(usePathname() || "/user");
  const kind = screen || route.screen;
  const loadingLabel = `Loading ${label || route.label}`;
  return (
    <div
      role="status"
      aria-label={loadingLabel}
      data-client-skeleton={kind}
      className={`client-screen-skeleton w-full bg-gray-50 dark:bg-gray-950 ${standalone ? "min-h-dvh" : "min-h-[calc(100dvh-var(--client-bottom-nav-clearance))]"}`}
    >
      <span className="sr-only">{loadingLabel}</span>
      <div aria-hidden="true">
        {(kind !== "home" || standalone) && (
          <div className="flex h-16 items-center justify-between border-b border-gray-100 bg-white px-4 dark:border-gray-800 dark:bg-gray-900">
            <Skeleton className="h-11 w-11 rounded-xl" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-11 w-11 rounded-xl" />
          </div>
        )}
        <div className="mx-auto max-w-5xl space-y-5 p-4 pb-8 sm:p-6">
          {kind === "home" && (
            <>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-48 rounded-2xl" />
              <div className="grid grid-cols-2 gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <Panel key={i}>
                    <Skeleton className="h-9 w-9 rounded-xl" />
                    <Skeleton className="my-3 h-7 w-20" />
                    <SkeletonText />
                  </Panel>
                ))}
              </div>
            </>
          )}
          {(kind === "plan" || kind === "tracker" || kind === "progress") && (
            <>
              <div className="flex justify-between gap-2">
                {Array.from({ length: 7 }, (_, i) => (
                  <Skeleton
                    key={i}
                    className="h-16 min-w-0 flex-1 rounded-xl"
                  />
                ))}
              </div>
              <Panel className="flex min-h-56 flex-col items-center justify-center gap-5">
                {kind === "tracker" ? (
                  <Skeleton className="h-40 w-40 rounded-full" />
                ) : (
                  <Skeleton className="h-32 w-full rounded-xl" />
                )}
                <Skeleton className="h-5 w-32" />
              </Panel>
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-20 rounded-2xl" />
                <Skeleton className="h-20 rounded-2xl" />
              </div>
            </>
          )}
          {kind === "grid" && (
            <>
              <Skeleton className="h-12 rounded-xl" />
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <Panel key={i} className="overflow-hidden !p-0">
                    <Skeleton className="h-48 rounded-none" />
                    <div className="space-y-3 p-3">
                      <Skeleton className="h-5 w-4/5" />
                      <SkeletonText />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </Panel>
                ))}
              </div>
            </>
          )}
          {kind === "detail" && (
            <>
              <Skeleton className="aspect-video max-h-80 rounded-2xl" />
              <Skeleton className="h-8 w-3/4" />
              <div className="flex gap-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 flex-1 rounded-xl" />
                ))}
              </div>
              <Panel>
                <SkeletonText lines={6} />
              </Panel>
            </>
          )}
          {kind === "profile" && (
            <>
              <Panel className="flex flex-col items-center gap-3">
                <Skeleton className="h-24 w-24 rounded-full" />
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-48" />
              </Panel>
              <Panel>
                <SkeletonText lines={4} />
              </Panel>
            </>
          )}
          {kind === "form" && (
            <Panel>
              <Skeleton className="mb-5 h-6 w-48" />
              <div className="space-y-5">
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-12 rounded-xl" />
                  </div>
                ))}
                <Skeleton className="mt-6 h-12 rounded-xl" />
              </div>
            </Panel>
          )}
          {kind === "messages" && (
            <>
              <Skeleton className="h-12 rounded-xl" />
              {Array.from({ length: 5 }, (_, i) => (
                <Panel key={i} className="flex items-center gap-3">
                  <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-4/5" />
                  </div>
                  <Skeleton className="h-3 w-8" />
                </Panel>
              ))}
            </>
          )}
          {["list", "plan", "tracker", "progress", "profile"].includes(
            kind,
          ) && (
            <div className="space-y-3">
              {Array.from({ length: kind === "list" ? 5 : 3 }, (_, i) => (
                <Panel key={i} className="flex min-h-24 items-center gap-3">
                  <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1 space-y-3">
                    <Skeleton className="h-4 w-3/5" />
                    <SkeletonText lines={1} />
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
