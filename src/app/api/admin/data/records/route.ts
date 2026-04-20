/**
 * API Route: Data Search & Update
 * GET /api/admin/data/records - Search records
 * PUT /api/admin/data/records - Update record
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectDB from '@/lib/db/connection';
import { modelRegistry } from '@/lib/import';
import mongoose from 'mongoose';

export const runtime = 'nodejs';

// GET - Search records
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const modelName = searchParams.get('model');
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const recordId = searchParams.get('id');
    const sortBy = (searchParams.get('sortBy') || '').trim();
    const sortOrder: 1 | -1 = searchParams.get('sortOrder') === 'asc' ? 1 : -1;

    await connectDB();

    if (!modelName) {
      return NextResponse.json(
        { success: false, error: 'Model name is required' },
        { status: 400 }
      );
    }

    const registeredModel = modelRegistry.get(modelName);
    if (!registeredModel) {
      return NextResponse.json(
        { success: false, error: 'Model not found' },
        { status: 404 }
      );
    }

    // If specific record ID provided, fetch that record with related data
    if (recordId) {
      const record = await registeredModel.model.findById(recordId).lean();

      if (!record) {
        return NextResponse.json(
          { success: false, error: 'Record not found' },
          { status: 404 }
        );
      }

      // Fetch related data based on model type
      let relatedData: any = {};

      if (modelName === 'User') {
        // Fetch related data for users
        const LifestyleInfo = mongoose.models.LifestyleInfo || require('@/lib/db/models/LifestyleInfo').default;
        const MedicalInfo = mongoose.models.MedicalInfo || require('@/lib/db/models/MedicalInfo').default;
        const DietaryRecall = mongoose.models.DietaryRecall || require('@/lib/db/models/DietaryRecall').default;
        const ClientMealPlan = mongoose.models.ClientMealPlan || require('@/lib/db/models/ClientMealPlan').default;
        const Task = mongoose.models.Task || require('@/lib/db/models/Task').default;
        const Payment = mongoose.models.Payment || require('@/lib/db/models/Payment').default;
        const Appointment = mongoose.models.Appointment || require('@/lib/db/models/Appointment').default;

        const [lifestyle, medical, dietaryRecall, mealPlans, tasks, payments, appointments] = await Promise.all([
          LifestyleInfo.findOne({ userId: recordId }).lean().catch(() => null),
          MedicalInfo.findOne({ userId: recordId }).lean().catch(() => null),
          DietaryRecall.findOne({ userId: recordId }).lean().catch(() => null),
          ClientMealPlan.find({ client: recordId }).limit(5).lean().catch(() => []),
          Task.find({ $or: [{ assignedTo: recordId }, { createdBy: recordId }] }).limit(10).lean().catch(() => []),
          Payment.find({ $or: [{ client: recordId }, { user: recordId }] }).limit(10).lean().catch(() => []),
          Appointment.find({ $or: [{ client: recordId }, { dietitian: recordId }] }).limit(10).lean().catch(() => [])
        ]);

        relatedData = {
          lifestyleInfo: lifestyle,
          medicalInfo: medical,
          dietaryRecall,
          recentMealPlans: mealPlans,
          recentTasks: tasks,
          recentPayments: payments,
          recentAppointments: appointments
        };
      }

      return NextResponse.json({
        success: true,
        record,
        relatedData,
        fields: registeredModel.fields.filter(f => !f.path.startsWith('_')).map(f => ({
          path: f.path,
          type: f.type,
          required: f.required,
          enum: f.enum
        }))
      });
    }

    // Build search query
    let query: any = {};

    if (search) {
      const normalizedSearch = search.trim();
      // Search across multiple string fields
      const searchableFields = registeredModel.fields
        .filter(f => f.type === 'String' && !f.path.startsWith('_'))
        .map(f => f.path);

      const orConditions: any[] = [];

      if (searchableFields.length > 0) {
        orConditions.push(...searchableFields.map(field => ({
          [field]: { $regex: search, $options: 'i' }
        })));
      }

      // Allow direct lookup by Mongo ObjectId
      if (mongoose.Types.ObjectId.isValid(normalizedSearch)) {
        const searchObjectId = new mongoose.Types.ObjectId(normalizedSearch);
        orConditions.push({ _id: searchObjectId });

        // For UnifiedPayment, commonly searched reference ids
        if (modelName === 'UnifiedPayment') {
          orConditions.push(
            { client: searchObjectId },
            { dietitian: searchObjectId },
            { servicePlan: searchObjectId },
            { paymentLink: searchObjectId }
          );
        }
      }

      // UnifiedPayment: support search by client ID (cId/clientId) and client name
      if (modelName === 'UnifiedPayment') {
        const UserModel = mongoose.models.User || require('@/lib/db/models/User').default;
        const matchedUsers = await UserModel.find({
          $or: [
            { clientId: { $regex: normalizedSearch, $options: 'i' } },
            { dtps_id: { $regex: normalizedSearch, $options: 'i' } },
            { firstName: { $regex: normalizedSearch, $options: 'i' } },
            { lastName: { $regex: normalizedSearch, $options: 'i' } },
            { email: { $regex: normalizedSearch, $options: 'i' } }
          ]
        })
          .select('_id')
          .limit(200)
          .lean();

        if (matchedUsers.length > 0) {
          orConditions.push({ client: { $in: matchedUsers.map((u: any) => u._id) } });
        }
      }

      if (orConditions.length > 0) {
        query.$or = orConditions;
      }
    }

    // Get total count
    const total = await registeredModel.model.countDocuments(query);

    const allowPostEnrichmentSort = modelName === 'UnifiedPayment' && ['clientName', 'clientDisplayId', 'cId'].includes(sortBy);
    const canSortBySchemaField = sortBy === '_id' || !!registeredModel.model.schema.path(sortBy);

    const databaseSort: Record<string, 1 | -1> = {};
    if (sortBy && canSortBySchemaField && !allowPostEnrichmentSort) {
      databaseSort[sortBy] = sortOrder;
      if (sortBy !== 'createdAt') {
        databaseSort.createdAt = -1;
      }
    } else {
      databaseSort.createdAt = -1;
    }

    // Fetch paginated results
    const records = await registeredModel.model
      .find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort(databaseSort)
      .lean();

    // UnifiedPayment list enrichment for admin table display
    let enrichedRecords: any[] = records;
    if (modelName === 'UnifiedPayment' && records.length > 0) {
      const clientIds = Array.from(
        new Set(
          records
            .map((r: any) => r?.client)
            .filter((id: any) => id && mongoose.Types.ObjectId.isValid(String(id)))
            .map((id: any) => String(id))
        )
      );

      if (clientIds.length > 0) {
        const UserModel = mongoose.models.User || require('@/lib/db/models/User').default;
        const users = await UserModel.find({ _id: { $in: clientIds } })
          .select('_id firstName lastName clientId dtps_id')
          .lean();

        const userMap = new Map<string, any>(users.map((u: any) => [String(u._id), u]));

        enrichedRecords = records.map((record: any) => {
          const user = userMap.get(String(record.client));
          const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
          return {
            ...record,
            clientName: fullName || '',
            clientDisplayId: user?.clientId || user?.dtps_id || '',
            cId: user?.clientId || user?.dtps_id || ''
          };
        });
      }

      if (allowPostEnrichmentSort) {
        const normalizeSortValue = (value: any) => {
          if (typeof value === 'number') return value;
          if (value instanceof Date) return value.getTime();
          if (typeof value === 'string') return value.toLowerCase();
          return '';
        };

        enrichedRecords = [...enrichedRecords].sort((left: any, right: any) => {
          const leftValue = normalizeSortValue(left?.[sortBy]);
          const rightValue = normalizeSortValue(right?.[sortBy]);

          if (leftValue < rightValue) return sortOrder === 1 ? -1 : 1;
          if (leftValue > rightValue) return sortOrder === 1 ? 1 : -1;

          const leftCreatedAt = new Date(left?.createdAt || 0).getTime();
          const rightCreatedAt = new Date(right?.createdAt || 0).getTime();
          return rightCreatedAt - leftCreatedAt;
        });
      }
    }

    return NextResponse.json({
      success: true,
      modelName,
      displayName: registeredModel.displayName,
      records: enrichedRecords,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      fields: registeredModel.fields.filter(f => !f.path.startsWith('_')).map(f => ({
        path: f.path,
        type: f.type,
        required: f.required
      }))
    });

  } catch (error: any) {
    console.error('Data search error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Server error',
        message: error.message
      },
      { status: 500 }
    );
  }
}

// PUT - Update record
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any).role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { modelName, recordId, data, relatedModel, relatedData } = body;

    if (!modelName || !recordId) {
      return NextResponse.json(
        { success: false, error: 'Model name and record ID are required' },
        { status: 400 }
      );
    }

    await connectDB();

    const registeredModel = modelRegistry.get(modelName);
    if (!registeredModel) {
      return NextResponse.json(
        { success: false, error: 'Model not found' },
        { status: 404 }
      );
    }

    // If updating related data
    if (relatedModel && relatedData) {
      let RelatedModelClass;

      switch (relatedModel) {
        case 'LifestyleInfo':
          RelatedModelClass = mongoose.models.LifestyleInfo || require('@/lib/db/models/LifestyleInfo').default;
          break;
        case 'MedicalInfo':
          RelatedModelClass = mongoose.models.MedicalInfo || require('@/lib/db/models/MedicalInfo').default;
          break;
        case 'DietaryRecall':
          RelatedModelClass = mongoose.models.DietaryRecall || require('@/lib/db/models/DietaryRecall').default;
          break;
        default:
          return NextResponse.json(
            { success: false, error: 'Invalid related model' },
            { status: 400 }
          );
      }

      const updatedRelated = await RelatedModelClass.findOneAndUpdate(
        { userId: recordId },
        { $set: relatedData },
        { new: true, upsert: true }
      );

      return NextResponse.json({
        success: true,
        message: `${relatedModel} updated successfully`,
        data: updatedRelated
      });
    }

    // Update main record
    // Remove fields that shouldn't be updated
    const updateData = { ...data };
    delete updateData._id;
    delete updateData.__v;
    delete updateData.createdAt;
    updateData.updatedAt = new Date();

    const updatedRecord = await registeredModel.model.findByIdAndUpdate(
      recordId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();

    if (!updatedRecord) {
      return NextResponse.json(
        { success: false, error: 'Record not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Record updated successfully',
      record: updatedRecord
    });

  } catch (error: any) {
    console.error('Data update error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update record',
        message: error.message
      },
      { status: 500 }
    );
  }
}
