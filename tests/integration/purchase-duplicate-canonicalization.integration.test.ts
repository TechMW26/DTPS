/// <reference types="jest" />

import request from "supertest";
import { getServerSession } from "next-auth";
import UnifiedPayment from "@/lib/db/models/UnifiedPayment";
import ClientMealPlan from "@/lib/db/models/ClientMealPlan";
import { canonicalizePurchaseRecords } from "@/lib/payments/canonicalize-purchases";
import { UserRole } from "@/types";
import { entityId } from "../utils/assertions";
import {
  createAssignedDietitianClientPair,
  createUser,
  ensureDatabaseConnection,
} from "../utils/database";
import { createRouteTestServer } from "../utils/supertest-route";

describe("purchase duplicate canonicalization", () => {
  beforeEach(async () => {
    await ensureDatabaseConnection();
  });

  it("returns the authoritative used-day counter for duplicate imported purchases", async () => {
    const admin = await createUser({
      role: UserRole.ADMIN,
      email: "admin-purchase-canonicalization@example.com",
    });
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 102);

    const commonPurchase = {
      client: client._id,
      dietitian: dietitian._id,
      planName: "Weight Loss",
      planCategory: "weight-loss",
      durationDays: 90,
      durationLabel: "3 Months",
      baseAmount: 5000,
      finalAmount: 5000,
      amount: 5000,
      status: "paid",
      paymentStatus: "paid",
      startDate,
      endDate,
      expectedStartDate: startDate,
      expectedEndDate: endDate,
      paidAt: now,
    } as const;

    await UnifiedPayment.create({
      ...commonPurchase,
      mealPlanCreated: true,
      daysUsed: 13,
      remainingDays: 77,
    });
    await UnifiedPayment.create({
      ...commonPurchase,
      mealPlanCreated: false,
      daysUsed: 0,
      remainingDays: 90,
    });
    const authoritative = await UnifiedPayment.create({
      ...commonPurchase,
      mealPlanCreated: true,
      daysUsed: 37,
      remainingDays: 53,
    });

    (getServerSession as jest.Mock).mockResolvedValue({
      user: {
        id: entityId(admin),
        email: admin.email,
        role: admin.role,
        firstName: admin.firstName,
        lastName: admin.lastName,
      },
    });

    const route = await import("@/app/api/client-purchases/check/route");
    const server = createRouteTestServer(route.GET);

    try {
      const response = await request(server)
        .get("/api/client-purchases/check")
        .query({ clientId: entityId(client) });

      expect(response.status).toBe(200);
      expect(String(response.body.purchase?._id)).toBe(entityId(authoritative));
      expect(response.body.purchase?.daysUsed).toBe(37);
      expect(response.body.remainingDays).toBe(53);
      expect(response.body.allPurchasesNeedingMealPlan).toHaveLength(1);
      expect(response.body.diagnostics.duplicateEntriesDetected).toBe(2);
    } finally {
      server.close();
    }
  });

  it("does not merge separate renewals created outside the migration window", () => {
    const common = {
      client: "client-1",
      planName: "Weight Loss",
      durationDays: 90,
      startDate: "2026-07-15T00:00:00.000Z",
      endDate: "2026-10-25T00:00:00.000Z",
      finalAmount: 5000,
    };
    const result = canonicalizePurchaseRecords([
      { ...common, _id: "one", createdAt: "2026-07-14T10:00:00.000Z" },
      { ...common, _id: "two", createdAt: "2026-07-14T10:10:01.000Z" },
    ]);

    expect(result.purchases).toHaveLength(2);
    expect(result.duplicateEntriesDetected).toBe(0);
  });

  it("returns the actual next published phase despite a stale duplicate purchase", async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const now = new Date();
    const futureStart = new Date(now);
    futureStart.setDate(futureStart.getDate() + 12);
    futureStart.setHours(0, 0, 0, 0);
    const futureEnd = new Date(futureStart);
    futureEnd.setDate(futureEnd.getDate() + 9);
    const entitlementEnd = new Date(futureStart);
    entitlementEnd.setDate(entitlementEnd.getDate() + 90);

    const commonPurchase = {
      client: client._id,
      dietitian: dietitian._id,
      planName: "Weight Loss",
      planCategory: "weight-loss",
      durationDays: 90,
      durationLabel: "3 Months",
      baseAmount: 5000,
      finalAmount: 5000,
      amount: 5000,
      status: "paid",
      paymentStatus: "paid",
      startDate: now,
      endDate: entitlementEnd,
      expectedStartDate: futureStart,
      expectedEndDate: entitlementEnd,
      paidAt: now,
    } as const;

    await UnifiedPayment.create({
      ...commonPurchase,
      mealPlanCreated: false,
      daysUsed: 0,
      remainingDays: 90,
    });
    const authoritative = await UnifiedPayment.create({
      ...commonPurchase,
      mealPlanCreated: true,
      daysUsed: 10,
      remainingDays: 80,
    });
    const plan = await ClientMealPlan.create({
      clientId: client._id,
      dietitianId: dietitian._id,
      purchaseId: authoritative._id,
      name: "Future Detox Plan",
      status: "active",
      startDate: futureStart,
      endDate: futureEnd,
      duration: 10,
      goals: { primaryGoal: "weight-loss" },
    });

    (getServerSession as jest.Mock).mockResolvedValue({
      user: {
        id: entityId(client),
        email: client.email,
        role: client.role,
      },
    });

    const route = await import("@/app/api/client/service-plans/route");
    const server = createRouteTestServer(route.GET);

    try {
      const response = await request(server).get("/api/client/service-plans");

      expect(response.status).toBe(200);
      expect(response.body.activePurchases).toHaveLength(1);
      expect(String(response.body.activePurchases[0]._id)).toBe(
        entityId(authoritative),
      );
      expect(String(response.body.nextMealPlan?.id)).toBe(entityId(plan));
      expect(new Date(response.body.nextMealPlan.startDate).getTime()).toBe(
        futureStart.getTime(),
      );
    } finally {
      server.close();
    }
  });
});
