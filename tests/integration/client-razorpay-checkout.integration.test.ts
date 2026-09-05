const mockOrdersCreate = jest.fn();
const mockPaymentLinkCreate = jest.fn();

jest.mock('razorpay', () => ({
  __esModule: true,
  default: class RazorpayMock {
    orders = { create: mockOrdersCreate };
    paymentLink = { create: mockPaymentLinkCreate };
  },
}));

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import ServicePlan from '@/lib/db/models/ServicePlan';
import SubscriptionPlan from '@/lib/db/models/SubscriptionPlan';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import { POST as purchaseServicePlan } from '@/app/api/client/service-plans/purchase/route';
import { POST as purchaseSubscription } from '@/app/api/client/subscriptions/purchase/route';
import { clearDatabaseState, createUser } from '../utils/database';
import { UserRole } from '@/types';

function request(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('client Razorpay Checkout purchase flow', () => {
  const originalKeyId = process.env.RAZORPAY_KEY_ID;
  const originalKeySecret = process.env.RAZORPAY_KEY_SECRET;

  beforeAll(() => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_checkout';
    process.env.RAZORPAY_KEY_SECRET = 'checkout_secret';
  });

  beforeEach(async () => {
    await clearDatabaseState();
    mockOrdersCreate.mockReset();
    mockPaymentLinkCreate.mockReset();
  });

  afterAll(() => {
    process.env.RAZORPAY_KEY_ID = originalKeyId;
    process.env.RAZORPAY_KEY_SECRET = originalKeySecret;
  });

  it('creates an order for in-app Checkout and ignores a browser-supplied service price', async () => {
    const admin = await createUser({ role: UserRole.ADMIN });
    const client = await createUser({ role: UserRole.CLIENT, phone: '+919876543210' });
    const plan = await ServicePlan.create({
      name: 'Life Pro Plan',
      category: 'general-wellness',
      description: 'Test plan',
      pricingTiers: [{
        durationDays: 30,
        durationLabel: '1 Month',
        amount: 6000,
        maxDiscount: 0,
        isActive: true,
      }],
      features: [],
      isActive: true,
      showToClients: true,
      createdBy: admin._id,
    });
    const tier = plan.pricingTiers[0] as typeof plan.pricingTiers[0] & { _id: { toString(): string } };
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: client._id.toString() } });
    mockOrdersCreate.mockResolvedValue({ id: 'order_service_checkout' });

    const response = await purchaseServicePlan(request(
      'http://localhost/api/client/service-plans/purchase',
      {
        planId: plan._id.toString(),
        tierId: tier._id.toString(),
        amount: 1,
        planName: 'Tampered plan',
      },
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      provider: 'razorpay_checkout',
      keyId: 'rzp_test_checkout',
      orderId: 'order_service_checkout',
      amount: 600000,
      currency: 'INR',
    });
    expect(mockOrdersCreate).toHaveBeenCalledWith(expect.objectContaining({ amount: 600000 }));
    expect(mockPaymentLinkCreate).not.toHaveBeenCalled();

    const payment = await UnifiedPayment.findById(payload.paymentId).lean();
    expect(payment?.finalAmount).toBe(6000);
    expect(payment?.razorpayOrderId).toBe('order_service_checkout');
    expect(payment?.razorpayPaymentLinkId).toBeUndefined();
  });

  it('uses order-based Checkout for subscriptions without sending a payment-link SMS', async () => {
    const admin = await createUser({ role: UserRole.ADMIN });
    const client = await createUser({ role: UserRole.CLIENT, phone: '+919876543210' });
    const plan = await SubscriptionPlan.create({
      name: 'Three Month Plan',
      duration: 3,
      durationType: 'months',
      price: 15000,
      currency: 'INR',
      features: [],
      category: 'weight-loss',
      isActive: true,
      createdBy: admin._id,
    });
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: client._id.toString() } });
    mockOrdersCreate.mockResolvedValue({ id: 'order_subscription_checkout' });

    const response = await purchaseSubscription(request(
      'http://localhost/api/client/subscriptions/purchase',
      { planId: plan._id.toString(), amount: 1 },
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      provider: 'razorpay_checkout',
      orderId: 'order_subscription_checkout',
      amount: 1500000,
    });
    expect(mockOrdersCreate).toHaveBeenCalledWith(expect.objectContaining({ amount: 1500000 }));
    expect(mockPaymentLinkCreate).not.toHaveBeenCalled();
  });
});
