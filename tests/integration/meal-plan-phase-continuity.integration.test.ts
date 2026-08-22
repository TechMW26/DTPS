import {
  checkPhaseStartPolicy,
  checkPhaseContinuity,
  getRequiredNextPhaseStart,
} from "@/lib/meal-plan-phase-continuity";

describe("meal plan phase continuity", () => {
  it("requires the next phase to begin the day after the previous phase", () => {
    const requiredStart = getRequiredNextPhaseStart("2026-08-21T00:00:00.000Z");

    expect(requiredStart).not.toBeNull();
    expect(requiredStart?.toISOString().slice(0, 10)).toBe("2026-08-22");
    expect(checkPhaseContinuity("2026-08-22", "2026-08-21")?.isContinuous).toBe(
      true,
    );
  });

  it("detects Mohit C-7476's ten-day phase gap", () => {
    const result = checkPhaseContinuity("2026-09-01", "2026-08-21");

    expect(result).toMatchObject({
      isContinuous: false,
      expectedStartDateKey: "2026-08-22",
      actualStartDateKey: "2026-09-01",
      gapDays: 10,
    });
  });

  it("detects an overlap as a negative gap", () => {
    const result = checkPhaseContinuity("2026-08-21", "2026-08-21");

    expect(result?.isContinuous).toBe(false);
    expect(result?.gapDays).toBe(-1);
  });

  it("recovers to today when the exact continuity date has already passed", () => {
    const result = checkPhaseStartPolicy(
      "2026-08-22",
      "2026-08-19",
      "2026-08-22",
    );

    expect(result).toMatchObject({
      allowed: true,
      expectedStartDateKey: "2026-08-20",
      earliestAllowedDateKey: "2026-08-22",
      recoveredFromPastGap: true,
    });
  });

  it("allows a dietitian to intentionally schedule a later phase", () => {
    const result = checkPhaseStartPolicy(
      "2026-08-25",
      "2026-08-23",
      "2026-08-22",
    );

    expect(result).toMatchObject({
      allowed: true,
      expectedStartDateKey: "2026-08-24",
      earliestAllowedDateKey: "2026-08-24",
      gapDays: 1,
    });
  });

  it("allows the reported five-day plan to start tomorrow after an elapsed gap", () => {
    const result = checkPhaseStartPolicy(
      "2026-08-23",
      "2026-08-17",
      "2026-08-22",
    );

    expect(result).toMatchObject({
      allowed: true,
      expectedStartDateKey: "2026-08-18",
      earliestAllowedDateKey: "2026-08-22",
      actualStartDateKey: "2026-08-23",
      gapDays: 5,
    });
  });

  it("still rejects a phase that starts before the preceding phase ends", () => {
    const result = checkPhaseStartPolicy(
      "2026-08-23",
      "2026-08-23",
      "2026-08-22",
    );

    expect(result).toMatchObject({
      allowed: false,
      earliestAllowedDateKey: "2026-08-24",
      gapDays: -1,
    });
  });
});
