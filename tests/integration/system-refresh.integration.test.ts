/// <reference types="jest" />

import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { GET, POST } from "@/app/api/admin/system-refresh/route";
import SystemRefreshState from "@/lib/db/models/SystemRefreshState";
import { SOCKET_EVENTS } from "@/lib/realtime/socket-events";
import { socketManager } from "@/lib/realtime/socket-manager";
import {
  shouldApplySystemRefresh,
  SYSTEM_REFRESH_STORAGE_KEY,
} from "@/lib/system-refresh";
import { UserRole } from "@/types";
import { createUser, ensureDatabaseConnection } from "../utils/database";
import { invokeRoute } from "../utils/routes";

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

describe("admin system refresh", () => {
  beforeEach(async () => {
    await ensureDatabaseConnection();
  });

  it("persists a revision that every authenticated role can discover", async () => {
    const admin = await createUser({ role: UserRole.ADMIN });
    const client = await createUser({ role: UserRole.CLIENT });
    const broadcastSpy = jest.spyOn(socketManager, "broadcast");

    const requested = await invokeRoute(POST, {
      method: "POST",
      url: "http://localhost/api/admin/system-refresh",
      user: admin,
      body: { reason: "Integration refresh" },
    });

    expect(requested.status).toBe(200);
    expect(requested.json).toMatchObject({
      success: true,
      revision: 1,
      reason: "Integration refresh",
      authenticationPreserved: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(broadcastSpy).toHaveBeenCalledWith(
      SOCKET_EVENTS.SYSTEM_REFRESH,
      expect.objectContaining({ revision: 1 }),
    );

    const discovered = await invokeRoute(GET, {
      method: "GET",
      url: "http://localhost/api/admin/system-refresh",
      user: client,
    });

    expect(discovered.status).toBe(200);
    expect(discovered.json).toMatchObject({
      revision: 1,
      reason: "Integration refresh",
    });
    expect(await SystemRefreshState.countDocuments({ key: "global" })).toBe(1);
  });

  it("does not allow a non-admin to trigger a system-wide refresh", async () => {
    const dietitian = await createUser({ role: UserRole.DIETITIAN });

    const result = await invokeRoute(POST, {
      method: "POST",
      url: "http://localhost/api/admin/system-refresh",
      user: dietitian,
      body: {},
    });

    expect(result.status).toBe(403);
    expect(await SystemRefreshState.countDocuments()).toBe(0);
  });

  it("prevents accidental repeated refresh broadcasts", async () => {
    const admin = await createUser({ role: UserRole.ADMIN });
    const request = {
      method: "POST" as const,
      url: "http://localhost/api/admin/system-refresh",
      user: admin,
      body: {},
    };

    expect((await invokeRoute(POST, request)).status).toBe(200);
    expect((await invokeRoute(POST, request)).status).toBe(429);
    const state = await SystemRefreshState.findOne({ key: "global" }).lean();
    expect(state?.revision).toBe(1);
  });

  it("only applies a refresh revision once per browser", () => {
    expect(SYSTEM_REFRESH_STORAGE_KEY).toContain("system-refresh-revision");
    expect(shouldApplySystemRefresh(4, "3")).toBe(true);
    expect(shouldApplySystemRefresh(4, "4")).toBe(false);
    expect(shouldApplySystemRefresh(3, "4")).toBe(false);
    expect(shouldApplySystemRefresh("invalid", null)).toBe(false);
  });

  it("preserves authentication storage and verifies the session before reload", () => {
    const projectRoot = path.resolve(__dirname, "../..");
    const listener = fs.readFileSync(
      path.join(
        projectRoot,
        "src/components/providers/SystemRefreshListener.tsx",
      ),
      "utf8",
    );
    const providers = fs.readFileSync(
      path.join(projectRoot, "src/components/providers/Providers.tsx"),
      "utf8",
    );
    const dashboard = fs.readFileSync(
      path.join(projectRoot, "src/app/dashboard/admin/page.tsx"),
      "utf8",
    );

    expect(listener).not.toContain("localStorage.clear");
    expect(listener).not.toContain("sessionStorage.clear");
    expect(listener.indexOf("const sessionVerified"))
      .toBeLessThan(listener.indexOf("await clearDtpsApplicationCaches"));
    expect(listener).toContain("window.location.reload()");
    expect(providers).toContain("<SystemRefreshListener />");
    expect(dashboard).toContain("Clear cache & refresh all");
    expect(dashboard).toContain("Authentication cookies, saved sessions, drafts");
  });
});
