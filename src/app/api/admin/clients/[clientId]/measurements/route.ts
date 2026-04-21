import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db/connection";
import ProgressEntry from "@/lib/db/models/ProgressEntry";
import JournalTracking from "@/lib/db/models/JournalTracking";
import User from "@/lib/db/models/User";
import { withCache, clearCacheByTag } from '@/lib/api/utils';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin or dietitian
    if (!['admin', 'dietitian', 'health_counselor'].includes(session.user.role || '')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { clientId } = await params;
    await dbConnect();

    // Verify client exists
    const client = await withCache(
      `admin:clients:clientId:measurements:${JSON.stringify(clientId)}`,
      async () => await User.findById(clientId),
      { ttl: 120000, tags: ['admin'] }
    );
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Get measurements from JournalTracking
    const journalEntries = await withCache(
      `admin:clients:clientId:measurements:${JSON.stringify({
        client: clientId,
        measurements: { $exists: true, $ne: [] }
      })}`,
      async () => await JournalTracking.find({
        client: clientId,
        measurements: { $exists: true, $ne: [] }
      }).sort({ date: -1 }),
      { ttl: 120000, tags: ['admin'] }
    );

    // Group by date from JournalTracking
    const measurementsByDate = new Map<string, any>();

    for (const journal of journalEntries) {
      for (const measurement of journal.measurements) {
        const dateKey = new Date(measurement.date || journal.date).toISOString().split('T')[0];

        if (!measurementsByDate.has(dateKey)) {
          measurementsByDate.set(dateKey, {
            _id: measurement._id?.toString() || journal._id.toString(),
            date: measurement.date || journal.date,
            addedBy: measurement.addedBy || 'client',
            arm: measurement.arm || 0,
            waist: measurement.waist || 0,
            abd: measurement.abd || 0,
            chest: measurement.chest || 0,
            hips: measurement.hips || 0,
            thigh: measurement.thigh || 0
          });
        }
      }
    }

    // Also get from ProgressEntry for backward compatibility
    const measurementTypes = ['waist', 'abdomen', 'hips', 'chest', 'arms', 'thighs'];
    const progressEntries = await withCache(
      `admin:clients:clientId:measurements:${JSON.stringify({
        user: clientId,
        type: { $in: measurementTypes }
      })}`,
      async () => await ProgressEntry.find({
        user: clientId,
        type: { $in: measurementTypes }
      }).sort({ recordedAt: -1 }),
      { ttl: 120000, tags: ['admin'] }
    );

    for (const entry of progressEntries) {
      const dateKey = new Date(entry.recordedAt).toISOString().split('T')[0];

      if (!measurementsByDate.has(dateKey)) {
        measurementsByDate.set(dateKey, {
          _id: entry._id.toString(),
          date: entry.recordedAt,
          addedBy: entry.metadata?.addedBy || 'client',
          arm: 0,
          waist: 0,
          abd: 0,
          chest: 0,
          hips: 0,
          thigh: 0
        });
      }

      const existing = measurementsByDate.get(dateKey);
      // Map ProgressEntry types to JournalTracking fields
      if (entry.type === 'arms') existing.arm = Number(entry.value);
      else if (entry.type === 'thighs') existing.thigh = Number(entry.value);
      else if (entry.type === 'abdomen') existing.abd = Number(entry.value);
      else existing[entry.type] = Number(entry.value);
    }

    const measurements = Array.from(measurementsByDate.values())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({
      measurements,
      latest: measurements[0] || null
    });
  } catch (error) {
    console.error("Error fetching measurements:", error);
    return NextResponse.json({ error: "Failed to fetch measurements" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin or dietitian
    if (!['admin', 'dietitian', 'health_counselor'].includes(session.user.role || '')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { clientId } = await params;
    await dbConnect();

    // Verify client exists
    const client = await withCache(
      `admin:clients:clientId:measurements:${JSON.stringify(clientId)}`,
      async () => await User.findById(clientId),
      { ttl: 120000, tags: ['admin'] }
    );
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const data = await request.json();
    const { arm, waist, abd, chest, hips, thigh } = data;

    const recordedAt = new Date();
    const addedBy = session.user.role === 'dietitian' ? 'dietitian' : 'admin';

    // Save to JournalTracking measurements
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let journal = await JournalTracking.findOne({
      client: clientId,
      date: { $gte: today, $lt: tomorrow }
    });

    if (!journal) {
      journal = new JournalTracking({
        client: clientId,
        date: today,
        water: [],
        activities: [],
        steps: [],
        sleep: [],
        meals: [],
        progress: [],
        bca: [],
        measurements: []
      });
    }

    // Add measurement entry
    const measurementEntry = {
      arm: arm || 0,
      waist: waist || 0,
      abd: abd || 0,
      chest: chest || 0,
      hips: hips || 0,
      thigh: thigh || 0,
      date: recordedAt,
      addedBy: addedBy,
      createdAt: new Date()
    };

    journal.measurements.push(measurementEntry);
    await journal.save();

    // Also save to ProgressEntry for backward compatibility
    const measurementMappings = [
      { type: 'arms', value: arm },
      { type: 'waist', value: waist },
      { type: 'abdomen', value: abd },
      { type: 'chest', value: chest },
      { type: 'hips', value: hips },
      { type: 'thighs', value: thigh }
    ];

    const savedEntries = [];
    for (const mapping of measurementMappings) {
      if (mapping.value && mapping.value > 0) {
        const progressEntry = new ProgressEntry({
          user: clientId,
          type: mapping.type,
          value: mapping.value,
          unit: 'cm',
          recordedAt: recordedAt,
          metadata: {
            addedBy: addedBy,
            addedById: session.user.id
          }
        });
        await progressEntry.save();
        savedEntries.push(progressEntry);
      }
    }

    return NextResponse.json({
      success: true,
      entries: savedEntries,
      journalMeasurement: measurementEntry,
      message: 'Measurements added successfully'
    });
  } catch (error) {
    console.error("Error adding measurements:", error);
    return NextResponse.json({ error: "Failed to add measurements" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin, dietitian or health_counselor
    if (!['admin', 'dietitian', 'health_counselor'].includes(session.user.role || '')) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { clientId } = await params;
    const { searchParams } = new URL(request.url);
    const measurementId = searchParams.get('id');

    if (!measurementId) {
      return NextResponse.json({ error: "Measurement ID required" }, { status: 400 });
    }

    await dbConnect();

    // Get the entry to find the date
    const entry = await withCache(
      `admin:clients:clientId:measurements:${JSON.stringify(measurementId)}`,
      async () => await ProgressEntry.findById(measurementId),
      { ttl: 120000, tags: ['admin'] }
    );
    if (!entry) {
      return NextResponse.json({ error: "Measurement not found" }, { status: 404 });
    }

    // Delete all measurements for that date (waist, hips, chest, etc.)
    const entryDate = new Date(entry.recordedAt);
    entryDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(entryDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const measurementTypes = ['waist', 'abdomen', 'hips', 'chest', 'arms', 'thighs'];
    await ProgressEntry.deleteMany({
      user: clientId,
      type: { $in: measurementTypes },
      recordedAt: { $gte: entryDate, $lt: nextDay }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting measurement:", error);
    return NextResponse.json({ error: "Failed to delete measurement" }, { status: 500 });
  }
}
