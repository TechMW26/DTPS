import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import dbConnect from '@/lib/db/connect';
import User from '@/lib/db/models/User';
import { ServicePlan } from '@/lib/db/models/ServicePlan';
import mongoose from 'mongoose';
import { withCache, clearCacheByTag } from '@/lib/api/utils';

// Schema for purchase requests
const purchaseRequestSchema = new mongoose.Schema({
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dietitian: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  servicePlan: { type: mongoose.Schema.Types.ObjectId, ref: 'ServicePlan', required: true },
  pricingTierId: { type: String, required: true },
  planName: { type: String, required: true },
  planCategory: { type: String, required: true },
  durationDays: { type: Number, required: true },
  durationLabel: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'completed'], 
    default: 'pending' 
  },
  notes: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Get or create the model
const PurchaseRequest = mongoose.models.PurchaseRequest || 
  mongoose.model('PurchaseRequest', purchaseRequestSchema);

// POST - Create a purchase request (user expressing interest in a plan)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const body = await request.json();
    const { servicePlanId, pricingTierId, notes } = body;

    if (!servicePlanId || !pricingTierId) {
      return NextResponse.json({ 
        error: 'Service plan and pricing tier are required' 
      }, { status: 400 });
    }

    // Get the service plan
    const servicePlan = await withCache(
      `client:purchase-request:${JSON.stringify(servicePlanId)}`,
      async () => await ServicePlan.findById(servicePlanId),
      { ttl: 120000, tags: ['client'] }
    );
    if (!servicePlan || !servicePlan.isActive) {
      return NextResponse.json({ error: 'Service plan not found or inactive' }, { status: 404 });
    }

    // Find the pricing tier
    const pricingTier = servicePlan.pricingTiers.find(
      (t: any) => t._id.toString() === pricingTierId
    );
    if (!pricingTier || !pricingTier.isActive) {
      return NextResponse.json({ error: 'Pricing tier not found or inactive' }, { status: 404 });
    }

    // Get the client's assigned dietitian
    const client = await withCache(
      `client:purchase-request:${JSON.stringify(session.user.id)}`,
      async () => await User.findById(session.user.id)
      .select('assignedDietitian assignedDietitians firstName lastName email'),
      { ttl: 120000, tags: ['client'] }
    );
    
    const dietitianId = client?.assignedDietitian || client?.assignedDietitians?.[0];

    // Check if there's already a pending request for this plan
    const existingRequest = await withCache(
      `client:purchase-request:${JSON.stringify({
      client: session.user.id,
      servicePlan: servicePlanId,
      pricingTierId,
      status: 'pending'
    })}`,
      async () => await PurchaseRequest.findOne({
      client: session.user.id,
      servicePlan: servicePlanId,
      pricingTierId,
      status: 'pending'
    }),
      { ttl: 120000, tags: ['client'] }
    );

    if (existingRequest) {
      return NextResponse.json({ 
        error: 'You already have a pending request for this plan',
        existingRequest 
      }, { status: 400 });
    }

    // Create the purchase request
    const purchaseRequest = new PurchaseRequest({
      client: session.user.id,
      dietitian: dietitianId,
      servicePlan: servicePlanId,
      pricingTierId,
      planName: servicePlan.name,
      planCategory: servicePlan.category,
      durationDays: pricingTier.durationDays,
      durationLabel: pricingTier.durationLabel,
      amount: pricingTier.amount,
      notes,
      status: 'pending'
    });

    await purchaseRequest.save();

    return NextResponse.json({
      success: true,
      message: 'Purchase request submitted successfully. Your dietitian will be notified.',
      purchaseRequest: {
        _id: purchaseRequest._id,
        planName: purchaseRequest.planName,
        durationLabel: purchaseRequest.durationLabel,
        amount: purchaseRequest.amount,
        status: purchaseRequest.status
      }
    });

  } catch (error) {
    console.error('Error creating purchase request:', error);
    return NextResponse.json({ error: 'Failed to create purchase request' }, { status: 500 });
  }
}

// GET - Get user's purchase requests
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const purchaseRequests = await withCache(
      `client:purchase-request:${JSON.stringify({
      client: session.user.id
    })}`,
      async () => await PurchaseRequest.find({
      client: session.user.id
    })
    .populate('servicePlan', 'name category description')
    .sort({ createdAt: -1 }),
      { ttl: 120000, tags: ['client'] }
    );

    return NextResponse.json({
      success: true,
      purchaseRequests
    });

  } catch (error) {
    console.error('Error fetching purchase requests:', error);
    return NextResponse.json({ error: 'Failed to fetch purchase requests' }, { status: 500 });
  }
}
