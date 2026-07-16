import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import { AppointmentType, AppointmentMode } from '@/lib/db/models/AppointmentConfig';
import { UserRole } from '@/types';
import { z } from 'zod';

// Validation schemas
const appointmentTypeSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  duration: z.number().default(60),
  color: z.string().optional(),
  icon: z.string().optional(),
  isActive: z.boolean().default(true),
  order: z.number().default(0)
});

const appointmentModeSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  icon: z.string().optional(),
  requiresMeetingLink: z.boolean().default(false),
  requiresLocation: z.boolean().default(false),
  isActive: z.boolean().default(true),
  order: z.number().default(0)
});

function normalizeDuration(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 60;
}

// Helper to generate slug
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_');
}

// ============ GET - Fetch appointment types and modes ============
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const resource = searchParams.get('resource'); // 'types' | 'modes' | 'all'
    const activeOnly = searchParams.get('activeOnly') === 'true';

    const query = activeOnly ? { isActive: true } : {};

    let types: any[] = [];
    let modes: any[] = [];

    if (!resource || resource === 'all' || resource === 'types') {
      types = await AppointmentType.find(query).sort({ order: 1, name: 1 }).lean();
    }

    if (!resource || resource === 'all' || resource === 'modes') {
      modes = await AppointmentMode.find(query).sort({ order: 1, name: 1 }).lean();
    }

    return NextResponse.json({
      types,
      modes
    });

  } catch (error) {
    console.error('Error fetching appointment config:', error);
    return NextResponse.json({ error: 'Failed to fetch appointment configuration' }, { status: 500 });
  }
}

// ============ POST - Create appointment type or mode ============
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admin can create types/modes
    if (session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Only admin can create appointment configurations' }, { status: 403 });
    }

    await connectDB();

    const body = await request.json();
    const { resource, ...data } = body;

    if (!resource || !['type', 'mode'].includes(resource)) {
      return NextResponse.json({ error: 'Invalid resource type. Use "type" or "mode"' }, { status: 400 });
    }

    if (resource === 'type') {
      const validated = appointmentTypeSchema.parse({
        ...data,
        duration: normalizeDuration(data.duration)
      });
      const slug = generateSlug(validated.name);

      // Check if slug already exists
      const existing = await AppointmentType.findOne({ slug });
      if (existing) {
        return NextResponse.json({ error: 'An appointment type with this name already exists' }, { status: 409 });
      }

      const appointmentType = new AppointmentType({
        ...validated,
        slug
      });
      await appointmentType.save();

      return NextResponse.json({
        message: 'Appointment type created successfully',
        type: appointmentType
      }, { status: 201 });

    } else {
      const validated = appointmentModeSchema.parse(data);
      const slug = generateSlug(validated.name);

      // Check if slug already exists
      const existing = await AppointmentMode.findOne({ slug });
      if (existing) {
        return NextResponse.json({ error: 'An appointment mode with this name already exists' }, { status: 409 });
      }

      const appointmentMode = new AppointmentMode({
        ...validated,
        slug
      });
      await appointmentMode.save();

      return NextResponse.json({
        message: 'Appointment mode created successfully',
        mode: appointmentMode
      }, { status: 201 });
    }

  } catch (error: any) {
    console.error('Error creating appointment config:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }

    if (error.name === 'ValidationError') {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to create appointment configuration' }, { status: 500 });
  }
}

// ============ PUT - Update appointment type or mode ============
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admin can update types/modes
    if (session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Only admin can update appointment configurations' }, { status: 403 });
    }

    await connectDB();

    const body = await request.json();
    const { resource, id, ...data } = body;

    if (!resource || !['type', 'mode'].includes(resource)) {
      return NextResponse.json({ error: 'Invalid resource type. Use "type" or "mode"' }, { status: 400 });
    }

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    if (resource === 'type') {
      const validated = appointmentTypeSchema.partial().parse({
        ...data,
        ...(data.duration !== undefined ? { duration: normalizeDuration(data.duration) } : {})
      });

      const updated = await AppointmentType.findByIdAndUpdate(
        id,
        { $set: validated },
        { new: true }
      );

      if (!updated) {
        return NextResponse.json({ error: 'Appointment type not found' }, { status: 404 });
      }

      return NextResponse.json({
        message: 'Appointment type updated successfully',
        type: updated
      });

    } else {
      const validated = appointmentModeSchema.partial().parse(data);

      const updated = await AppointmentMode.findByIdAndUpdate(
        id,
        { $set: validated },
        { new: true }
      );

      if (!updated) {
        return NextResponse.json({ error: 'Appointment mode not found' }, { status: 404 });
      }

      return NextResponse.json({
        message: 'Appointment mode updated successfully',
        mode: updated
      });
    }

  } catch (error: any) {
    console.error('Error updating appointment config:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }

    if (error.name === 'ValidationError') {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to update appointment configuration' }, { status: 500 });
  }
}

// ============ DELETE - Delete appointment type or mode ============
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admin can delete types/modes
    if (session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: 'Only admin can delete appointment configurations' }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const resource = searchParams.get('resource');
    const id = searchParams.get('id');

    if (!resource || !['type', 'mode'].includes(resource)) {
      return NextResponse.json({ error: 'Invalid resource type. Use "type" or "mode"' }, { status: 400 });
    }

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    if (resource === 'type') {
      const deleted = await AppointmentType.findByIdAndDelete(id);
      if (!deleted) {
        return NextResponse.json({ error: 'Appointment type not found' }, { status: 404 });
      }
      return NextResponse.json({ message: 'Appointment type deleted successfully' });
    } else {
      const deleted = await AppointmentMode.findByIdAndDelete(id);
      if (!deleted) {
        return NextResponse.json({ error: 'Appointment mode not found' }, { status: 404 });
      }
      return NextResponse.json({ message: 'Appointment mode deleted successfully' });
    }

  } catch (error) {
    console.error('Error deleting appointment config:', error);
    return NextResponse.json({ error: 'Failed to delete appointment configuration' }, { status: 500 });
  }
}
