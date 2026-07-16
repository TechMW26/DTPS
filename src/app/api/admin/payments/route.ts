import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';

// GET /api/admin/payments - Get all payments for admin
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '100');
    const skip = parseInt(searchParams.get('skip') || '0');

    // Build query
    const query: any = {};
    if (status && status !== 'all') {
      query.status = status;
    }
    if (type && type !== 'all') {
      query.type = type;
    }

    // Fetch payments (no cache; admin expects live data)
    const payments = await UnifiedPayment.find(query)
      .populate('client', 'firstName lastName email phone')
      .populate('dietitian', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    // Get stats
    const [totalPayments, completedPayments, pendingPayments, failedPayments, revenueResult] = await Promise.all([
      UnifiedPayment.countDocuments({}),
      UnifiedPayment.countDocuments({ status: { $in: ['completed', 'paid'] } }),
      UnifiedPayment.countDocuments({ status: 'pending' }),
      UnifiedPayment.countDocuments({ status: 'failed' }),
      UnifiedPayment.aggregate([
        { $match: { status: { $in: ['completed', 'paid'] } } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$finalAmount', { $ifNull: ['$baseAmount', '$amount'] }] } } } }
      ])
    ]);

    const totalRevenue = revenueResult[0]?.total || 0;

    return NextResponse.json({
      payments: payments.map((p: any) => ({
        _id: p._id.toString(),
        client: p.client ? {
          _id: p.client._id.toString(),
          firstName: p.client.firstName || '',
          lastName: p.client.lastName || '',
          email: p.client.email || p.payerEmail || '',
          phone: p.client.phone || p.payerPhone || ''
        } : {
          _id: '',
          firstName: p.payerName || 'Unknown',
          lastName: '',
          email: p.payerEmail || '',
          phone: p.payerPhone || ''
        },
        dietitian: p.dietitian ? {
          _id: p.dietitian._id.toString(),
          firstName: p.dietitian.firstName || '',
          lastName: p.dietitian.lastName || ''
        } : null,
        // Payment type
        type: p.paymentType || 'service_plan',
        paymentType: p.paymentType || 'service_plan',
        // Amount - use actual stored value, no defaults
        amount: p.amount || p.finalAmount || p.baseAmount || 0,
        baseAmount: p.baseAmount || 0,
        finalAmount: p.finalAmount || 0,
        currency: p.currency || 'INR',
        // Status - show actual status
        status: p.status || 'pending',
        paymentStatus: p.paymentStatus || 'pending',
        // Payment method
        paymentMethod: p.paymentMethod || '',
        // Plan details
        planName: p.planName || '',
        planCategory: p.planCategory || '',
        durationDays: p.durationDays || 0,
        durationLabel: p.durationLabel || '',
        // Razorpay IDs - show actual values (no fallbacks)
        razorpayOrderId: p.razorpayOrderId || null,
        razorpayPaymentId: p.razorpayPaymentId || null,
        razorpayPaymentLinkId: p.razorpayPaymentLinkId || null,
        razorpayPaymentLinkUrl: p.razorpayPaymentLinkUrl || null,
        // Transaction ID
        transactionId: p.transactionId || null,
        // Payer details
        payerEmail: p.payerEmail || null,
        payerPhone: p.payerPhone || null,
        payerName: p.payerName || null,
        // Dates
        paidAt: p.paidAt || null,
        startDate: p.startDate || null,
        endDate: p.endDate || null,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      })),
      stats: {
        totalPayments,
        totalRevenue,
        completedPayments,
        pendingPayments,
        failedPayments
      }
    });

  } catch (error) {
    console.error('Error fetching admin payments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payments' },
      { status: 500 }
    );
  }
}
