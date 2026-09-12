import {
  getCalendarEntitlementEndDate,
  resolveEntitlementEndDate,
  resolveEntitlementEndDateCoveringRemainingDays,
} from "@/lib/payments/entitlement-dates";

describe("calendar entitlement dates", () => {
  it("keeps a three-month plan on the matching calendar date", () => {
    expect(
      getCalendarEntitlementEndDate("2026-06-26", "3 Months")
        ?.toISOString()
        .slice(0, 10),
    ).toBe("2026-09-26");
  });

  it("keeps enough calendar room for every day remaining after the latest phase", () => {
    expect(
      resolveEntitlementEndDateCoveringRemainingDays({
        expectedStartDate: "2026-05-18",
        expectedEndDate: "2026-08-28",
        durationLabel: "3 Months",
        linkedMealPlanEndDate: "2026-08-28",
        remainingDays: 16,
      })
        ?.toISOString()
        .slice(0, 10),
    ).toBe("2026-09-13");
  });

  it("does not revive an expired purchase that never received a meal plan", () => {
    expect(
      resolveEntitlementEndDateCoveringRemainingDays({
        expectedStartDate: "2026-05-18",
        expectedEndDate: "2026-08-18",
        durationLabel: "3 Months",
        remainingDays: 90,
      })
        ?.toISOString()
        .slice(0, 10),
    ).toBe("2026-08-18");
  });

  it("respects a stored end instead of imposing calendar months", () => {
    expect(
      resolveEntitlementEndDate({
        expectedStartDate: "2026-06-26",
        expectedEndDate: "2026-09-25",
        durationLabel: "3 Months",
      })
        ?.toISOString()
        .slice(0, 10),
    ).toBe("2026-09-25");

    expect(
      resolveEntitlementEndDate({
        expectedStartDate: "2026-06-26",
        expectedEndDate: "2026-10-02",
        durationLabel: "3 Months",
      })
        ?.toISOString()
        .slice(0, 10),
    ).toBe("2026-10-02");
  });
});

 it("preserves a corrected 90-day window on refresh", () => {
    expect(resolveEntitlementEndDateCoveringRemainingDays({
      expectedStartDate: "2026-06-27", expectedEndDate: "2026-09-24",
      durationLabel: "3 Months", linkedMealPlanEndDate: "2026-09-24", remainingDays: 0,
    })?.toISOString().slice(0, 10)).toBe("2026-09-24");
  });

  it("uses inclusive purchased days when stored dates are missing", () => {
    expect(resolveEntitlementEndDate({ expectedStartDate: "2026-06-27",
      durationDays: 90, durationLabel: "3 Months",
    })?.toISOString().slice(0, 10)).toBe("2026-09-24");
  });
