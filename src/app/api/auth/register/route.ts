import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import { UserRole } from '@/types';
import { z } from 'zod';
import { clearCacheByTag } from '@/lib/api/utils';
import { logActivity } from '@/lib/utils/activityLogger';
import crypto from 'crypto';
import { validateOptionalEmail, validatePhoneNumber } from '@/lib/validations/contact';

// Comprehensive registration schema for API
const registerSchema = z.object({
  signupContext: z.enum(['client', 'staff']).optional(),
  createdByStaff: z.boolean().optional(), // Flag to indicate staff is creating a client
  email: z.string().optional(), // Email optional for staff-created clients
  password: z.string().min(4, 'Password must be at least 4 characters').optional(),
  confirmPassword: z.string().optional(),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  role: z.enum([UserRole.CLIENT, UserRole.HEALTH_COUNSELOR, UserRole.DIETITIAN]),
  phone: z.string().min(1, 'Phone number is required'),

  // Dietitian/Health Counselor specific fields
  credentials: z.array(z.string()).optional(),
  specializations: z.array(z.string()).optional(),
  experience: z.number().min(0).optional(),
  bio: z.string().max(1000).optional(),
  consultationFee: z.number().min(0).optional(),

  // Client specific fields (kept for compatibility)
  dateOfBirth: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  height: z.number().min(30, 'Height must be at least 30 cm').max(250, 'Height cannot exceed 250 cm').optional(),
  weight: z.number().min(20, 'Weight must be at least 20 kg').max(300, 'Weight cannot exceed 300 kg').optional(),
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']).optional(),
  healthGoals: z.array(z.string()).optional(),
  medicalConditions: z.array(z.string()).optional(),
  allergies: z.array(z.string()).optional(),
  dietaryRestrictions: z.array(z.string()).optional(),
  assignedDietitian: z.string().optional(),
  assignedHealthCounselor: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validatedData = registerSchema.parse(body);

    // If this request came from the auth UIs, enforce intent:
    // - staff signup page must not create client accounts
    // - client signup page must not create staff accounts
    if (validatedData.signupContext === 'staff' && validatedData.role === UserRole.CLIENT) {
      return NextResponse.json({ error: 'Registration failed' }, { status: 400 });
    }
    if (validatedData.signupContext === 'client' && validatedData.role !== UserRole.CLIENT) {
      return NextResponse.json({ error: 'Registration failed' }, { status: 400 });
    }

    await connectDB();

    // Get session to check if an authenticated user (dietitian/health counselor) is creating a client
    const session = await getServerSession(authOptions);

    // Check if user already exists by email (only if email is provided)
    const emailValidation = validateOptionalEmail(validatedData.email);
    if (!emailValidation.isValid) {
      return NextResponse.json(
        { error: emailValidation.error || 'Invalid email address' },
        { status: 400 }
      );
    }

    if (emailValidation.normalized) {
      const existingUser = await User.findOne({
        email: emailValidation.normalized
      });

      if (existingUser) {
        return NextResponse.json(
          { error: 'User with this email already exists' },
          { status: 400 }
        );
      }
    }

    // Normalize phone number with country code
    const phoneValidation = validatePhoneNumber(validatedData.phone, '+91');
    if (!phoneValidation.isValid || !phoneValidation.normalized) {
      return NextResponse.json(
        { error: phoneValidation.error || 'Invalid phone number' },
        { status: 400 }
      );
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

    // Check if phone number already exists (check all variations)
    const existingPhone = await User.findOne({
      phone: { $in: phoneVariations }
    });

    if (existingPhone) {
      return NextResponse.json(
        { error: 'This phone number is already registered with another account' },
        { status: 409 }
      );
    }

    // Verify password confirmation if provided
    if (validatedData.confirmPassword && validatedData.password !== validatedData.confirmPassword) {
      return NextResponse.json(
        { error: 'Passwords do not match' },
        { status: 400 }
      );
    }

    // Determine if this is a staff-created client (email and password not required)
    const isStaffCreatedClient = validatedData.createdByStaff && validatedData.role === UserRole.CLIENT;

    // For self-registration, email and password are required
    // For staff-created clients, auto-generate password if not provided
    let finalPassword: string;
    if (isStaffCreatedClient) {
      // Auto-generate a random 16-character hex password for staff-created clients
      finalPassword = validatedData.password || crypto.randomBytes(8).toString('hex');
    } else {
      // Self-registration: password is required
      if (!validatedData.password) {
        return NextResponse.json(
          { error: 'Password is required' },
          { status: 400 }
        );
      }
      // Self-registration: email is required
      if (!emailValidation.normalized) {
        return NextResponse.json(
          { error: 'Email is required' },
          { status: 400 }
        );
      }
      finalPassword = validatedData.password;
    }

    // Create user data
    const userData: any = {
      email: emailValidation.normalized,
      password: finalPassword,
      firstName: validatedData.firstName,
      lastName: validatedData.lastName,
      role: validatedData.role,
      phone: normalizedPhone,
      // Self-registered users have createdBy.role = 'self', unless created by dietitian/health counselor
      createdBy: { role: 'self' }
    };

    // Add role-specific fields
    if (validatedData.role === UserRole.DIETITIAN) {
      userData.credentials = validatedData.credentials || [];
      userData.specializations = validatedData.specializations || [];
      userData.experience = validatedData.experience;
      userData.bio = validatedData.bio;
      userData.consultationFee = validatedData.consultationFee;
    } else if (validatedData.role === UserRole.CLIENT) {
      // Generate sequential clientId for clients using aggregation for proper numeric sorting
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
      userData.clientId = `C-${nextNumber}`;

      if (validatedData.dateOfBirth) {
        userData.dateOfBirth = new Date(validatedData.dateOfBirth);
      }
      userData.gender = validatedData.gender;
      userData.height = validatedData.height;
      userData.weight = validatedData.weight;
      userData.activityLevel = validatedData.activityLevel;
      userData.healthGoals = validatedData.healthGoals || [];
      userData.medicalConditions = validatedData.medicalConditions || [];
      userData.allergies = validatedData.allergies || [];
      userData.dietaryRestrictions = validatedData.dietaryRestrictions || [];
      userData.notes = validatedData.notes;

      // If authenticated dietitian or health counselor is creating a client, auto-assign them
      if (session?.user) {
        const userRole = session.user.role?.toLowerCase();
        if (userRole === 'dietitian') {
          // Auto-assign to the dietitian creating the client
          const dietitianId = validatedData?.assignedDietitian || session.user.id;
          userData.assignedDietitian = dietitianId;
          userData.assignedDietitians = [dietitianId];
          userData.createdBy = { userId: session.user.id, role: 'dietitian' };
        } else if (userRole === 'health_counselor') {
          // Auto-assign to the health counselor creating the client
          const hcId = validatedData?.assignedHealthCounselor || session.user.id;
          userData.assignedHealthCounselor = hcId;
          userData.assignedHealthCounselors = [hcId];
          userData.createdBy = { userId: session.user.id, role: 'health_counselor' };
        } else if (userRole === 'admin') {
          userData.assignedDietitian = validatedData.assignedDietitian;
          if (validatedData.assignedDietitian) {
            userData.assignedDietitians = [validatedData.assignedDietitian];
          }
          userData.createdBy = { userId: session.user.id, role: 'admin' };
        }
      } else {
        // No session - use the passed in values
        userData.assignedDietitian = validatedData.assignedDietitian;
        if (validatedData.assignedDietitian) {
          userData.assignedDietitians = [validatedData.assignedDietitian];
        }
      }
    }

    // Create user
    const user = new User(userData);
    await user.save();

    // Clear caches so admin portal and staff dashboards see new client immediately
    clearCacheByTag('users');
    clearCacheByTag('admin');
    clearCacheByTag('clients');
    clearCacheByTag('stats');

    // Log activity
    const creatorId = session?.user?.id || user._id.toString();
    const creatorRole = session?.user?.role || 'self';
    const creatorName = session?.user?.name || `${validatedData.firstName} ${validatedData.lastName}`;
    const creatorEmail = session?.user?.email || validatedData.email || `${validatedData.phone}`;

    logActivity({
      userId: creatorId,
      userRole: (creatorRole === 'self' ? 'client' : creatorRole) as any,
      userName: creatorName,
      userEmail: creatorEmail,
      action: 'create_user',
      actionType: 'create',
      category: 'auth',
      description: session?.user
        ? `Created new ${validatedData.role} account: ${validatedData.firstName} ${validatedData.lastName}`
        : `New ${validatedData.role} registration: ${validatedData.firstName} ${validatedData.lastName}`,
      targetUserId: user._id.toString(),
      targetUserName: `${validatedData.firstName} ${validatedData.lastName}`,
      details: {
        userRole: validatedData.role,
        email: validatedData.email,
        selfRegistered: !session?.user
      }
    }).catch(console.error);

    // Return user without password
    const userResponse = user.toJSON();
    delete userResponse.password;

    return NextResponse.json(
      {
        message: 'User registered successfully',
        user: userResponse
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Registration error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation error',
          details: error.issues
        },
        { status: 400 }
      );
    }

    if (error instanceof Error && error.message.includes('E11000')) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
