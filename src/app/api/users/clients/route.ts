import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import Message from '@/lib/db/models/Message';
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { computeClientStatusFromDocs } from '@/lib/status/computeClientStatus';
import mongoose from 'mongoose';

// GET /api/users/clients - Get clients for dietitians to book appointments 
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only dietitians, health counselors, and admins can access client list
    const userRole = session.user.role?.toLowerCase();
    const userId = session.user.id;

    if (userRole !== 'dietitian' && userRole !== 'health_counselor' && userRole !== 'health-counselor' && userRole !== 'healthcounselor' && !userRole?.includes('admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const limit = parseInt(searchParams.get('limit') || '100'); // Increased default limit
    const page = parseInt(searchParams.get('page') || '1');
    const viewAs = searchParams.get('viewAs') || '';

    // Build query
    let query: any = { role: UserRole.CLIENT };

    const isAdmin = userRole?.includes('admin');
    const isDietitian = userRole === 'dietitian';
    const isHealthCounselor = userRole === 'health_counselor' || userRole === 'health-counselor' || userRole === 'healthcounselor';

    // Determine the effective user to filter by
    // If admin is using viewAs param, look up that staff member and filter as them
    let effectiveUserId = userId;
    let effectiveIsDietitian = isDietitian;
    let effectiveIsHealthCounselor = isHealthCounselor;
    let effectiveIsAdmin = isAdmin;
    let viewAsRole = '';

    if (isAdmin && viewAs && mongoose.Types.ObjectId.isValid(viewAs)) {
      const staffUser = await User.findById(viewAs).select('role').lean();
      if (staffUser) {
        effectiveUserId = viewAs;
        // Use the raw role value and compare with UserRole enum values
        const staffRole = (staffUser as any).role;
        viewAsRole = staffRole;

        // Check against UserRole enum values (handles different case formats)
        effectiveIsDietitian = staffRole === UserRole.DIETITIAN || staffRole?.toLowerCase() === 'dietitian';
        effectiveIsHealthCounselor = staffRole === UserRole.HEALTH_COUNSELOR ||
          staffRole?.toLowerCase() === 'health_counselor' ||
          staffRole?.toLowerCase() === 'health-counselor' ||
          staffRole?.toLowerCase() === 'healthcounselor';

        // When viewAs is used, admin should NOT see all clients - force staff view
        effectiveIsAdmin = false;
      } else {
        // Staff user not found - return empty result for viewAs
        return NextResponse.json({
          clients: [],
          pagination: { page: 1, limit, total: 0, pages: 0 },
          error: 'Staff user not found for viewAs'
        });
      }
    }

    // Convert effectiveUserId to ObjectId for proper comparison
    const userObjectId = new mongoose.Types.ObjectId(effectiveUserId);

    // If dietitian, show their assigned clients AND clients they created
    if (effectiveIsDietitian) {
      query.$or = [
        { assignedDietitian: userObjectId },
        { assignedDietitians: userObjectId },
        { 'createdBy.userId': userObjectId }
      ];
    }
    // If health counselor, show their assigned clients AND clients they created
    else if (effectiveIsHealthCounselor) {
      query.$or = [
        { assignedHealthCounselor: userObjectId },
        { assignedHealthCounselors: userObjectId },
        { 'createdBy.userId': userObjectId }
      ];
    }
    // If viewAs was used but role didn't match dietitian/HC, still filter by that user
    else if (viewAs && !effectiveIsAdmin) {
      // Fallback: filter by both dietitian and HC fields for the viewAs user
      query.$or = [
        { assignedDietitian: userObjectId },
        { assignedDietitians: userObjectId },
        { assignedHealthCounselor: userObjectId },
        { assignedHealthCounselors: userObjectId },
        { 'createdBy.userId': userObjectId }
      ];
    }
    // Admin (without viewAs) can see all clients (no additional filter needed)

    // ── Parse all filter params ──
    const primaryDietitian = searchParams.get('primaryDietitian') || '';
    const secondaryDietitian = searchParams.get('secondaryDietitian') || '';
    const tagId = searchParams.get('tagId') || '';
    const dtAssignedFrom = searchParams.get('dtAssignedFrom') || '';
    const dtAssignedTo = searchParams.get('dtAssignedTo') || '';
    const hcAssignedFrom = searchParams.get('hcAssignedFrom') || '';
    const hcAssignedTo = searchParams.get('hcAssignedTo') || '';
    const planNameSearch = searchParams.get('planName') || '';
    const planDuration = searchParams.get('planDuration') || ''; // 'ongoing' or 'dateRange'
    const planDurationFrom = searchParams.get('planDurationFrom') || '';
    const planDurationTo = searchParams.get('planDurationTo') || '';
    const planStatus = searchParams.get('planStatus') || ''; // draft|active|completed|paused|cancelled
    const planShared = searchParams.get('planShared') || ''; // 'yes' or 'no'
    const lastActivityHCFrom = searchParams.get('lastActivityHCFrom') || '';
    const lastActivityHCTo = searchParams.get('lastActivityHCTo') || '';
    const lastActivityDTFrom = searchParams.get('lastActivityDTFrom') || '';
    const lastActivityDTTo = searchParams.get('lastActivityDTTo') || '';

    // ── Apply user-level filters ──
    if (primaryDietitian && mongoose.Types.ObjectId.isValid(primaryDietitian)) {
      query.assignedDietitian = new mongoose.Types.ObjectId(primaryDietitian);
    }
    if (secondaryDietitian && mongoose.Types.ObjectId.isValid(secondaryDietitian)) {
      query.assignedDietitians = new mongoose.Types.ObjectId(secondaryDietitian);
    }
    if (tagId && mongoose.Types.ObjectId.isValid(tagId)) {
      query.tags = new mongoose.Types.ObjectId(tagId);
    }

    // ── Collect client IDs from cross-collection filters ──
    // We'll intersect all cross-collection filter results
    let crossFilterClientIds: mongoose.Types.ObjectId[] | null = null;

    const intersect = (current: mongoose.Types.ObjectId[] | null, ids: mongoose.Types.ObjectId[]): mongoose.Types.ObjectId[] => {
      if (current === null) return ids;
      const idSet = new Set(ids.map(id => id.toString()));
      return current.filter(id => idSet.has(id.toString()));
    };

    // ── DT Assigned Date filter (clients created/assigned within date range) ──
    if (dtAssignedFrom || dtAssignedTo) {
      const dateQuery: any = {};
      if (dtAssignedFrom) dateQuery.$gte = new Date(dtAssignedFrom);
      if (dtAssignedTo) {
        const toDate = new Date(dtAssignedTo);
        toDate.setHours(23, 59, 59, 999);
        dateQuery.$lte = toDate;
      }
      // Use createdAt as proxy for assignment date (when client was created/added)
      const dtClients = await User.distinct('_id', {
        role: UserRole.CLIENT,
        assignedDietitian: { $exists: true, $ne: null },
        createdAt: dateQuery,
      });
      crossFilterClientIds = intersect(crossFilterClientIds, dtClients);
    }

    // ── HC Assigned Date filter ──
    if (hcAssignedFrom || hcAssignedTo) {
      const dateQuery: any = {};
      if (hcAssignedFrom) dateQuery.$gte = new Date(hcAssignedFrom);
      if (hcAssignedTo) {
        const toDate = new Date(hcAssignedTo);
        toDate.setHours(23, 59, 59, 999);
        dateQuery.$lte = toDate;
      }
      const hcClients = await User.distinct('_id', {
        role: UserRole.CLIENT,
        assignedHealthCounselor: { $exists: true, $ne: null },
        createdAt: dateQuery,
      });
      crossFilterClientIds = intersect(crossFilterClientIds, hcClients);
    }

    // ── Plan Name filter ──
    let planNameClientIds: mongoose.Types.ObjectId[] = [];
    if (planNameSearch) {
      const [paymentClients, mealPlanClients] = await Promise.all([
        UnifiedPayment.distinct('client', { planName: { $regex: planNameSearch, $options: 'i' } }),
        ClientMealPlan.distinct('clientId', { name: { $regex: planNameSearch, $options: 'i' } })
      ]);
      planNameClientIds = [...new Set([...paymentClients, ...mealPlanClients])];
      if (planNameClientIds.length === 0) {
        return NextResponse.json({
          clients: [],
          pagination: { page: 1, limit, total: 0, pages: 0 }
        });
      }
      crossFilterClientIds = intersect(crossFilterClientIds, planNameClientIds);
    }

    // ── Plan Duration filter ──
    if (planDuration === 'ongoing') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const ongoingClients = await ClientMealPlan.distinct('clientId', {
        status: 'active',
        endDate: { $gte: today },
      });
      crossFilterClientIds = intersect(crossFilterClientIds, ongoingClients);
    } else if (planDuration === 'dateRange' && (planDurationFrom || planDurationTo)) {
      const dateMatch: any = {};
      if (planDurationFrom) dateMatch.startDate = { $gte: new Date(planDurationFrom) };
      if (planDurationTo) {
        const toDate = new Date(planDurationTo);
        toDate.setHours(23, 59, 59, 999);
        dateMatch.endDate = { $lte: toDate };
      }
      const rangeClients = await ClientMealPlan.distinct('clientId', dateMatch);
      crossFilterClientIds = intersect(crossFilterClientIds, rangeClients);
    }

    // ── Plan Status filter ──
    if (planStatus) {
      const statusClients = await ClientMealPlan.distinct('clientId', { status: planStatus });
      crossFilterClientIds = intersect(crossFilterClientIds, statusClients);
    }

    // ── Plan Shared filter (shared = not draft) ──
    if (planShared === 'yes') {
      const sharedClients = await ClientMealPlan.distinct('clientId', { status: { $ne: 'draft' } });
      crossFilterClientIds = intersect(crossFilterClientIds, sharedClients);
    } else if (planShared === 'no') {
      // Clients who only have draft plans OR no plans
      const sharedClients = await ClientMealPlan.distinct('clientId', { status: { $ne: 'draft' } });
      const sharedSet = new Set(sharedClients.map((id: any) => id.toString()));
      const allPlanClients = await ClientMealPlan.distinct('clientId');
      const draftOnlyClients = allPlanClients.filter((id: any) => !sharedSet.has(id.toString()));
      crossFilterClientIds = intersect(crossFilterClientIds, draftOnlyClients);
    }

    // ── Last Activity by HC filter ──
    if (lastActivityHCFrom || lastActivityHCTo) {
      const hcStaffIds = await User.distinct('_id', { role: UserRole.HEALTH_COUNSELOR });
      const msgDateQuery: any = { sender: { $in: hcStaffIds } };
      if (lastActivityHCFrom) msgDateQuery.createdAt = { ...msgDateQuery.createdAt, $gte: new Date(lastActivityHCFrom) };
      if (lastActivityHCTo) {
        const toDate = new Date(lastActivityHCTo);
        toDate.setHours(23, 59, 59, 999);
        msgDateQuery.createdAt = { ...msgDateQuery.createdAt, $lte: toDate };
      }
      const hcActivityClients = await Message.distinct('receiver', msgDateQuery);
      crossFilterClientIds = intersect(crossFilterClientIds, hcActivityClients);
    }

    // ── Last Activity by DT filter ──
    if (lastActivityDTFrom || lastActivityDTTo) {
      const dtStaffIds = await User.distinct('_id', { role: UserRole.DIETITIAN });
      const msgDateQuery: any = { sender: { $in: dtStaffIds } };
      if (lastActivityDTFrom) msgDateQuery.createdAt = { ...msgDateQuery.createdAt, $gte: new Date(lastActivityDTFrom) };
      if (lastActivityDTTo) {
        const toDate = new Date(lastActivityDTTo);
        toDate.setHours(23, 59, 59, 999);
        msgDateQuery.createdAt = { ...msgDateQuery.createdAt, $lte: toDate };
      }
      const dtActivityClients = await Message.distinct('receiver', msgDateQuery);
      crossFilterClientIds = intersect(crossFilterClientIds, dtActivityClients);
    }

    // ── Apply cross-collection filter IDs to main query ──
    if (crossFilterClientIds !== null) {
      if (crossFilterClientIds.length === 0) {
        return NextResponse.json({
          clients: [],
          pagination: { page: 1, limit, total: 0, pages: 0 }
        });
      }
      if (query._id?.$in) {
        // Intersect with existing _id filter
        const existing = new Set(query._id.$in.map((id: any) => id.toString()));
        query._id.$in = crossFilterClientIds.filter(id => existing.has(id.toString()));
      } else {
        query._id = { $in: crossFilterClientIds };
      }
    }

    // Add status filter
    const statusFilter = searchParams.get('status') || '';
    if (statusFilter) {
      query.clientStatus = statusFilter;
    }

    // Add search filter - search by name, email, phone, clientId, ObjectId
    if (search) {
      const searchOrConditions: any[] = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { clientId: { $regex: search, $options: 'i' } },
      ];

      // Also search by ObjectId if it looks like a valid one
      if (mongoose.Types.ObjectId.isValid(search)) {
        searchOrConditions.push({ _id: new mongoose.Types.ObjectId(search) });
      }

      // Search by full name (first + last combined)
      const nameParts = search.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        searchOrConditions.push({
          $and: [
            { firstName: { $regex: nameParts[0], $options: 'i' } },
            { lastName: { $regex: nameParts.slice(1).join(' '), $options: 'i' } }
          ]
        });
      }

      // Also search by plan name via payments/meal plans
      const [searchPaymentClients, searchMealPlanClients] = await Promise.all([
        UnifiedPayment.distinct('client', { planName: { $regex: search, $options: 'i' } }),
        ClientMealPlan.distinct('clientId', { name: { $regex: search, $options: 'i' } })
      ]);
      const searchPlanClientIds = [...new Set([...searchPaymentClients, ...searchMealPlanClients])];
      if (searchPlanClientIds.length > 0) {
        searchOrConditions.push({ _id: { $in: searchPlanClientIds } });
      }

      const searchCondition = { $or: searchOrConditions };

      if (query.$or) {
        // Combine existing $or with search $or using $and
        const andConditions: any[] = [
          { $or: query.$or },
          searchCondition
        ];
        if (statusFilter) {
          andConditions.push({ clientStatus: statusFilter });
        }
        if (query._id) {
          andConditions.push({ _id: query._id });
        }
        query = {
          role: UserRole.CLIENT,
          $and: andConditions
        };
      } else {
        const newQuery = { ...query, ...searchCondition };
        query = newQuery;
      }
    }

    const clientsData = await User.find(query)
      .select('firstName lastName email avatar phone dateOfBirth gender height weight activityLevel healthGoals medicalConditions allergies dietaryRestrictions assignedDietitian assignedDietitians assignedHealthCounselor assignedHealthCounselors status clientStatus createdAt createdBy tags clientId')
      .populate('assignedDietitian', 'firstName lastName email avatar')
      .populate('assignedDietitians', 'firstName lastName email avatar')
      .populate('assignedHealthCounselor', 'firstName lastName email avatar')
      .populate('assignedHealthCounselors', 'firstName lastName email avatar')
      .populate('tags', 'name color icon')
      .populate({
        path: 'createdBy.userId',
        select: 'firstName lastName role',
        strictPopulate: false
      })
      .sort({ firstName: 1, lastName: 1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .lean();

    // Fetch meal plan data for all clients to get programStart, programEnd, lastDiet
    const clientIds = clientsData.map((c: any) => c._id);

    // Get meal plan info for each client - we need both overall program dates and active plan dates
    const mealPlanData = await ClientMealPlan.aggregate([
      { $match: { clientId: { $in: clientIds } } },
      { $sort: { startDate: 1 } },
      {
        $group: {
          _id: '$clientId',
          // First meal plan start date (earliest)
          programStart: { $first: '$startDate' },
          // Last meal plan end date (latest)
          programEnd: { $last: '$endDate' },
          // Last meal plan info for lastDiet display
          lastPlanDate: { $last: '$updatedAt' },
          lastPlanName: { $last: '$name' },
          lastPlanStatus: { $last: '$status' },
          // Collect all plans for active plan detection
          allPlans: {
            $push: {
              startDate: '$startDate',
              endDate: '$endDate',
              status: '$status',
              name: '$name'
            }
          }
        }
      }
    ]);

    // Create a map of clientId to meal plan data
    const mealPlanMap = new Map();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    mealPlanData.forEach((mp: any) => {
      // Find the active plan with endDate in the future (for status display)
      const activePlan = mp.allPlans?.find((plan: any) => {
        const end = new Date(plan.endDate);
        end.setHours(23, 59, 59, 999);
        return plan.status === 'active' && end >= today;
      });

      mealPlanMap.set(mp._id.toString(), {
        programStart: mp.programStart,
        programEnd: mp.programEnd,
        lastDiet: mp.lastPlanDate ? `${mp.lastPlanName || 'Diet Plan'}` : null,
        // Active plan dates - these are used to determine status
        activePlanStartDate: activePlan?.startDate || null,
        activePlanEndDate: activePlan?.endDate || null,
        activePlanName: activePlan?.name || null
      });
    });

    // Fetch payment data for all clients to determine LEAD vs ACTIVE vs INACTIVE
    const paymentData = await UnifiedPayment.aggregate([
      { $match: { client: { $in: clientIds }, $or: [{ status: { $in: ['paid', 'completed', 'active'] } }, { paymentStatus: 'paid' }] } },
      { $group: { _id: '$client', count: { $sum: 1 } } }
    ]);
    const paidClientIds = new Set(paymentData.map((p: any) => p._id.toString()));

    // Fetch all active meal plans to check validity
    const allMealPlans = await ClientMealPlan.find(
      { clientId: { $in: clientIds } },
      { clientId: 1, startDate: 1, endDate: 1, status: 1 }
    ).lean();

    // Group meal plans by clientId
    const mealPlansByClient = new Map<string, Array<{ startDate: Date | string; endDate: Date | string; status: string }>>();
    allMealPlans.forEach((mp: any) => {
      const cid = mp.clientId.toString();
      if (!mealPlansByClient.has(cid)) mealPlansByClient.set(cid, []);
      mealPlansByClient.get(cid)!.push({ startDate: mp.startDate, endDate: mp.endDate, status: mp.status });
    });

    // Compute status and build bulk update ops
    const bulkOps: any[] = [];

    // Merge meal plan data + computed status into clients
    const clients = clientsData.map((client: any) => {
      const mealData = mealPlanMap.get(client._id.toString());
      const cid = client._id.toString();

      // Compute status dynamically
      const hasPaid = paidClientIds.has(cid);
      const plans = mealPlansByClient.get(cid) || [];
      const payments = hasPaid ? [{ status: 'paid' }] : [];
      const computedStatus = computeClientStatusFromDocs(payments, plans);

      // Queue a DB update if status changed (fire-and-forget)
      if (client.clientStatus !== computedStatus) {
        bulkOps.push({
          updateOne: {
            filter: { _id: client._id },
            update: { $set: { clientStatus: computedStatus } }
          }
        });
      }

      return {
        ...client,
        clientStatus: computedStatus,
        // Overall program dates (first start to last end)
        programStart: mealData?.programStart || null,
        programEnd: mealData?.programEnd || null,
        // Active plan dates - these determine the status
        mealPlanStartDate: mealData?.activePlanStartDate || null,
        mealPlanEndDate: mealData?.activePlanEndDate || null,
        activePlanName: mealData?.activePlanName || null,
        lastDiet: mealData?.lastDiet || null
      };
    });

    // Persist updated statuses in the background
    if (bulkOps.length > 0) {
      User.bulkWrite(bulkOps).catch(err => console.error('Bulk status update error:', err));
    }

    const total = await User.countDocuments(query);

    return NextResponse.json({
      clients,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      debug: process.env.NODE_ENV === 'development' ? {
        userRole,
        userId,
        viewAs: viewAs || null,
        viewAsRole: viewAsRole || null,
        effectiveUserId,
        effectiveIsDietitian,
        effectiveIsHealthCounselor,
        effectiveIsAdmin,
        queryUsed: JSON.stringify(query),
        totalFound: total
      } : undefined
    });

  } catch (error: any) {
    console.error('[GET /api/users/clients] Error:', {
      errorName: error?.name,
      errorMessage: error?.message,
      errorStack: error?.stack?.split('\n').slice(0, 3).join('\n')
    });

    return NextResponse.json(
      {
        error: 'Failed to fetch clients',
        details: process.env.NODE_ENV === 'development' ? error?.message : undefined
      },
      { status: 500 }
    );
  }
}