/// <reference types="jest" />

import { POST } from "@/app/api/client-meal-plans/route";
import { PUT as updateMealPlan } from "@/app/api/client-meal-plans/[id]/route";
import ClientMealPlan from "@/lib/db/models/ClientMealPlan";
import UnifiedPayment from "@/lib/db/models/UnifiedPayment";
import {
  createAssignedDietitianClientPair,
  ensureDatabaseConnection,
} from "../utils/database";
import { invokeRoute, invokeRouteWithParams } from "../utils/routes";

jest.mock("@/lib/utils/activityLogger", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/firebase/firebaseNotification", () => ({
  sendNotificationToUser: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/status/computeClientStatus", () => ({
  updateClientStatusFromMealPlan: jest.fn().mockResolvedValue("active"),
}));

const publishableMeals = [
  {
    date: "2026-09-01",
    day: "Day 1",
    meals: {
      BREAKFAST: {
        foodOptions: [{ food: "Oats with milk" }],
      },
    },
  },
];

describe("POST /api/client-meal-plans phase continuity", () => {
  beforeEach(async () => {
    await ensureDatabaseConnection();
  });

  it("allows meal edits when an active plan re-sends its unchanged past start date", async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const purchase = await UnifiedPayment.create({
      client: client._id,
      dietitian: dietitian._id,
      planName: "Thirty Day Weight Loss",
      planCategory: "weight-loss",
      durationDays: 30,
      durationLabel: "30 Days",
      status: "paid",
      paymentStatus: "paid",
      expectedStartDate: new Date("2026-08-01T00:00:00.000Z"),
      expectedEndDate: new Date("2026-09-30T00:00:00.000Z"),
      remainingDays: 24,
      mealPlanCreated: true,
    });

    const previousPlan = await ClientMealPlan.create({
      clientId: client._id,
      dietitianId: dietitian._id,
      purchaseId: purchase._id,
      phaseNumber: 1,
      phaseTag: "PHASE-1",
      name: "Detox Plan",
      startDate: new Date("2026-08-20T00:00:00.000Z"),
      endDate: new Date("2026-08-22T00:00:00.000Z"),
      duration: 3,
      status: "active",
      meals: publishableMeals,
      goals: { primaryGoal: "weight-loss" },
    });
    const currentPlan = await ClientMealPlan.create({
      clientId: client._id,
      dietitianId: dietitian._id,
      purchaseId: purchase._id,
      previousPhaseId: previousPlan._id,
      phaseNumber: 2,
      phaseTag: "PHASE-2",
      name: "Current Phase",
      startDate: new Date("2026-08-23T00:00:00.000Z"),
      endDate: new Date("2026-08-25T00:00:00.000Z"),
      duration: 3,
      status: "active",
      meals: publishableMeals.map((day, index) => ({
        ...day,
        date: `2026-08-${23 + index}`,
      })),
      goals: { primaryGoal: "weight-loss" },
    });

    const editedMeals = currentPlan.meals.map((day: any) => ({
      ...(typeof day.toObject === "function" ? day.toObject() : day),
      meals: {
        ...day.meals,
        BREAKFAST: {
          foodOptions: [{ food: "Edited oats with milk" }],
        },
      },
    }));
    const result = await invokeRouteWithParams(updateMealPlan, {
      method: "PUT",
      url: `http://localhost/api/client-meal-plans/${currentPlan._id}`,
      user: dietitian.toObject(),
      params: { id: String(currentPlan._id) },
      body: {
        startDate: "2026-08-23",
        endDate: "2026-08-25",
        duration: 3,
        meals: editedMeals,
      },
    });

    expect(result.status).toBe(200);
    expect(result.json.success).toBe(true);
    expect(result.json.mealPlan.meals[0].meals.BREAKFAST.foodOptions[0].food)
      .toBe("Edited oats with milk");
  });

  it("accepts a deliberate later phase when it remains inside the purchase window", async () => {
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    const relativeDate = (days: number) => new Date(today.getTime() + days * 86_400_000);
    const dateKey = (days: number) => relativeDate(days).toISOString().slice(0, 10);
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const purchase = await UnifiedPayment.create({
      client: client._id,
      dietitian: dietitian._id,
      planName: "180 Day Weight Loss",
      planCategory: "weight-loss",
      durationDays: 180,
      durationLabel: "180 Days",
      status: "paid",
      paymentStatus: "paid",
      expectedStartDate: relativeDate(-60),
      expectedEndDate: relativeDate(120),
      remainingDays: 137,
      mealPlanCreated: true,
    });

    await ClientMealPlan.create({
      clientId: client._id,
      dietitianId: dietitian._id,
      purchaseId: purchase._id,
      phaseNumber: 2,
      phaseTag: "PHASE-2",
      name: "Phase 2",
      startDate: relativeDate(-27),
      endDate: relativeDate(-14),
      duration: 14,
      status: "active",
      meals: [{ ...publishableMeals[0], date: dateKey(1) }],
      goals: { primaryGoal: "weight-loss" },
    });

    const result = await invokeRoute(POST, {
      method: "POST",
      url: "http://localhost/api/client-meal-plans",
      user: dietitian.toObject(),
      body: {
        clientId: String(client._id),
        purchaseId: String(purchase._id),
        name: "Phase 3",
        startDate: dateKey(1),
        endDate: dateKey(15),
        duration: 15,
        status: "active",
        meals: [{ ...publishableMeals[0], date: dateKey(1) }],
      },
    });

    expect(result.status).toBe(201);
    expect(result.json.mealPlan).toEqual(
      expect.objectContaining({
        name: "Phase 3",
        startDate: expect.any(String),
        duration: 15,
      }),
    );
    await expect(
      ClientMealPlan.countDocuments({ purchaseId: purchase._id }),
    ).resolves.toBe(2);
  });

  it.each([true, false])("honors the stored end when creating a phase (inside window: %s)", async (insideWindow) => {
    const phaseDate = insideWindow ? "2030-09-25" : "2030-09-26";
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const purchase = await UnifiedPayment.create({
      client: client._id,
      dietitian: dietitian._id,
      planName: "Three Month Weight Loss",
      planCategory: "weight-loss",
      durationDays: 90,
      durationLabel: "3 Months",
      status: "paid",
      paymentStatus: "paid",
      expectedStartDate: new Date("2030-06-26T00:00:00.000Z"),
      expectedEndDate: new Date("2030-09-25T00:00:00.000Z"),
      remainingDays: 1,
      mealPlanCreated: false,
    });

    const result = await invokeRoute(POST, {
      method: "POST",
      url: "http://localhost/api/client-meal-plans",
      user: dietitian.toObject(),
      body: {
        clientId: String(client._id),
        purchaseId: String(purchase._id),
        name: "Final Phase",
        startDate: phaseDate,
        endDate: phaseDate,
        duration: 1,
        status: "active",
        meals: [
          {
            date: phaseDate,
            day: "Day 1",
            meals: {
              BREAKFAST: { foodOptions: [{ food: "Oats with milk" }] },
            },
          },
        ],
      },
    });

    if (!insideWindow) {
      expect(result.status).toBe(400);
      expect(result.json.error).toBe("Start date outside purchase window");
      expect(await ClientMealPlan.countDocuments({ purchaseId: purchase._id })).toBe(0);
      return;
    }
    expect(result.status).toBe(201);
    expect(result.json.mealPlan).toEqual(
      expect.objectContaining({
        startDate: expect.any(String),
        duration: 1,
      }),
    );
  });

  it.each([true, false])("honors the stored end when publishing a draft (inside window: %s)", async (insideWindow) => {
    const phaseDate = insideWindow ? "2030-09-25" : "2030-09-26";
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const purchase = await UnifiedPayment.create({
      client: client._id,
      dietitian: dietitian._id,
      planName: "Three Month Weight Loss",
      planCategory: "weight-loss",
      durationDays: 90,
      durationLabel: "3 Months",
      status: "paid",
      paymentStatus: "paid",
      expectedStartDate: new Date("2030-06-26T00:00:00.000Z"),
      expectedEndDate: new Date("2030-09-25T00:00:00.000Z"),
      remainingDays: 1,
      mealPlanCreated: false,
    });
    const draft = await ClientMealPlan.create({
      clientId: client._id,
      dietitianId: dietitian._id,
      purchaseId: purchase._id,
      name: "Final Draft Phase",
      startDate: new Date(`${phaseDate}T00:00:00.000Z`),
      endDate: new Date(`${phaseDate}T00:00:00.000Z`),
      duration: 1,
      status: "draft",
      meals: [
        {
          date: phaseDate,
          day: "Day 1",
          meals: {
            BREAKFAST: { foodOptions: [{ food: "Oats with milk" }] },
          },
        },
      ],
      goals: { primaryGoal: "weight-loss" },
    });

    const result = await invokeRouteWithParams(updateMealPlan, {
      method: "PUT",
      url: `http://localhost/api/client-meal-plans/${draft._id}`,
      user: dietitian.toObject(),
      params: { id: String(draft._id) },
      body: {
        status: "active",
        startDate: phaseDate,
        endDate: phaseDate,
        duration: 1,
        meals: draft.meals,
      },
    });

    if (!insideWindow) {
      expect(result.status).toBe(400);
      expect(result.json.error).toBe("Meal plan dates must remain within the linked purchase expected window");
      expect((await ClientMealPlan.findById(draft._id))?.status).toBe("draft");
      return;
    }
    expect(result.status).toBe(200);
    expect(result.json.mealPlan).toEqual(
      expect.objectContaining({
        status: "active",
        duration: 1,
      }),
    );
  });
});
