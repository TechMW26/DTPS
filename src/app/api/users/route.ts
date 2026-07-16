import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { socketManager } from '@/lib/realtime/socket-manager';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { logActivity } from '@/lib/utils/activityLogger';
import { computeClientStatusFromDocs } from '@/lib/status/computeClientStatus';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import { validateOptionalEmail, validatePhoneNumber } from '@/lib/validations/contact';
import { Types } from 'mongoose';

// Helper function to validate if a string is a valid ObjectId
function isValidObjectId(id: any): boolean {
  if (!id) return false;
  if (typeof id === 'object' && id instanceof Types.ObjectId) return true;
  if (typeof id !== 'string') return false;
  return Types.ObjectId.isValid(id) && String(new Types.ObjectId(id)) === id;
}

function normalizeObjectId(id: unknown): string | null {
  if (!id) return null;

  if (id instanceof Types.ObjectId) {
    return id.toString();
  }

  if (typeof id === 'string' && Types.ObjectId.isValid(id)) {
    try {
      return new Types.ObjectId(id).toString();
    } catch {
      return null;
    }
  }

  if (typeof id === 'object' && id !== null && '_id' in (id as Record<string, unknown>)) {
    return normalizeObjectId((id as Record<string, unknown>)._id);
  }

  return null;
}

// Helper function to recompute client statuses for a list of clients
async function recomputeClientStatuses(clients: any[]): Promise<any[]> {
  const clientIds = clients.filter(u => u.role === UserRole.CLIENT).map(u => u._id.toString());
  if (clientIds.length === 0) return clients;

  // Batch fetch successful purchases (with dates) for all clients.
  // Status is derived from the subscription Expected End Date — not meal plans.
  const purchases = await UnifiedPayment.find({
    client: { $in: clientIds },
    $or: [
      { status: { $in: ['paid', 'completed', 'active'] } },
      { paymentStatus: 'paid' }
    ]
  }).select('client status paymentStatus expectedEndDate endDate').lean();

  // Group purchases by client
  const purchasesByClient = new Map<string, any[]>();
  purchases.forEach((p: any) => {
    const cid = p.client.toString();
    if (!purchasesByClient.has(cid)) purchasesByClient.set(cid, []);
    purchasesByClient.get(cid)!.push(p);
  });

  // Recompute status for each client (manual HOLD overrides computed status)
  const updatedClients = clients.map((user: any) => {
    if (user.role !== UserRole.CLIENT) return user;

    const clientIdStr = user._id.toString();
    const clientPurchases = purchasesByClient.get(clientIdStr) || [];
    const isOnHold = !!user.holdStatus?.isOnHold;

    const newStatus = computeClientStatusFromDocs(clientPurchases, isOnHold);

    // Update in background if status changed (don't await)
    if (user.clientStatus !== newStatus) {
      User.findByIdAndUpdate(user._id, { clientStatus: newStatus }).catch(() => { });
    }

    return { ...user, clientStatus: newStatus };
  });

  return updatedClients;
}

