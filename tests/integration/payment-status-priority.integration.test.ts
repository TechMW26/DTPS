import { resolvePaymentStatus } from '@/lib/payments/payment-status';

describe('payment status priority rules', () => {
  const now = new Date('2026-04-03T10:00:00.000Z');

  it('payment completed -> shows paid', () => {
    const status = resolvePaymentStatus({
      status: 'completed',
      paymentStatus: 'paid',
      paidAt: new Date('2026-04-02T10:00:00.000Z'),
      expiryDate: new Date('2026-04-01T10:00:00.000Z'),
      now,
    });

    expect(status).toBe('paid');
  });

  it('payment completed, then time passes -> still paid', () => {
    const status = resolvePaymentStatus({
      status: 'paid',
      paymentStatus: 'paid',
      paidAt: new Date('2026-01-01T10:00:00.000Z'),
      expiryDate: new Date('2026-01-15T10:00:00.000Z'),
      now: new Date('2026-04-03T10:00:00.000Z'),
    });

    expect(status).toBe('paid');
  });

  it('payment pending and expired -> shows expired', () => {
    const status = resolvePaymentStatus({
      status: 'pending',
      paymentStatus: 'pending',
      paidAt: null,
      expiryDate: new Date('2026-04-01T10:00:00.000Z'),
      now,
    });

    expect(status).toBe('expired');
  });

  it('payment completed survives refresh-equivalent recompute -> still paid', () => {
    const firstPass = resolvePaymentStatus({
      status: 'completed',
      paymentStatus: 'paid',
      paidAt: new Date('2026-04-02T12:00:00.000Z'),
      expiryDate: new Date('2026-04-03T00:00:00.000Z'),
      now,
    });

    const secondPass = resolvePaymentStatus({
      status: firstPass,
      paymentStatus: 'paid',
      paidAt: new Date('2026-04-02T12:00:00.000Z'),
      expiryDate: new Date('2026-04-03T00:00:00.000Z'),
      now: new Date('2026-04-04T10:00:00.000Z'),
    });

    expect(firstPass).toBe('paid');
    expect(secondPass).toBe('paid');
  });
});
