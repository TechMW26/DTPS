/// <reference types="jest" />

import LifestyleInfo from "@/lib/db/models/LifestyleInfo";
import { entityId } from "../utils/assertions";
import {
  createAssignedDietitianClientPair,
  ensureDatabaseConnection,
} from "../utils/database";
import { invokeRouteWithParams } from "../utils/routes";

describe("lifestyle persistence", () => {
  beforeEach(async () => {
    await ensureDatabaseConnection();
  });

  it("merges a partial retry without erasing previously saved fields", async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    await LifestyleInfo.create({
      userId: client._id,
      foodPreference: "non-veg",
      nonVegExemptDays: ["monday", "thursday"],
      foodDislikes: "shakes",
      sleepPattern: "regular-sleep",
    });
    const route = await import("@/app/api/users/[id]/lifestyle/route");
    const clientId = entityId(client);

    const response = await invokeRouteWithParams(route.POST, {
      method: "POST",
      url: `http://localhost/api/users/${clientId}/lifestyle`,
      user: dietitian,
      params: { id: clientId },
      body: { stressLevel: "high" },
    });

    expect(response.status).toBe(200);
    const saved = await LifestyleInfo.findOne({ userId: client._id }).lean();
    expect(saved).toMatchObject({
      foodPreference: "non-veg",
      nonVegExemptDays: ["monday", "thursday"],
      foodDislikes: "shakes",
      sleepPattern: "regular-sleep",
      stressLevel: "frequent-stress",
    });
  });
});
