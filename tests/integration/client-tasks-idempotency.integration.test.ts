/// <reference types="jest" />

import Task from "@/lib/db/models/Task";
import { entityId } from "../utils/assertions";
import {
  createAssignedDietitianClientPair,
  ensureDatabaseConnection,
} from "../utils/database";
import { invokeRouteWithParams } from "../utils/routes";

describe("client task persistence", () => {
  beforeEach(async () => {
    await ensureDatabaseConnection();
  });

  it("replays a timed-out create safely without duplicating the task", async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const route = await import("@/app/api/users/[id]/tasks/route");
    const clientId = entityId(client);
    const operationId = "task-save-operation-1234";
    const request = {
      method: "POST" as const,
      url: `http://localhost/api/users/${clientId}/tasks`,
      user: dietitian,
      params: { id: clientId },
      headers: { "x-idempotency-key": operationId },
      body: {
        taskType: "General Followup",
        title: "Check in with client",
        startDate: "2026-08-22",
        endDate: "2026-08-22",
        allottedTime: "12:00 PM",
      },
    };

    const created = await invokeRouteWithParams(route.POST, request);
    const replayed = await invokeRouteWithParams(route.POST, request);

    expect(created.status).toBe(201);
    expect(replayed.status).toBe(200);
    expect(replayed.json.replayed).toBe(true);
    expect(String(replayed.json.task._id)).toBe(String(created.json.task._id));
    expect(await Task.countDocuments({ operationId })).toBe(1);
  });
});
