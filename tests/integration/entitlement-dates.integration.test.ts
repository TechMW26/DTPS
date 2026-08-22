import {
  getCalendarEntitlementEndDate,
  resolveEntitlementEndDate,
} from "@/lib/payments/entitlement-dates";

describe("calendar entitlement dates", () => {
  it("keeps a three-month plan on the matching calendar date", () => {
    expect(
      getCalendarEntitlementEndDate("2026-06-26", "3 Months")
        ?.toISOString()
        .slice(0, 10),
    ).toBe("2026-09-26");
  });

  it("repairs a shorter stored end while preserving later extensions", () => {
    expect(
      resolveEntitlementEndDate({
        expectedStartDate: "2026-06-26",
        expectedEndDate: "2026-09-25",
        durationLabel: "3 Months",
      })
        ?.toISOString()
        .slice(0, 10),
    ).toBe("2026-09-26");

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
