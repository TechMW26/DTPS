import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { UserRole, ClientStatus } from '@/types';
import { adminSSEManager } from '@/lib/realtime/admin-sse-manager';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { logActivity } from '@/lib/utils/activityLogger';
import { computeClientStatus } from '@/lib/status/computeClientStatus';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';

// Helper function to recompute client statuses for a list of clients
async function recomputeClientStatuses(clients: any[]): Promise<any[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const clientIds = clients.filter(u => u.role === UserRole.CLIENT).map(u => u._id.toString());
  if (clientIds.length === 0) return clients;

  // Batch fetch payments and meal plans for all clients
  const [payments, mealPlans] = await Promise.all([
    UnifiedPayment.find({
      client: { $in: clientIds },
      $or: [
        { status: { $in: ['paid', 'completed', 'active'] } },
        { paymentStatus: 'paid' }
      ]
    }).select('client').lean(),
    ClientMealPlan.find({
      clientId: { $in: clientIds },
      status: 'active',
      endDate: { $gte: today }
    }).select('clientId startDate endDate status').lean()
  ]);

  // Create lookup maps
  const clientPayments = new Set(payments.map((p: any) => p.client.toString()));
  const clientMealPlansMap = new Map<string, any>();
  mealPlans.forEach((plan: any) => {
    clientMealPlansMap.set(plan.clientId.toString(), plan);
  });

  // Recompute status for each client
  const updatedClients = clients.map((user: any) => {
    if (user.role !== UserRole.CLIENT) return user;

    const clientIdStr = user._id.toString();
    const hasSuccessfulPayment = clientPayments.has(clientIdStr);
    const activePlan = clientMealPlansMap.get(clientIdStr) || null;

    const newStatus = computeClientStatus({
      hasSuccessfulPayment,
      activePlan: activePlan ? {
        startDate: activePlan.startDate,
        endDate: activePlan.endDate,
        status: activePlan.status
      } : null
    });

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
    const limit = parseInt(searchParams.get('limit') || '50');
    const page = parseInt(searchParams.get('page') || '1');
    const viewAll = searchParams.get('viewAll') === 'true';

    let query: any = {};

    // Role-based access control
    if (session.user.role === UserRole.DIETITIAN) {
      // Dietitians can see only their assigned clients (including from array)
      query = {
        role: UserRole.CLIENT,
        $or: [
          { assignedDietitian: session.user.id },
          { assignedDietitians: session.user.id }
        ]
      };
    } else if (session.user.role === UserRole.HEALTH_COUNSELOR) {
      // Health Counselors can see all clients when role=client is passed
      if (role === 'client') {
        query = { role: UserRole.CLIENT };
      } else {
        // Default: show only assigned clients
        query = {
          role: UserRole.CLIENT,
          $or: [
            { assignedDietitian: session.user.id },
            { assignedDietitians: session.user.id }
          ]
        };
      }
    } else if (session.user.role === UserRole.CLIENT) {
      // Clients can see only their assigned dietitian
      const currentUserRaw = await User.findById(session.user.id).select('assignedDietitian').lean();
      const currentUser = currentUserRaw as { _id: unknown; assignedDietitian?: unknown } | null;

      if (currentUser?.assignedDietitian) {
        // Show only assigned dietitian
        query = {
          _id: currentUser.assignedDietitian
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

    // Search functionality
    if (search) {
      const searchCondition = {
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { clientId: { $regex: search, $options: 'i' } }
        ]
      };

      if (query.$or) {
        // Preserve assignment $or by wrapping both in $and
        query = {
          ...query,
          $or: undefined,
          $and: [
            { $or: query.$or },
            searchCondition
          ]
        };
      } else {
        query = { ...query, ...searchCondition };
      }
    }

    // For admin users, include password field; for others, exclude it
    // Always include clientStatus for proper client engagement tracking
    const selectFields = session.user.role === UserRole.ADMIN ? '+clientStatus' : '-password +clientStatus';

    // Generate cache key based on role and query params
    const cacheKey = `users:${session.user.role}:${role || 'all'}:${search || ''}:${page}:${limit}`;

    const { users, total, adminsCount, dietitiansCount, healthCounselorsCount, clientsCount } = await withCache(
      cacheKey,
      async () => {
        const users = await User.find(query)
          .select(selectFields)
          .sort({ createdAt: -1 })
          .limit(limit)
          .skip((page - 1) * limit)
          .lean();

        const total = await User.countDocuments(query);

        const [adminsCount, dietitiansCount, healthCounselorsCount, clientsCount] = await Promise.all([
          User.countDocuments({ role: UserRole.ADMIN }),
          User.countDocuments({ role: UserRole.DIETITIAN }),
          User.countDocuments({ role: UserRole.HEALTH_COUNSELOR }),
          User.countDocuments({ role: UserRole.CLIENT })
        ]);

        return { users, total, adminsCount, dietitiansCount, healthCounselorsCount, clientsCount };
      },
      { ttl: 120000, tags: ['users'] } // 2 minutes TTL
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

    return NextResponse.json({
      users: usersWithFreshStatus,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      roleCounts: {
        admin: adminsCount,
        dietitian: dietitiansCount,
        healthCounselor: healthCounselorsCount,
        client: clientsCount
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

    // Normalize phone number - remove spaces and dashes
    let normalizedPhone = String(phone).replace(/[\s\-\(\)]/g, '');
    // Ensure it starts with + (country code)
    if (!normalizedPhone.startsWith('+')) {
      normalizedPhone = '+91' + normalizedPhone;
    }

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
      email: email ? String(email).toLowerCase() : undefined,
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

      adminSSEManager.broadcastClientUpdate('client_added', {
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
