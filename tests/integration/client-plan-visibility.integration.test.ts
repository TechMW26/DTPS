import {
  prioritizeClientDashboardPurchases,
  resolveClientMealPlanEmptyState,
} from '@/lib/client-plan-visibility';

describe('client dashboard meal-plan visibility', () => {
  const now = new Date('2026-08-22T12:00:00.000Z');

  it('keeps the purchase owning the published current diet ahead of early retention', () => {
    const currentPurchase = {
      _id: 'current-purchase',
      expectedStartDate: '2026-06-29T00:00:00.000Z',
      expectedEndDate: '2026-09-27T00:00:00.000Z',
      createdAt: '2026-06-27T00:00:00.000Z',
    };
    const earlyRetention = {
      _id: 'early-retention',
      expectedStartDate: '2026-09-29T00:00:00.000Z',
      expectedEndDate: '2026-11-27T00:00:00.000Z',
      createdAt: '2026-08-15T00:00:00.000Z',
    };

    const result = prioritizeClientDashboardPurchases(
      [earlyRetention, currentPurchase],
      currentPurchase._id,
      now,
    );

    expect(result.map((purchase) => purchase._id)).toEqual([
      'current-purchase',
      'early-retention',
    ]);
  });

  it('uses the expected service window when no current plan link is available', () => {
    const result = prioritizeClientDashboardPurchases(
      [
        {
          _id: 'future-retention',
          startDate: '2026-08-15T00:00:00.000Z',
          endDate: '2026-11-13T00:00:00.000Z',
          expectedStartDate: '2026-09-29T00:00:00.000Z',
          expectedEndDate: '2026-11-27T00:00:00.000Z',
          createdAt: '2026-08-15T00:00:00.000Z',
        },
        {
          _id: 'current-service',
          expectedStartDate: '2026-06-29T00:00:00.000Z',
          expectedEndDate: '2026-09-27T00:00:00.000Z',
          createdAt: '2026-06-27T00:00:00.000Z',
        },
      ],
      null,
      now,
    );

    expect(result[0]._id).toBe('current-service');
  });

  it('orders multiple future purchases by the nearest expected start date', () => {
    const result = prioritizeClientDashboardPurchases(
      [
        {
          _id: 'later',
          expectedStartDate: '2026-12-01T00:00:00.000Z',
          expectedEndDate: '2027-01-01T00:00:00.000Z',
          createdAt: '2026-08-20T00:00:00.000Z',
        },
        {
          _id: 'sooner',
          expectedStartDate: '2026-09-01T00:00:00.000Z',
          expectedEndDate: '2026-10-01T00:00:00.000Z',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      null,
      now,
    );

    expect(result.map((purchase) => purchase._id)).toEqual(['sooner', 'later']);
  });
});

describe('client meal-plan empty-state messaging', () => {
  it('does not offer another purchase while a paid entitlement is active', () => {
    expect(
      resolveClientMealPlanEmptyState({
        hasUpcomingPlan: false,
        entitlementStatus: 'active',
      }),
    ).toBe('pending-phase');
  });

  it('only offers a purchase after confirming there is no active entitlement', () => {
    expect(
      resolveClientMealPlanEmptyState({
        hasUpcomingPlan: false,
        entitlementStatus: 'none',
      }),
    ).toBe('available-for-purchase');
  });

  it('keeps the purchase action hidden if entitlement verification fails', () => {
    expect(
      resolveClientMealPlanEmptyState({
        hasUpcomingPlan: false,
        entitlementStatus: 'unknown',
      }),
    ).toBe('entitlement-unavailable');
  });

  it('prioritizes an assigned future plan over entitlement messaging', () => {
    expect(
      resolveClientMealPlanEmptyState({
        hasUpcomingPlan: true,
        entitlementStatus: 'active',
      }),
    ).toBe('upcoming');
  });
});
