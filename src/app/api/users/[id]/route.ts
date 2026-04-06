import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import AdminAuditLog from '@/lib/db/models/AdminAuditLog';
import Tag from '@/lib/db/models/Tag'; // Ensure Tag model is registered
import Task from '@/lib/db/models/Task'; // Ensure Task model is registered
import { UserRole } from '@/types';
import { withCache, clearCacheByTag } from '@/lib/api/utils';
import { logActivity } from '@/lib/utils/activityLogger';

// Helper function to log admin actions
async function logAdminAction(
  adminId: string,
  adminEmail: string,
  action: string,
  targetUserId: string,
  targetUserEmail?: string,
  targetUserRole?: string,
  changes?: Record<string, { old: any; new: any }>,
  request?: NextRequest
) {
  try {
    await AdminAuditLog.create({
      adminId,
      adminEmail,
      action,
      targetUserId,
      targetUserEmail,
      targetUserRole,
      changes,
      ipAddress: request?.headers.get('x-forwarded-for') || request?.headers.get('x-real-ip') || 'unknown',
      userAgent: request?.headers.get('user-agent') || 'unknown'
    });
  } catch (error) {
    console.error('Failed to log admin action:', error);
    // Don't throw - audit logging failure shouldn't break the main operation
  }
}

// GET /api/users/[id] - Get specific user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    // Validate ObjectId format
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return NextResponse.json(
        { error: 'Invalid user ID format' },
        { status: 400 }
      );
    }

    const user = await withCache(
      `users:id:${JSON.stringify(id)}`,
      async () => await User.findById(id)
        .select('-password')
        .populate('assignedDietitian', 'firstName lastName email avatar')
        .populate('assignedDietitians', 'firstName lastName email avatar')
        .populate('assignedHealthCounselor', 'firstName lastName email avatar')
        .populate('assignedHealthCounselors', 'firstName lastName email avatar')
        .populate('tags', 'name description color icon')
        .populate({
          path: 'createdBy.userId',
          select: 'firstName lastName role',
          strictPopulate: false
        }),
      { ttl: 120000, tags: ['users'] }
    );

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user has access to view this profile

    const hasAccess =
      session.user.role === UserRole.ADMIN ||
      session.user.id === id ||
      ((session.user.role === UserRole.DIETITIAN || session.user.role === UserRole.HEALTH_COUNSELOR) &&
        user.role === UserRole.CLIENT) || // Allow dietitians/health counselors to view any client
      (session.user.role === UserRole.CLIENT &&
        (user.role === UserRole.DIETITIAN || user.role === UserRole.HEALTH_COUNSELOR)) || // Allow clients to view dietitians/health counselors
      ((session.user.role === UserRole.DIETITIAN || session.user.role === UserRole.HEALTH_COUNSELOR) &&
        (user.role === UserRole.DIETITIAN || user.role === UserRole.HEALTH_COUNSELOR)); // Allow dietitians/health counselors to view each other



    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ user });

  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

// PUT /api/users/[id] - Update specific user (admin only)
// export async function PUT(
//   request: NextRequest,
//   { params }: { params: Promise<{ id: string }> }
// ) {
//   try {
//     const session = await getServerSession(authOptions);
//     if (!session?.user) {
//       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
//     }

//     const { id } = await params;
//     // Only admins can update other users, or users can update themselves
//     if (session.user.role !== UserRole.ADMIN && session.user.id !== id) {
//       return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
//     }

//     const body = await request.json();
//     await connectDB();

//     const user = await User.findById(id);
//     if (!user) {
//       return NextResponse.json(
//         { error: 'User not found' },
//         { status: 404 }
//       );
//     }

//     // Define allowed fields based on user permissions
//     let allowedFields = [
//       'firstName', 'lastName', 'phone', 'avatar', 'bio', 'status',
//       'dateOfBirth', 'gender', 'height', 'weight', 'activityLevel',
//       'healthGoals', 'medicalConditions', 'allergies', 'dietaryRestrictions',
//       'credentials', 'specializations', 'experience', 'consultationFee',
//       'availability', 'assignedDietitian'
//     ];

