import {canonicalizePurchaseRecords} from '@/lib/payments/canonicalize-purchases';
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
