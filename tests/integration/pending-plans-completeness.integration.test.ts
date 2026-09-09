/// <reference types="jest" />

import ClientMealPlan from "@/lib/db/models/ClientMealPlan";
import UnifiedPayment from "@/lib/db/models/UnifiedPayment";
import { UserStatus } from "@/types";
import { entityId } from "../utils/assertions";
import {
  createAssignedDietitianClientPair,
  ensureDatabaseConnection,
} from "../utils/database";
import { invokeRoute } from "../utils/routes";

describe("pending plans completeness", () => {
  beforeEach(async () => {
    await ensureDatabaseConnection();
  });

  it("includes assigned inactive clients with paid allocations still needing a plan", async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    client.status = UserStatus.INACTIVE;
    await client.save();

    await UnifiedPayment.create({
      client: client._id,
      dietitian: dietitian._id,
      planName: "Completed Payment Allocation",
      durationDays: 30,
      durationLabel: "30 Days",
      status: "completed",
      paymentStatus: "paid",
      daysUsed: 0,
      mealPlanCreated: false,
    });

    const route = await import("@/app/api/dashboard/pending-plans/route");
    const result = await invokeRoute(route.GET, {
      method: "GET",
      url: "http://localhost/api/dashboard/pending-plans",
      user: dietitian,
    });

    expect(result.status).toBe(200);
    expect(result.json.pendingPlans).toEqual([
      expect.objectContaining({
        clientId: entityId(client),
        purchasedPlanName: "Completed Payment Allocation",
        pendingDaysToCreate: 30,
        reason: "no_meal_plan",
      }),
    ]);
  });

  it("keeps overdue clients pending after a completed phase has been overdue for more than thirty days", async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const relativeDate = (days: number) => new Date(today.getTime() + days * 86_400_000);
    const purchase = await UnifiedPayment.create({
      client: client._id, dietitian: dietitian._id,
      planName: "Unfinished paid plan", durationDays: 90, durationLabel: "90 Days",
      status: "paid", paymentStatus: "paid", daysUsed: 14, remainingDays: 76,
      mealPlanCreated: true, expectedStartDate: relativeDate(-53), expectedEndDate: relativeDate(37),
    });
    await ClientMealPlan.create({
      clientId: client._id, dietitianId: dietitian._id, purchaseId: purchase._id,
      name: "Previous phase", startDate: relativeDate(-53), endDate: relativeDate(-40),
      duration: 14, status: "completed", meals: [], goals: { primaryGoal: "weight-loss" },
    });
    const route = await import("@/app/api/dashboard/pending-plans/route");
    const result = await invokeRoute(route.GET, {
      method: "GET", url: "http://localhost/api/dashboard/pending-plans", user: dietitian,
    });
    expect(result.status).toBe(200);
    expect(result.json.pendingPlans).toEqual([expect.objectContaining({
      clientId: entityId(client), pendingDaysToCreate: 76, urgency: "critical",
    })]);
  });

  it("does not treat an expired purchase counter as pending plan work", async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();

    await UnifiedPayment.create({
      client: client._id,
      dietitian: dietitian._id,
      planName: "Expired Trial",
      durationDays: 10,
      durationLabel: "10 Days",
      status: "completed",
      paymentStatus: "paid",
      daysUsed: 0,
      mealPlanCreated: false,
      expectedStartDate: new Date("2026-06-01T00:00:00.000Z"),
      expectedEndDate: new Date("2026-06-10T00:00:00.000Z"),
    });

    const route = await import("@/app/api/dashboard/pending-plans/route");
    const result = await invokeRoute(route.GET, {
      method: "GET",
      url: "http://localhost/api/dashboard/pending-plans",
      user: dietitian,
    });

    expect(result.status).toBe(200);
    expect(result.json.pendingPlans).toEqual([]);
  });

  it("uses the authoritative counter when an imported entitlement has duplicate rows", async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const startDate = new Date("2026-07-15T00:00:00.000Z");
    const endDate = new Date("2026-10-25T00:00:00.000Z");
    const common = {
      client: client._id,
      dietitian: dietitian._id,
      planName: "Weight Loss",
      durationDays: 90,
      durationLabel: "3 Months",
      status: "paid",
      paymentStatus: "paid",
      startDate,
      endDate,
      expectedStartDate: startDate,
      expectedEndDate: endDate,
      finalAmount: 5000,
      amount: 5000,
    } as const;

    await UnifiedPayment.create({
      ...common,
      mealPlanCreated: true,
      daysUsed: 13,
      remainingDays: 77,
    });
    await UnifiedPayment.create({
      ...common,
      mealPlanCreated: false,
      daysUsed: 0,
      remainingDays: 90,
    });
    await UnifiedPayment.create({
      ...common,
      mealPlanCreated: true,
      daysUsed: 37,
      remainingDays: 53,
    });

    const route = await import("@/app/api/dashboard/pending-plans/route");
    const result = await invokeRoute(route.GET, {
      method: "GET",
      url: "http://localhost/api/dashboard/pending-plans",
      user: dietitian,
    });

    expect(result.status).toBe(200);
    expect(result.json.pendingPlans).toEqual([
      expect.objectContaining({
        clientId: entityId(client),
        totalMealPlanDays: 37,
        pendingDaysToCreate: 53,
      }),
    ]);
  });
  it("puts critical missing plans ahead of upcoming phases", async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const secondPair = await createAssignedDietitianClientPair();
    secondPair.client.assignedDietitian = dietitian._id;
    secondPair.client.assignedDietitians = [dietitian._id];
    await secondPair.client.save();
    const tomorrow = new Date(Date.now() + 86_400_000);
    const purchaseFields = { dietitian: dietitian._id, planName: 'Pending priority',
      durationDays: 30, durationLabel: '30 Days', status: 'paid', paymentStatus: 'paid', daysUsed: 0 };
    await UnifiedPayment.create({ ...purchaseFields, client: client._id });
    const secondPurchase = await UnifiedPayment.create({ ...purchaseFields, client: secondPair.client._id });
    await ClientMealPlan.create({
      clientId: secondPair.client._id, dietitianId: dietitian._id, purchaseId: secondPurchase._id,
      name: 'Upcoming phase', status: 'active', startDate: tomorrow,
      endDate: new Date(tomorrow.getTime() + 6 * 86_400_000), duration: 7, meals: [], goals: { primaryGoal: 'weight-loss' },
    });
    const route = await import("@/app/api/dashboard/pending-plans/route");
    const result = await invokeRoute(route.GET, { method: 'GET',
      url: 'http://localhost/api/dashboard/pending-plans', user: dietitian });
    expect(result.status).toBe(200);
    expect(result.json.pendingPlans).toHaveLength(2);
    expect(result.json.pendingPlans[0]).toMatchObject({ clientId: entityId(client), urgency: 'critical' });
    expect(result.json.pendingPlans[1].urgency).toBe('high');
  });

});