// GET /api/users - Get users (for dietitians to see clients, admins to see all)
export async function GET(request: NextRequest) {
  try {
    // Run auth + DB connection in PARALLEL
    const [session] = await Promise.all([
      getServerSession(authOptions),
      connectDB()
    ]);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const search = searchParams.get('search');
    const statusFilter = searchParams.get('status'); // active, inactive, lead, suspended
    const dateFrom = searchParams.get('dateFrom'); // ISO date string
    const dateTo = searchParams.get('dateTo'); // ISO date string
    const dietitianId = searchParams.get('dietitianId'); // primary dietitian filter
    const healthCounselorId = searchParams.get('healthCounselorId'); // primary HC filter
    const limit = parseInt(searchParams.get('limit') || '50');
    const page = parseInt(searchParams.get('page') || '1');
    const viewAll = searchParams.get('viewAll') === 'true';
    const noCache = searchParams.get('noCache') === 'true';

    const computedClientStatuses = new Set(['lead', 'active', 'inactive', 'hold']);
    const shouldFilterByComputedClientStatus =
      session.user.role === UserRole.ADMIN &&
      !!statusFilter &&
      computedClientStatuses.has(statusFilter);

    let query: any = {};

    const sessionUserId = session.user.id;
    const normalizedSessionUserId = normalizeObjectId(sessionUserId);

    // Role-based access control
    if (session.user.role === UserRole.DIETITIAN) {
      if (!normalizedSessionUserId) {
        return NextResponse.json({ error: 'Invalid user id in session' }, { status: 400 });
      }

      // Dietitians can see only their assigned clients (including from array)
      query = {
        role: UserRole.CLIENT,
        $or: [
          { assignedDietitian: normalizedSessionUserId },
          { assignedDietitians: normalizedSessionUserId }
        ]
      };
    } else if (session.user.role === UserRole.HEALTH_COUNSELOR) {
      if (!normalizedSessionUserId) {
        return NextResponse.json({ error: 'Invalid user id in session' }, { status: 400 });
      }

      // Health Counselors can see all clients when role=client is passed
      if (role === 'client') {
        query = { role: UserRole.CLIENT };
      } else {
        // Default: show only assigned clients
        query = {
          role: UserRole.CLIENT,
          $or: [
            { assignedDietitian: normalizedSessionUserId },
            { assignedDietitians: normalizedSessionUserId }
          ]
        };
      }
    } else if (session.user.role === UserRole.CLIENT) {
      if (!normalizedSessionUserId) {
        return NextResponse.json({ error: 'Invalid user id in session' }, { status: 400 });
      }

      // Clients can see only their assigned dietitian
      const currentUserRaw = await User.findById(normalizedSessionUserId).select('assignedDietitian').lean();
      const currentUser = currentUserRaw as { _id: unknown; assignedDietitian?: unknown } | null;

      const assignedDietitianId = normalizeObjectId(currentUser?.assignedDietitian);
      if (assignedDietitianId) {
        // Show only assigned dietitian
        query = {
          _id: assignedDietitianId
        };
      } else {
        // If no assigned dietitian, show all dietitians and health counselors
        query = {
          role: { $in: [UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR] }
        };
      }
    } else if (session.user.role === UserRole.ADMIN) {
      // Admins can see all users
      if (role) {
        query.role = role;
      }
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Admin-level filters: status, date range, assigned dietitian, assigned health counselor
    if (session.user.role === UserRole.ADMIN) {
      // Status filter (supports clientStatus for clients, account status for staff)
      if (statusFilter && !shouldFilterByComputedClientStatus) {
        if (!query.$and) query.$and = [];
        query.$and.push({
          $or: [
            { clientStatus: statusFilter },
            { status: statusFilter }
          ]
        });
      }

      // Date range filter on createdAt
      if (dateFrom || dateTo) {
        const dateCondition: any = {};
        if (dateFrom) dateCondition.$gte = new Date(dateFrom);
        if (dateTo) {
          const toDate = new Date(dateTo);
          toDate.setHours(23, 59, 59, 999);
          dateCondition.$lte = toDate;
        }
        if (!query.$and) query.$and = [];
        query.$and.push({ createdAt: dateCondition });
      }

      // Primary dietitian filter
      if (dietitianId) {
        if (!isValidObjectId(dietitianId)) {
          return NextResponse.json({ error: 'Invalid dietitianId' }, { status: 400 });
        }
        if (!query.$and) query.$and = [];
        query.$and.push({ assignedDietitian: new Types.ObjectId(dietitianId) });
      }

      // Primary health counselor filter
      if (healthCounselorId) {
        if (!isValidObjectId(healthCounselorId)) {
          return NextResponse.json({ error: 'Invalid healthCounselorId' }, { status: 400 });
        }
        if (!query.$and) query.$and = [];
        query.$and.push({ assignedHealthCounselor: new Types.ObjectId(healthCounselorId) });
      }
    }

    // Search functionality
    if (search && search.trim()) {
      // Escape special regex characters to avoid regex errors
      const normalizedSearch = search.trim();
      const escapedSearch = normalizedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchCondition: { $or: any[] } = {
        $or: [
          { firstName: { $regex: escapedSearch, $options: 'i' } },
          { lastName: { $regex: escapedSearch, $options: 'i' } },
          { email: { $regex: escapedSearch, $options: 'i' } },
          { phone: { $regex: escapedSearch, $options: 'i' } },
          { clientId: { $regex: escapedSearch, $options: 'i' } }
        ]
      };

      // Phone-friendly search (ignores formatting characters)
      const digitsOnly = normalizedSearch.replace(/\D/g, '');
      if (digitsOnly.length >= 6) {
        // Use \+ to escape the + character in regex
        const phonePatterns = Array.from(new Set([
          digitsOnly,
          `\\+91${digitsOnly}`,
          `91${digitsOnly}`
        ]));
        for (const pattern of phonePatterns) {
          searchCondition.$or.push({ phone: { $regex: pattern, $options: 'i' } });
        }
      }

      // Also try full name search (first + last combined)
      const nameParts = normalizedSearch.split(/\s+/);
      if (nameParts.length >= 2) {
        const firstNameRegex = nameParts[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const lastNameRegex = nameParts.slice(1).join(' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        searchCondition.$or.push({
          $and: [
            { firstName: { $regex: firstNameRegex, $options: 'i' } },
            { lastName: { $regex: lastNameRegex, $options: 'i' } }
          ]
        });

        // Also support reversed input: "Last First"
        searchCondition.$or.push({
          $and: [
            { firstName: { $regex: lastNameRegex, $options: 'i' } },
            { lastName: { $regex: firstNameRegex, $options: 'i' } }
          ]
        });
      }

      if (query.$or) {
        // If query has $or (from role-based access), preserve it and add search to $and
        if (!query.$and) query.$and = [];
        query.$and.push({ $or: query.$or });
        query.$and.push(searchCondition);
        delete query.$or;
      } else if (query.$and) {
        // If query already has $and (from admin filters), add search condition to it
        query.$and.push(searchCondition);
      } else {
        // Otherwise, merge search with existing query conditions
        query = { ...query, ...searchCondition };
      }
    }

    // For admin users, include password field; for others, exclude it
    // Always include clientStatus for proper client engagement tracking
    const selectFields = session.user.role === UserRole.ADMIN ? '+clientStatus' : '-password +clientStatus';

    const loadUsersData = async () => {
      const usersQuery = User.find(query)
        .select(selectFields)
        .sort({ createdAt: -1 });

      const rawUsers = shouldFilterByComputedClientStatus
        ? await usersQuery.lean()
        : await usersQuery
          .limit(limit)
          .skip((page - 1) * limit)
          .lean();

      const relatedUserIds = new Set<string>();

      for (const user of rawUsers as any[]) {
        const assignedDietitianId = normalizeObjectId(user?.assignedDietitian);
        if (assignedDietitianId) relatedUserIds.add(assignedDietitianId);

        const assignedHealthCounselorId = normalizeObjectId(user?.assignedHealthCounselor);
        if (assignedHealthCounselorId) relatedUserIds.add(assignedHealthCounselorId);

        if (Array.isArray(user?.assignedDietitians)) {
          for (const id of user.assignedDietitians) {
            const normalizedId = normalizeObjectId(id);
            if (normalizedId) relatedUserIds.add(normalizedId);
          }
        }

        if (Array.isArray(user?.assignedHealthCounselors)) {
          for (const id of user.assignedHealthCounselors) {
            const normalizedId = normalizeObjectId(id);
            if (normalizedId) relatedUserIds.add(normalizedId);
          }
        }
      }

      const relatedUsers = relatedUserIds.size > 0
        ? await User.find({ _id: { $in: Array.from(relatedUserIds).map((id) => new Types.ObjectId(id)) } })
          .select('firstName lastName')
          .lean()
        : [];

      const relatedUsersMap = new Map((relatedUsers as any[]).map((u) => [u._id.toString(), u]));

      const users = (rawUsers as any[]).map((user: any) => {
        const assignedDietitianId = normalizeObjectId(user?.assignedDietitian);
        const assignedHealthCounselorId = normalizeObjectId(user?.assignedHealthCounselor);

        const assignedDietitians = Array.isArray(user?.assignedDietitians)
          ? user.assignedDietitians
            .map((id: unknown) => normalizeObjectId(id))
            .filter((id: string | null): id is string => !!id)
            .map((id: string) => relatedUsersMap.get(id))
            .filter(Boolean)
          : [];

        const assignedHealthCounselors = Array.isArray(user?.assignedHealthCounselors)
          ? user.assignedHealthCounselors
            .map((id: unknown) => normalizeObjectId(id))
            .filter((id: string | null): id is string => !!id)
            .map((id: string) => relatedUsersMap.get(id))
            .filter(Boolean)
          : [];

        return {
          ...user,
          assignedDietitian: assignedDietitianId ? relatedUsersMap.get(assignedDietitianId) || null : null,
          assignedDietitians,
          assignedHealthCounselor: assignedHealthCounselorId ? relatedUsersMap.get(assignedHealthCounselorId) || null : null,
          assignedHealthCounselors
        };
      });

      const total = await User.countDocuments(query);

      const [adminsCount, dietitiansCount, healthCounselorsCount, clientsCount, latestClientIdAgg] = await Promise.all([
        User.countDocuments({ role: UserRole.ADMIN }),
        User.countDocuments({ role: UserRole.DIETITIAN }),
        User.countDocuments({ role: UserRole.HEALTH_COUNSELOR }),
        User.countDocuments({ role: UserRole.CLIENT }),
        User.aggregate([
          { $match: { role: UserRole.CLIENT, clientId: { $exists: true, $ne: null, $regex: /^C-\d+$/ } } },
          { $project: { clientIdNum: { $toInt: { $substr: ['$clientId', 2, -1] } } } },
          { $sort: { clientIdNum: -1 } },
          { $limit: 1 }
        ])
      ]);

      const latestClientIdNumber =
        latestClientIdAgg.length > 0 && latestClientIdAgg[0]?.clientIdNum
          ? latestClientIdAgg[0].clientIdNum
          : 0;

      return { users, total, adminsCount, dietitiansCount, healthCounselorsCount, clientsCount, latestClientIdNumber };
    };

    // Generate cache key based on role and query params
    const cacheKey = `users:v3:${session.user.role}:${role || 'all'}:${search || ''}:${statusFilter || ''}:${dateFrom || ''}:${dateTo || ''}:${dietitianId || ''}:${healthCounselorId || ''}:${page}:${limit}`;

    const { users, total, adminsCount, dietitiansCount, healthCounselorsCount, clientsCount, latestClientIdNumber } = noCache
      ? await loadUsersData()
      : await withCache(
        cacheKey,
        loadUsersData,
        { ttl: 120000, tags: ['users'] }
      );

    // For admin users, we need to manually serialize to include passwords
    let serializedUsers;
    if (session.user.role === UserRole.ADMIN) {
      serializedUsers = users.map((user: any) => {
        return {
          ...user,
          password: user.password // Explicitly include password for admin
        };
      });
    } else {
      serializedUsers = users;
    }

    // Recompute client statuses to ensure accuracy (for clients in the list)
    const usersWithFreshStatus = await recomputeClientStatuses(serializedUsers);

    let responseUsers = usersWithFreshStatus;
    let responseTotal = total;

    // For client status filters, apply filter AFTER recompute so stale persisted
    // values don't cause missing rows; then paginate in-memory.
    if (shouldFilterByComputedClientStatus && statusFilter) {
      const filteredUsers = usersWithFreshStatus.filter((user: any) => {
        const userRoleValue = String(user?.role || '');
        return userRoleValue === UserRole.CLIENT && String(user?.clientStatus || '').toLowerCase() === statusFilter;
      });

      responseTotal = filteredUsers.length;
      const start = (page - 1) * limit;
      responseUsers = filteredUsers.slice(start, start + limit);
    }

    return NextResponse.json({
      users: responseUsers,
      pagination: {
        page,
        limit,
        total: responseTotal,
        pages: Math.ceil(responseTotal / limit)
      },
      roleCounts: {
        admin: adminsCount,
        dietitian: dietitiansCount,
        healthCounselor: healthCounselorsCount,
        client: clientsCount
      },
      clientStats: {
        latestClientIdNumber
      }
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

// POST /api/users - Create new user (admin, dietitian, or health counselor can create clients)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Allow admin, dietitian, and health counselor to create users
    const allowedRoles = [UserRole.ADMIN, UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR];
    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { email, password, firstName, lastName, role, phone, bio, experience, consultationFee, specializations, credentials, gender, dateOfBirth, assignedDietitian, assignedHealthCounselor } = body || {};

    // For clients created by staff, email is optional but phone is required
    const isClientRole = (role || UserRole.CLIENT) === UserRole.CLIENT;

    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'First name and last name are required' }, { status: 400 });
    }

    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    const emailValidation = validateOptionalEmail(email);
    if (!emailValidation.isValid) {
      return NextResponse.json({ error: emailValidation.error || 'Invalid email address' }, { status: 400 });
    }

    // For non-client roles, email and password are still required
    if (!isClientRole) {
      if (!email) {
        return NextResponse.json({ error: 'Email is required for staff accounts' }, { status: 400 });
      }
      if (!password || String(password).length < 4) {
        return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 });
      }
    }

    await connectDB();

    // Check email uniqueness only if email is provided
    if (email) {
      const existing = await User.findOne({ email: String(email).toLowerCase() });
      if (existing) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
      }
    }

    const phoneValidation = validatePhoneNumber(String(phone), '+91');
    if (!phoneValidation.isValid || !phoneValidation.normalized) {
      return NextResponse.json({ error: phoneValidation.error || 'Invalid phone number' }, { status: 400 });
    }
    const normalizedPhone = phoneValidation.normalized;

    // Extract raw 10-digit phone number for search
    // DB stores phones in mixed formats (10-digit, +91, 91)
    const rawPhone = normalizedPhone.replace(/^\+91/, '').replace(/^91/, '');

    // Create phone variations to search (different formats in DB)
    const phoneVariations = [
      rawPhone,                           // 9876543210 (most common in DB)
      normalizedPhone,                    // +919876543210
      normalizedPhone.replace('+', ''),   // 919876543210
      '+91' + rawPhone,                   // +919876543210
    ];

    // Check if phone number is already registered (check all variations)
    const existingPhone = await User.findOne({ phone: { $in: phoneVariations } });
    if (existingPhone) {
      return NextResponse.json({ error: 'This phone number is already registered with another account' }, { status: 409 });
    }

    // For clients, auto-generate password if not provided
    let finalPassword = password;
    if (isClientRole && !password) {
      // Generate a random secure password (12 chars)
      const crypto = require('crypto');
      finalPassword = crypto.randomBytes(8).toString('hex');
    }

    // Determine assignment based on who is creating the client
    // Normalize the session role for comparison (handle both string and enum)
    const sessionRole = String(session.user.role).toLowerCase();

    let finalAssignedDietitian = assignedDietitian;
    let finalAssignedHealthCounselor = assignedHealthCounselor;
    let assignedDietitiansList = assignedDietitian ? [assignedDietitian] : [];
    let assignedHealthCounselorsList = assignedHealthCounselor ? [assignedHealthCounselor] : [];

    // If health counselor is creating a client, auto-assign to themselves as health counselor (not dietitian)
    if (sessionRole === 'health_counselor') {
      finalAssignedHealthCounselor = session.user.id;
      assignedHealthCounselorsList = [session.user.id];
      // Clear any dietitian assignment that might have been passed
      if (!assignedDietitian) {
        finalAssignedDietitian = undefined;
        assignedDietitiansList = [];
      }
    }
    // If dietitian is creating a client, auto-assign to themselves as dietitian (not health counselor)
    else if (sessionRole === 'dietitian') {
      finalAssignedDietitian = session.user.id;
      assignedDietitiansList = [session.user.id];
      // Clear any health counselor assignment that might have been passed
      if (!assignedHealthCounselor) {
        finalAssignedHealthCounselor = undefined;
        assignedHealthCounselorsList = [];
      }
    }

    // Determine createdBy info based on who is creating the user
    let createdByInfo: { userId?: string; role: string } = { role: '' };
    if (sessionRole === 'admin') {
      createdByInfo = { userId: session.user.id, role: 'admin' };
    } else if (sessionRole === 'dietitian') {
      createdByInfo = { userId: session.user.id, role: 'dietitian' };
    } else if (sessionRole === 'health_counselor') {
      createdByInfo = { userId: session.user.id, role: 'health_counselor' };
    }

    // Generate sequential clientId for clients
    let newClientId: string | undefined;
    if ((role || UserRole.CLIENT) === UserRole.CLIENT) {
      // Find the highest existing clientId number using aggregation for proper numeric sorting
      const result = await User.aggregate([
        { $match: { role: UserRole.CLIENT, clientId: { $exists: true, $ne: null, $regex: /^C-\d+$/ } } },
        { $project: { clientIdNum: { $toInt: { $substr: ['$clientId', 2, -1] } } } },
        { $sort: { clientIdNum: -1 } },
        { $limit: 1 }
      ]);

      let nextNumber = 1;
      if (result.length > 0 && result[0].clientIdNum) {
        nextNumber = result[0].clientIdNum + 1;
      }
      newClientId = `C-${nextNumber}`;
    }

    const user = new User({
      email: emailValidation.normalized,
      password: finalPassword, // Auto-generated for clients, provided for staff
      firstName,
      lastName,
      role: role || UserRole.CLIENT,
      clientId: newClientId,
      phone: normalizedPhone,
      bio,
      experience,
      consultationFee,
      specializations,
      credentials,
      gender,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      assignedDietitian: finalAssignedDietitian,
      assignedDietitians: assignedDietitiansList,
      assignedHealthCounselor: finalAssignedHealthCounselor,
      assignedHealthCounselors: assignedHealthCounselorsList,
      createdBy: createdByInfo,
      status: 'active'
    });

    await user.save();

    // If a client was created, broadcast SSE update to admin connections
    if ((role || UserRole.CLIENT) === UserRole.CLIENT) {
      // Populate references for the broadcast
      await user.populate('assignedDietitian', 'firstName lastName email avatar');
      await user.populate('assignedDietitians', 'firstName lastName email avatar');
      await user.populate('assignedHealthCounselor', 'firstName lastName email avatar');
      await user.populate({
        path: 'createdBy.userId',
        select: 'firstName lastName role',
        strictPopulate: false
      });

      // Recalculate stats
      const total = await User.countDocuments({ role: UserRole.CLIENT });
      const assignedCount = await User.countDocuments({
        role: UserRole.CLIENT,
        $or: [
          { assignedDietitian: { $ne: null } },
          { assignedDietitians: { $exists: true, $not: { $size: 0 } } }
        ]
      });
      const unassignedCount = await User.countDocuments({
        role: UserRole.CLIENT,
        assignedDietitian: null,
        $or: [
          { assignedDietitians: { $exists: false } },
          { assignedDietitians: { $size: 0 } }
        ]
      });

      socketManager.broadcastClientUpdate('client_added', {
        client: user.toObject(),
        stats: {
          total,
          assigned: assignedCount,
          unassigned: unassignedCount
        },
        timestamp: Date.now()
      });
    }

    // Clear users cache after creation
    clearCacheByTag('users');
    // Also clear admin/clients cache so admin portal sees new clients immediately
    clearCacheByTag('admin');
    clearCacheByTag('clients');
    clearCacheByTag('stats');

    // Log activity for user creation
    logActivity({
      userId: session.user.id,
      userRole: session.user.role as 'admin' | 'dietitian' | 'health_counselor' | 'client',
      userName: session.user.name || session.user.email || 'Staff',
      userEmail: session.user.email || '',
      action: 'create_user',
      actionType: 'create',
      category: 'profile',
      description: `Created new ${role || 'client'}: ${firstName} ${lastName} (${email})`,
      targetUserId: user._id.toString(),
      targetUserName: `${firstName} ${lastName}`,
      details: {
        newUserRole: role || UserRole.CLIENT,
        newUserEmail: email,
        assignedDietitian: finalAssignedDietitian,
        assignedHealthCounselor: finalAssignedHealthCounselor,
      },
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    const created = user.toJSON();
    delete (created as any).password;

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}


// PUT /api/users - Update user profile
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    await connectDB();

    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Update allowed fields based on role
    const allowedFields = [
      'firstName', 'lastName', 'phone', 'avatar', 'bio',
      'dateOfBirth', 'gender', 'height', 'weight', 'activityLevel',
      'healthGoals', 'medicalConditions', 'allergies', 'dietaryRestrictions'
    ];

    // Dietitians can also update professional fields
    if (session.user.role === UserRole.DIETITIAN) {
      allowedFields.push(
        'credentials', 'specializations', 'experience',
        'consultationFee', 'availability'
      );
    }

    // Filter body to only include allowed fields
    const updateData = Object.keys(body)
      .filter(key => allowedFields.includes(key))
      .reduce((obj: any, key) => {
        obj[key] = body[key];
        return obj;
      }, {});

    Object.assign(user, updateData);
    await user.save();

    // Clear users cache after update
    clearCacheByTag('users');
    // Also clear admin/clients cache so admin portal reflects updates
    clearCacheByTag('admin');
    clearCacheByTag('clients');
    clearCacheByTag('stats');

    // Return user without password
    const updatedUser = user.toJSON();
    delete updatedUser.password;

    return NextResponse.json(updatedUser);

  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
}
