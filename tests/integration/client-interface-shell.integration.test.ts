import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(__dirname, "../..");

function sourceFilesBelow(relativeDirectory: string): string[] {
  const directory = path.join(projectRoot, relativeDirectory);

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFilesBelow(path.relative(projectRoot, entryPath));
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [entryPath] : [];
  });
}

describe("client interface shell", () => {
  it("keeps one canonical dashboard instead of mounting a duplicate shell", () => {
    const legacyDashboard = fs.readFileSync(
      path.join(projectRoot, "src/app/user/dashboard/page.tsx"),
      "utf8",
    );

    expect(legacyDashboard).toContain("redirect('/user')");
    expect(legacyDashboard).not.toContain("ResponsiveLayout");
    expect(legacyDashboard).not.toContain("dashboard-stats");
  });

  it("does not mount route-level copies of the persistent bottom navigation", () => {
    const routeFiles = sourceFilesBelow("src/app/user").filter((file) =>
      file.endsWith("page.tsx"),
    );

    for (const file of routeFiles) {
      const source = fs.readFileSync(file, "utf8");
      expect(source).not.toMatch(/import\s+BottomNavBar\s+from/);
    }
  });

  it("uses library icons instead of visible emoji glyphs in the client UI", () => {
    const uiDirectories = [
      "src/app/user",
      "src/app/client-auth",
      "src/components/client",
      "src/components/engagement",
      "src/components/notifications",
      "src/components/chat",
      "src/components/weight-tracker",
      "src/watchconnectivity/frontend",
    ];
    const emojiGlyph = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

    for (const file of uiDirectories.flatMap(sourceFilesBelow)) {
      expect(fs.readFileSync(file, "utf8")).not.toMatch(emojiGlyph);
    }
  });

  it("keeps the success stories carousel inside the client page gutter", () => {
    const transformationSwiper = fs.readFileSync(
      path.join(projectRoot, "src/components/client/TransformationSwiper.tsx"),
      "utf8",
    );

    expect(transformationSwiper).not.toContain("-mx-4 px-4");
    expect(transformationSwiper).not.toContain("100vw-32px");
    expect(transformationSwiper).toContain("w-[calc(100%_-_1rem)]");
    expect(transformationSwiper).toContain("data-transformation-card");
  });

  it("keeps the full-screen recipe dialog above the persistent client navigation", () => {
    const mealPlanPage = fs.readFileSync(
      path.join(projectRoot, "src/app/user/plan/page.tsx"),
      "utf8",
    );
    const globalStyles = fs.readFileSync(
      path.join(projectRoot, "src/app/globals.css"),
      "utf8",
    );

    expect(mealPlanPage).toContain("fixed inset-x-0 top-0");
    expect(mealPlanPage).toContain("client-popup-above-nav");
    expect(globalStyles).toContain("--client-bottom-nav-clearance");
    expect(globalStyles).toContain(
      "bottom: var(--client-bottom-nav-clearance) !important",
    );
    expect(mealPlanPage).toContain("flex h-full min-h-0 w-full flex-col");
    expect(mealPlanPage).not.toContain(
      "w-full max-w-lg mx-4 rounded-3xl shadow-2xl max-h-[90vh]",
    );
    expect(mealPlanPage).toContain('type="checkbox"');
    expect(mealPlanPage).toContain(
      "Reference-only checklist: selections intentionally reset when the dialog closes.",
    );
    expect(mealPlanPage).not.toContain(
      'className="rounded-xl overflow-hidden -mx-5 -mt-5"',
    );
    expect(mealPlanPage).toContain('ol className="list-none space-y-3 p-0"');
    expect(mealPlanPage).toContain("border-orange-100 bg-orange-50/70");
  });

  it("keeps actionable client popups clear of the persistent footer", () => {
    const popupFiles = [
      "src/app/user/activity/page.tsx",
      "src/app/user/appointments/page.tsx",
      "src/app/user/hydration/page.tsx",
      "src/app/user/medical-info/page.tsx",
      "src/app/user/plan/page.tsx",
      "src/app/user/progress/page.tsx",
      "src/app/user/sleep/page.tsx",
      "src/app/user/steps/page.tsx",
      "src/app/user/subscriptions/page.tsx",
      "src/components/chat/MessageReactions.tsx",
      "src/components/client/ServicePlansSwiper.tsx",
      "src/watchconnectivity/frontend/components/WatchManualEntryModal.tsx",
    ];

    for (const relativeFile of popupFiles) {
      expect(fs.readFileSync(path.join(projectRoot, relativeFile), "utf8")).toContain(
        "client-popup-above-nav",
      );
    }

    const mealPlanPage = fs.readFileSync(
      path.join(projectRoot, "src/app/user/plan/page.tsx"),
      "utf8",
    );
    expect(mealPlanPage).toContain("flex max-h-full w-full max-w-lg flex-col");
    expect(mealPlanPage).toContain(
      "min-h-0 flex-1 space-y-5 overflow-y-auto p-4",
    );
    expect(mealPlanPage).toContain("shrink-0 border-t p-4");

    const navigationFiles = [
      "src/components/client/BottomNavBar.tsx",
      "src/components/client/ClientBottomNav.tsx",
      "src/components/mobile/MobileBottomNav.tsx",
    ];

    for (const relativeFile of navigationFiles) {
      const navigationSource = fs.readFileSync(
        path.join(projectRoot, relativeFile),
        "utf8",
      );
      expect(navigationSource).toContain("z-40");
      expect(navigationSource).not.toMatch(/<nav[^>]+z-50|bottom-0[^\n]+z-50/);
    }
  });

  it("uses accessible route and popup motion with navigation progress feedback", () => {
    const globalStyles = fs.readFileSync(
      path.join(projectRoot, "src/app/globals.css"),
      "utf8",
    );
    const userLayout = fs.readFileSync(
      path.join(projectRoot, "src/app/user/UserLayoutClient.tsx"),
      "utf8",
    );
    const bottomNavigation = fs.readFileSync(
      path.join(projectRoot, "src/components/client/BottomNavBar.tsx"),
      "utf8",
    );

    expect(globalStyles).toContain(".client-route-transition");
    expect(globalStyles).toContain(".client-popup-panel");
    expect(globalStyles).toContain(".client-bottom-sheet-panel");
    expect(globalStyles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(userLayout).toContain("key={pathname}");
    expect(userLayout).toContain("client-route-transition");
    expect(bottomNavigation).toContain("useLinkStatus");
    expect(bottomNavigation).toContain("NavigationPendingHint");
  });

  it("coalesces dashboard refreshes and loads independent data in parallel", () => {
    const dashboard = fs.readFileSync(
      path.join(projectRoot, "src/app/user/page.tsx"),
      "utf8",
    );

    expect(dashboard).toContain("healthFetchInFlightRef");
    expect(dashboard).toContain("lastHealthFetchAtRef");
    expect(dashboard).toContain("Promise.all([");
    expect(dashboard).toContain("fetchHealthData(true)");
    expect(dashboard).not.toContain("fetch('/api/client/profile'");
  });

  it("coalesces identical in-flight API reads without nesting retry policies", () => {
    const interceptor = fs.readFileSync(
      path.join(
        projectRoot,
        "src/components/providers/GlobalFetchInterceptor.tsx",
      ),
      "utf8",
    );
    const resilientFetch = fs.readFileSync(
      path.join(projectRoot, "src/lib/api/resilient-fetch.ts"),
      "utf8",
    );

    expect(interceptor).toContain("pendingGetRequests");
    expect(interceptor).toContain("return (await pendingRequest).clone()");
    expect(interceptor).toContain("headers: requestHeaders");
    expect(interceptor).toContain("retryManaged ? 0 : retriesLeft");
    expect(resilientFetch).toContain(
      'headers.set("x-dtps-retry-managed", "1")',
    );
  });
});
