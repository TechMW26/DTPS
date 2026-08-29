/// <reference types="jest" />

import request from "supertest";
import { getServerSession } from "next-auth";
import UnifiedPayment from "@/lib/db/models/UnifiedPayment";
import ClientMealPlan from "@/lib/db/models/ClientMealPlan";
import { UserRole } from "@/types";
import { entityId } from "../utils/assertions";
import {
  createAssignedDietitianClientPair,
  createUser,
  ensureDatabaseConnection,
} from "../utils/database";
import { createRouteTestServer } from "../utils/supertest-route";

function toSessionUser(user: any) {
  return {
    id: entityId(user),
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}

async function createPurchaseAndPlan({
  durationDays,
  daysUsed,
  remainingDays,
}: {
  durationDays: number;
  daysUsed: number;
  remainingDays: number;
}) {
  const { client, dietitian } = await createAssignedDietitianClientPair();
  const purchase = await UnifiedPayment.create({
    client: client._id,
    dietitian: dietitian._id,
    planName: "Weight Loss",
    planCategory: "weight-loss",
    durationDays,
    durationLabel: `${durationDays} Days`,
    baseAmount: 6000,
    finalAmount: 6000,
    amount: 6000,
    status: "paid",
    paymentStatus: "paid",
    expectedStartDate: new Date("2026-05-18T00:00:00.000Z"),
    expectedEndDate: new Date("2026-08-28T00:00:00.000Z"),
    mealPlanCreated: true,
    daysUsed,
    remainingDays,
    paidAt: new Date("2026-05-15T07:30:00.000Z"),
  });
  const mealPlan = await ClientMealPlan.create({
    clientId: client._id,
    dietitianId: dietitian._id,
    purchaseId: purchase._id,
    name: "Latest Assigned Phase",
    startDate: new Date("2026-08-19T00:00:00.000Z"),
    endDate: new Date("2026-08-28T00:00:00.000Z"),
    duration: daysUsed,
    status: "active",
    goals: { primaryGoal: "weight-loss" },
  });

  return { client, dietitian, purchase, mealPlan };
}

describe("remaining-day entitlement window reconciliation", () => {
  beforeEach(async () => {
    await ensureDatabaseConnection();
  });

  it("self-heals an ended purchase window when linked phases leave paid days unused", async () => {
    const admin = await createUser({
      role: UserRole.ADMIN,
      email: "admin-entitlement-window-repair@example.com",
    });
    const { client, purchase } = await createPurchaseAndPlan({
      durationDays: 90,
      daysUsed: 74,
      remainingDays: 16,
    });

    (getServerSession as jest.Mock).mockResolvedValue({
      user: toSessionUser(admin),
    });
    const route = await import("@/app/api/client-purchases/check/route");
    const server = createRouteTestServer(route.GET);

    try {
      const response = await request(server)
        .get("/api/client-purchases/check")
        .query({ clientId: entityId(client) });

      expect(response.status).toBe(200);
      expect(response.body.remainingDays).toBe(16);
      expect(response.body.purchase.expectedEndDate.slice(0, 10)).toBe(
        "2026-09-13",
      );

      const refreshed: any = await UnifiedPayment.findById(purchase._id).lean();
      expect(refreshed.expectedEndDate.toISOString().slice(0, 10)).toBe(
        "2026-09-13",
      );
    } finally {
      server.close();
    }
  });

  it("keeps counters and expected end synchronized when a phase is linked", async () => {
    const admin = await createUser({
      role: UserRole.ADMIN,
      email: "admin-entitlement-window-put@example.com",
    });
    const { purchase, mealPlan } = await createPurchaseAndPlan({
      durationDays: 20,
      daysUsed: 4,
      remainingDays: 16,
    });

    // Exercise the authoritative linked-plan recalculation rather than trusting
    // counters supplied by the browser.
    await UnifiedPayment.collection.updateOne(
      { _id: purchase._id },
      { $set: { daysUsed: 0, remainingDays: 20, mealPlanCreated: false } },
    );

    (getServerSession as jest.Mock).mockResolvedValue({
      user: toSessionUser(admin),
    });
    const route = await import("@/app/api/client-purchases/route");
    const server = createRouteTestServer(route.PUT);

    try {
      const response = await request(server)
        .put("/api/client-purchases")
        .send({
          purchaseId: entityId(purchase),
          mealPlanId: entityId(mealPlan),
          mealPlanCreated: true,
          addDaysUsed: 4,
        });

      expect(response.status).toBe(200);
      expect(response.body.totalDaysUsed).toBe(4);
      expect(response.body.remainingDays).toBe(16);
      expect(response.body.purchase.expectedEndDate.slice(0, 10)).toBe(
        "2026-09-13",
      );
    } finally {
      server.close();
    }
  });
});