//     // Only admins can update roles
//     if (session.user.role === 'admin') {
//       allowedFields.push('role');
//     }

//     // Filter body to only include allowed fields
//     const updateData = Object.keys(body)
//       .filter(key => allowedFields.includes(key))
//       .reduce((obj: any, key) => {
//         obj[key] = body[key];
//         return obj;
//       }, {});

//     Object.assign(user, updateData);
//     await user.save();

//     // Return user without password
//     const updatedUser = user.toJSON();
//     delete updatedUser.password;

//     return NextResponse.json(updatedUser);

//   } catch (error) {
//     console.error('Error updating user:', error);
//     return NextResponse.json(
//       { error: 'Failed to update user' },
//       { status: 500 }
//     );
//   }
// }

// PATCH /api/users/[id] - Partial update for status toggle
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectDB();
    const { id } = await params;

    const { status } = await request.json();

    if (!status || !['active', 'inactive'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status value. Must be "active" or "inactive"' },
        { status: 400 }
      );
    }

    const user = await User.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).select('-password');

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Clear cache
    await clearCacheByTag('users');

    // Log activity
    logActivity({
      userId: session.user.id,
      userRole: session.user.role as 'admin' | 'dietitian' | 'health_counselor' | 'client',
      userName: session.user.name || session.user.email || 'Admin',
      userEmail: session.user.email || '',
      action: `user_status_${status}`,
      actionType: 'update',
      category: 'profile',
      description: `Changed user status to ${status} for ${user.email}`,
      targetUserId: id,
      targetUserName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      changeDetails: [{ fieldName: 'status', oldValue: user.status, newValue: status }],
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      user,
      message: `User ${status === 'active' ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    return NextResponse.json(
      { error: 'Failed to update user status' },
      { status: 500 }
    );
  }
}

// DELETE /api/users/[id] - Deactivate user (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectDB();
    const { id } = await params;

    const user = await User.findById(id);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Toggle user status between active and inactive
    const oldStatus = user.status;
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    user.status = newStatus;
    await user.save();

    // Clear cache
    await clearCacheByTag('users');

    // Log admin action
    await logAdminAction(
      session.user.id,
      session.user.email || 'unknown',
      newStatus === 'active' ? 'activate_user' : 'deactivate_user',
      id,
      user.email,
      user.role,
      { status: { old: oldStatus, new: newStatus } },
      request
    );

    const action = newStatus === 'active' ? 'activated' : 'deactivated';
    const actionMessage = newStatus === 'active'
      ? `${user.firstName || user.email} has been reactivated successfully. They can now log in.`
      : `${user.firstName || user.email} (${user.role}) has been deactivated. They will be logged out on their next page refresh or login attempt.`;

    // Log activity for toggle status
    logActivity({
      userId: session.user.id,
      userRole: session.user.role as 'admin' | 'dietitian' | 'health_counselor' | 'client',
      userName: session.user.name || session.user.email || 'Admin',
      userEmail: session.user.email || '',
      action: newStatus === 'active' ? 'activate_user' : 'deactivate_user',
      actionType: 'update',
      category: 'profile',
      description: `${newStatus === 'active' ? 'Activated' : 'Deactivated'} user ${user.email}`,
      targetUserId: id,
      targetUserName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      changeDetails: [{ fieldName: 'status', oldValue: oldStatus, newValue: newStatus }],
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    // Note: If user was deactivated, their session will be automatically invalidated on next page refresh
    // due to the session callback in auth/config.ts checking user status
    return NextResponse.json({
      success: true,
      message: actionMessage,
      status: newStatus,
      action: newStatus === 'active' ? 'activated' : 'deactivated',
      userEmail: user.email,
      userRole: user.role,
      userName: user.firstName || user.lastName || 'User'
    });

  } catch (error) {
    console.error('Error deactivating user:', error);
    return NextResponse.json(
      { error: 'Failed to deactivate user' },
      { status: 500 }
    );
  }
}

// PUT /api/users/[id] - Update specific user
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    await connectDB();

    // Fetch target user BEFORE permission check
    const targetUser = await User.findById(id);
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Permission Logic:
    const isAdmin = session.user.role === UserRole.ADMIN;
    const isSelf = session.user.id === id;

    // Dietitian can update ONLY their assigned clients (including from assignedDietitians array)
    const isDietitianEditingClient =
      session.user.role === UserRole.DIETITIAN &&
      targetUser.role === UserRole.CLIENT &&
      (targetUser.assignedDietitian?.toString() === session.user.id ||
        targetUser.assignedDietitians?.some((d: any) => d?.toString() === session.user.id));

    // Health Counselor can update ONLY their assigned clients (including from assignedHealthCounselors array)
    const isHealthCounselorEditingClient =
      session.user.role === UserRole.HEALTH_COUNSELOR &&
      targetUser.role === UserRole.CLIENT &&
      (targetUser.assignedHealthCounselor?.toString() === session.user.id ||
        targetUser.assignedHealthCounselors?.some((hc: any) => hc?.toString() === session.user.id));

    // Debug logging for permission issues
    if (!isAdmin && !isSelf && !isDietitianEditingClient && !isHealthCounselorEditingClient) {
      console.log('[PUT /api/users] Permission denied:', {
        sessionUserId: session.user.id,
        sessionUserRole: session.user.role,
        targetUserId: id,
        targetUserRole: targetUser.role,
        assignedDietitian: targetUser.assignedDietitian?.toString(),
        assignedDietitians: targetUser.assignedDietitians?.map((d: any) => d?.toString()),
        assignedHealthCounselor: targetUser.assignedHealthCounselor?.toString(),
        assignedHealthCounselors: targetUser.assignedHealthCounselors?.map((hc: any) => hc?.toString()),
      });
      return NextResponse.json({ error: "Forbidden - You are not assigned to this client" }, { status: 403 });
    }

    // Admin-only fields that can be updated
    const adminOnlyFields = ["email", "phone", "role", "status", "clientStatus", "expectedStartDate", "expectedEndDate"];

    // Allowed fields to update (only User model fields)
    let allowedFields = [
      // Basic Info
      "firstName",
      "lastName",
      "avatar",
      "bio",
      "dateOfBirth",
      "gender",
      "parentAccount",
      "alternativePhone",
      "alternativeEmail",
      "anniversary",
      "source",
      "referralSource",
      "maritalStatus",
      "occupation",
      "targetWeightBucket",
      "sharePhotoConsent",
      "generalGoal",
      "healthGoals",
      // Physical measurements
      "height",
      "weight",
      "heightFeet",
      "heightInch",
      "heightCm",
      "weightKg",
      "targetWeightKg",
      "activityLevel",
      "activityRate",
      "bmr",
      "bodyFat",
      "idealWeight",
      "targetBmi",
      "bmiCategory",
      // Professional fields (for dietitians/health counselors)
      "credentials",
      "specializations",
      "experience",
      "consultationFee",
      "availability",
      "timezone",
      // Assignment fields
      "assignedDietitian",
      "assignedDietitians",
      "assignedHealthCounselor",
      "assignedHealthCounselors",
      // Tags
      "tags"
    ];

    // Add admin-only fields if user is admin
    if (isAdmin) {
      allowedFields = [...allowedFields, ...adminOnlyFields];
    }

    // Validate email uniqueness if being updated
    if (isAdmin && body.email && body.email !== targetUser.email) {
      const existingUser = await User.findOne({
        email: body.email.toLowerCase(),
        _id: { $ne: id }
      });
      if (existingUser) {
        return NextResponse.json({ error: "Email already exists" }, { status: 400 });
      }
    }

    // Validate phone uniqueness if being updated
    if (isAdmin && body.phone && body.phone !== targetUser.phone) {
      const existingUser = await User.findOne({
        phone: body.phone,
        _id: { $ne: id }
      });
      if (existingUser) {
        return NextResponse.json({ error: "Phone number already exists" }, { status: 400 });
      }
    }

    // FIX: Skip empty values (especially enums)
    const updateData = Object.keys(body)
      .filter((key) => allowedFields.includes(key))
      .reduce((obj: any, key) => {
        const value = body[key];
        if (value === "" || value === null) return obj;
        // Special handling for generalGoal enum - handle 'none' and dynamic categories
        if (key === 'generalGoal') {
          // If 'none' or empty, convert to empty string (clears the field)
          if (value === 'none' || !value) {
            obj[key] = '';
            return obj;
          }
          // Accept dynamic goal categories (from admin-defined goals) as well as standard ones
          // We'll store whatever value is sent - validation is relaxed to allow dynamic categories
          obj[key] = value;
          return obj;
        }
        // Special handling for status
        if (key === 'status' && value) {
          const validStatuses = ['active', 'inactive', 'suspended'];
          if (!validStatuses.includes(value)) {
            return obj;
          }
        }
        // Special handling for clientStatus
        if (key === 'clientStatus' && value) {
          const validClientStatuses = ['lead', 'active', 'inactive', 'leading', 'onboarding', 'paused'];
          if (!validClientStatuses.includes(value)) {
            return obj;
          }
        }
        obj[key] = value;
        return obj;
      }, {});

    // First weight permission + lock rules
    if (body.weightKg !== undefined) {
      const incomingWeight = parseFloat(String(body.weightKg));
      if (!Number.isFinite(incomingWeight) || incomingWeight <= 0) {
        return NextResponse.json({ error: 'Weight must be a positive number' }, { status: 400 });
      }

      const currentRole = session.user.role as UserRole;
      const canStaffEditFirstWeight = isAdmin || currentRole === UserRole.DIETITIAN;
      const isClientSelfEdit = isSelf && currentRole === UserRole.CLIENT;

      const firstWeightValue = Number((targetUser as any)?.firstWeight?.value || 0);
      const legacyWeightValue = parseFloat(String((targetUser as any)?.weightKg || '0'));
      const hasBaseline = (Number.isFinite(firstWeightValue) && firstWeightValue > 0)
        || (Number.isFinite(legacyWeightValue) && legacyWeightValue > 0);

      if (canStaffEditFirstWeight) {
        const actor = isAdmin ? 'admin' : 'dietitian';
        const existingSetBy = (targetUser as any)?.firstWeight?.setBy;
        const existingSetDate = (targetUser as any)?.firstWeight?.setDate;

        updateData.weightKg = String(incomingWeight);
        updateData.weight = incomingWeight;
        updateData.firstWeight = {
          value: incomingWeight,
          setBy: existingSetBy || actor,
          setDate: existingSetDate || new Date(),
          isLocked: true,
          lastUpdatedBy: actor,
          lastUpdateDate: new Date(),
        };
      } else if (isClientSelfEdit) {
        if (hasBaseline) {
          const baseline = (Number.isFinite(firstWeightValue) && firstWeightValue > 0)
            ? firstWeightValue
            : legacyWeightValue;

          if (Math.abs(incomingWeight - baseline) > 0.0001) {
            return NextResponse.json(
              { error: 'First weight is locked. Please contact your dietitian to update it.' },
              { status: 403 }
            );
          }

          // Backfill metadata for legacy profiles
          if (!(Number.isFinite(firstWeightValue) && firstWeightValue > 0) && Number.isFinite(legacyWeightValue) && legacyWeightValue > 0) {
            updateData.firstWeight = {
              value: legacyWeightValue,
              setBy: 'client',
              setDate: new Date(),
              isLocked: true,
              lastUpdatedBy: 'client',
              lastUpdateDate: new Date(),
            };
          }
          updateData.weightKg = String(baseline);
          updateData.weight = baseline;
        } else {
          // Client first-time set
          updateData.weightKg = String(incomingWeight);
          updateData.weight = incomingWeight;
          updateData.firstWeight = {
            value: incomingWeight,
            setBy: 'client',
            setDate: new Date(),
            isLocked: true,
            lastUpdatedBy: 'client',
            lastUpdateDate: new Date(),
          };
        }
      } else {
        return NextResponse.json(
          { error: 'Only your dietitian can update first weight.' },
          { status: 403 }
        );
      }
    }


    // Store original values before update for audit logging
    const originalValues: Record<string, any> = {};
    const changedFields: Record<string, { old: any; new: any }> = {};

    Object.keys(updateData).forEach(key => {
      originalValues[key] = (targetUser as any)[key];
    });

    Object.assign(targetUser, updateData);
    await targetUser.save();

    // Calculate what actually changed for audit log
    Object.keys(updateData).forEach(key => {
      const oldVal = originalValues[key];
      const newVal = updateData[key];
      // Only log if value actually changed
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changedFields[key] = { old: oldVal, new: newVal };
      }
    });

    // Clear cache after update
    await clearCacheByTag('users');

    // Log admin action if admin made changes
    if (isAdmin && Object.keys(changedFields).length > 0) {
      // Determine action type
      let actionTypeStr = 'update_user';
      if (changedFields.status) {
        if (changedFields.status.new === 'suspended') actionTypeStr = 'suspend_user';
        else if (changedFields.status.new === 'inactive') actionTypeStr = 'deactivate_user';
        else if (changedFields.status.new === 'active') actionTypeStr = 'activate_user';
        else actionTypeStr = 'change_status';
      }
      if (changedFields.role) {
        actionTypeStr = 'change_role';
      }

      await logAdminAction(
        session.user.id,
        session.user.email || 'unknown',
        actionTypeStr,
        id,
        targetUser.email,
        targetUser.role,
        changedFields,
        request
      );
    }

    // Log activity for any update (admin, dietitian, health counselor)
    if (Object.keys(changedFields).length > 0) {
      const changeDetailsList = Object.entries(changedFields).map(([field, vals]) => ({
        fieldName: field,
        oldValue: vals.old,
        newValue: vals.new,
      }));

      logActivity({
        userId: session.user.id,
        userRole: session.user.role as 'admin' | 'dietitian' | 'health_counselor' | 'client',
        userName: session.user.name || session.user.email || 'User',
        userEmail: session.user.email || '',
        action: 'update_user_profile',
        actionType: 'update',
        category: 'profile',
        description: `Updated user profile for ${targetUser.email} - ${Object.keys(changedFields).join(', ')}`,
        targetUserId: id,
        targetUserName: `${targetUser.firstName || ''} ${targetUser.lastName || ''}`.trim() || targetUser.email,
        changeDetails: changeDetailsList,
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      });
    }

    const updatedUser = targetUser?.toJSON();
    delete updatedUser.password;

    return NextResponse.json({
      user: updatedUser,
      message: "User updated successfully"
    });
  } catch (error: any) {
    console.error("Error updating user:", error);

    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e: any) => e.message);
      return NextResponse.json(
        { error: messages.join(', ') },
        { status: 400 }
      );
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return NextResponse.json(
        { error: `${field} already exists` },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || "Failed to update user" },
      { status: 500 }
    );
  }
}


// Post /api/users/[id] - Update the document for specific user
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { type, fileName, filePath } = body;

    if (!type || !fileName || !filePath) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await connectDB();
    const user = await withCache(
      `users:id:${JSON.stringify(id)}`,
      async () => await User.findById(id),
      { ttl: 120000, tags: ['users'] }
    );

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ----------------------
    // PERMISSION CHECK
    // ----------------------
    const isAdmin = session.user.role === UserRole.ADMIN;
    const isSelf = session.user.id === id;
    const isDietitianAssigned =
      session.user.role === UserRole.DIETITIAN &&
      (user.assignedDietitian?.toString() === session.user.id ||
        user.assignedDietitians?.some((d: { toString: () => string }) => d.toString() === session.user.id));

    if (!isAdmin && !isSelf && !isDietitianAssigned) {
      return NextResponse.json({ error: "Forbidden: You cannot upload documents for this user" }, { status: 403 });
    }

    // ----------------------
    // ADD DOCUMENT
    // ----------------------
    user.documents.push({
      type,
      fileName,
      filePath,
      uploadedAt: new Date(),
    });

    await user.save();

    return NextResponse.json({ message: "Document uploaded successfully", documents: user.documents });
  } catch (error) {
    console.error("Error uploading document:", error);
    return NextResponse.json({ error: "Failed to upload document" }, { status: 500 });
  }
}