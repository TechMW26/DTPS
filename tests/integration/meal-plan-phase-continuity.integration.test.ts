import {
  checkPhaseContinuity,
  getRequiredNextPhaseStart,
} from '@/lib/meal-plan-phase-continuity';

describe('meal plan phase continuity', () => {
  it('requires the next phase to begin the day after the previous phase', () => {
    const requiredStart = getRequiredNextPhaseStart('2026-08-21T00:00:00.000Z');

    expect(requiredStart).not.toBeNull();
    expect(requiredStart?.toISOString().slice(0, 10)).toBe('2026-08-22');
    expect(
      checkPhaseContinuity('2026-08-22', '2026-08-21')?.isContinuous,
    ).toBe(true);
  });

  it('detects Mohit C-7476\'s ten-day phase gap', () => {
    const result = checkPhaseContinuity('2026-09-01', '2026-08-21');

    expect(result).toMatchObject({
      isContinuous: false,
      expectedStartDateKey: '2026-08-22',
      actualStartDateKey: '2026-09-01',
      gapDays: 10,
    });
  });

  it('detects an overlap as a negative gap', () => {
    const result = checkPhaseContinuity('2026-08-21', '2026-08-21');

    expect(result?.isContinuous).toBe(false);
    expect(result?.gapDays).toBe(-1);
  });
});
