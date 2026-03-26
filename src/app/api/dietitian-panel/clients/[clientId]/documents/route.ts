import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import MedicalInfo from '@/lib/db/models/MedicalInfo';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import { UserRole } from '@/types';
import { withCache } from '@/lib/api/utils';
import { getImageKit } from '@/lib/imagekit';

export const dynamic = 'force-dynamic';

// Known meal type patterns → Display names
// ImageKit appends random suffixes to filenames (e.g., EARLY_MORNING_N85xmNZhk)
// We match against these known types to get clean display names
const MEAL_TYPE_MAP: Record<string, string> = {
    'EARLY_MORNING': 'Early Morning',
    'earlyMorning': 'Early Morning',
    'earlymorning': 'Early Morning',
    'BREAKFAST': 'Breakfast',
    'breakfast': 'Breakfast',
    'MID_MORNING': 'Mid Morning',
    'midMorning': 'Mid Morning',
    'midmorning': 'Mid Morning',
    'LUNCH': 'Lunch',
    'lunch': 'Lunch',
    'EVENING_SNACK': 'Evening Snack',
    'eveningSnack': 'Evening Snack',
    'eveningsnack': 'Evening Snack',
    'DINNER': 'Dinner',
    'dinner': 'Dinner',
    'BEDTIME': 'Bedtime',
    'bedtime': 'Bedtime',
    'PRE_WORKOUT': 'Pre Workout',
    'preWorkout': 'Pre Workout',
    'POST_WORKOUT': 'Post Workout',
    'postWorkout': 'Post Workout',
};

// Extract clean meal type from ImageKit filename segment
// Handles: EARLY_MORNING_N85xmNZhk → Early Morning
function extractMealType(raw: string): string {
    if (!raw) return 'Complete Meal';
    // Remove file extension
    const withoutExt = raw.split('.')[0] || raw;
    // Try to match against known meal types (longest match first)
    const sortedKeys = Object.keys(MEAL_TYPE_MAP).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        if (withoutExt.startsWith(key) || withoutExt.toLowerCase().startsWith(key.toLowerCase())) {
            return MEAL_TYPE_MAP[key];
        }
    }
    // Fallback: clean up the raw string
    return withoutExt
        .split('_')
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ') || 'Complete Meal';
}

// Helper function to check if dietitian is assigned to client
async function isDietitianAssigned(dietitianId: string, clientId: string): Promise<boolean> {
    const client = await withCache(
        `dietitian-panel:clients:${clientId}:documents:check`,
        async () => await User.findById(clientId).select('assignedDietitian assignedDietitians'),
        { ttl: 120000, tags: ['dietitian_panel'] }
    );
    if (!client) return false;

    return (
        client.assignedDietitian?.toString() === dietitianId ||
        client.assignedDietitians?.some((d: any) => d.toString() === dietitianId)
    );
}

// GET /api/dietitian-panel/clients/[clientId]/documents - Get all documents for a client
// Aggregates: user-uploaded documents, medical reports, and meal completion images
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ clientId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if user is dietitian or admin
        if (session.user.role !== UserRole.DIETITIAN && session.user.role !== UserRole.ADMIN) {
            return NextResponse.json({ error: 'Forbidden - Dietitian/Admin access required' }, { status: 403 });
        }

        const { clientId } = await params;
        await connectDB();

        // For dietitians, verify assignment; admins can access any client
        if (session.user.role === UserRole.DIETITIAN) {
            const isAssigned = await isDietitianAssigned(session.user.id, clientId);
            if (!isAssigned) {
                return NextResponse.json({ error: 'You are not assigned to this client' }, { status: 403 });
            }
        }

        // 1. Fetch user-uploaded documents (manual uploads from client.documents)
        const user = await User.findById(clientId).select('documents firstName lastName');
        if (!user) {
            return NextResponse.json({ error: 'Client not found' }, { status: 404 });
        }

        const manualDocuments = (user.documents || []).map((doc: any) => ({
            id: doc.id || doc._id?.toString() || `manual-${Date.now()}`,
            type: doc.type || 'medical-report',
            fileName: doc.fileName || 'Document',
            filePath: doc.filePath || doc.url || '',
            uploadedAt: doc.uploadedAt || doc.createdAt || new Date().toISOString(),
            source: 'manual-upload',
            tag: doc.type === 'meal-picture' ? 'Meal Picture' :
                doc.type === 'transformation' ? 'Transformation' : 'Manual Upload'
        }));

        // 2. Fetch medical reports from MedicalInfo collection
        const medicalInfo = await MedicalInfo.findOne({ userId: clientId });
        const medicalReports = (medicalInfo?.reports || []).map((report: any) => ({
            id: report.id || `medical-${Date.now()}`,
            type: 'medical-report' as const,
            fileName: report.fileName || 'Medical Report',
            filePath: report.url || '',
            uploadedAt: report.uploadedOn || new Date().toISOString(),
            source: 'medical-info',
            tag: report.category || 'Medical Report',
            category: report.category || 'Medical Report'
        }));

        // 3. Fetch meal completion images from ClientMealPlan
        const mealPlans = await ClientMealPlan.find({
            clientId: clientId,
            'mealCompletions.imagePath': { $exists: true, $ne: '' }
        }).select('mealCompletions name');

        const mealCompletionImages: any[] = [];

        mealPlans.forEach((plan: any) => {
            const completions = plan.mealCompletions || [];
            completions.forEach((completion: any) => {
                if (completion.imagePath) {
                    const completionDate = new Date(completion.date);
                    const formattedDate = completionDate.toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        timeZone: 'Asia/Kolkata'
                    });
                    const formattedTime = completionDate.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });

                    // Convert meal type for display (e.g., EARLY_MORNING -> Early Morning)
                    const mealTypeDisplay = (completion.mealType || 'Meal')
                        .split('_')
                        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ');

                    mealCompletionImages.push({
                        id: `meal-${plan._id}-${completion.date}-${completion.mealType}`,
                        type: 'meal-picture' as const,
                        fileName: `${mealTypeDisplay} - ${formattedDate} ${formattedTime}`,
                        filePath: completion.imagePath,
                        uploadedAt: completion.date || new Date().toISOString(),
                        source: 'meal-completion',
                        tag: mealTypeDisplay,
                        mealType: completion.mealType,
                        date: completion.date,
                        notes: completion.notes,
                        planName: plan.name
                    });
                }
            });
        });

        // 4. Fetch transformation images and meal pictures from ImageKit folders
        let transformationImages: any[] = [];
        let imagekitMealPictures: any[] = [];

        try {
            const ik = getImageKit();

            // Fetch transformation images for this client from ImageKit
            // Files are named with clientId prefix (e.g., clientId-timestamp.jpg)
            // Use searchQuery to filter server-side by clientId in filename
            let transformationFiles: any[] = [];
            try {
                const tfResult = await ik.listFiles({
                    path: '/transformation',
                    searchQuery: `name : "${clientId}"`,
                    limit: 100
                });
                transformationFiles = Array.isArray(tfResult) ? tfResult : [];
            } catch {
                // Fallback: fetch all and filter client-side
                const allTfFiles = await ik.listFiles({ path: '/transformation', limit: 500 });
                transformationFiles = Array.isArray(allTfFiles)
                    ? allTfFiles.filter((f: any) => f.name?.startsWith(clientId))
                    : [];
            }

            if (transformationFiles.length > 0) {
                // Extra safety: ensure only this client's files
                const clientTransformationFiles = transformationFiles.filter((file: any) =>
                    file.name?.startsWith(clientId)
                );

                transformationImages = clientTransformationFiles.map((file: any) => {
                    // Try to extract timestamp from filename (format: clientId-timestamp.jpg)
                    const nameParts = file.name?.split('-') || [];
                    let extractedDate = file.createdAt || new Date().toISOString();

                    if (nameParts.length >= 2) {
                        const timestampPart = nameParts[1]?.split('.')[0];
                        if (timestampPart && !isNaN(Number(timestampPart))) {
                            extractedDate = new Date(Number(timestampPart)).toISOString();
                        }
                    }

                    // Format date for display
                    const dateObj = new Date(extractedDate);
                    const formattedDate = dateObj.toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        timeZone: 'Asia/Kolkata'
                    });
                    const formattedTime = dateObj.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });

                    return {
                        id: file.fileId || `transformation-${Date.now()}-${Math.random()}`,
                        type: 'transformation' as const,
                        fileName: `Transformation`,
                        filePath: file.url || '',
                        uploadedAt: extractedDate,
                        source: 'imagekit-transformation',
                        tag: 'Transformation',
                        date: `${formattedDate} ${formattedTime}`,
                        category: 'Transformation'
                    };
                });
            }

            // Fetch complete-meal images for this client from ImageKit
            // Use searchQuery to filter server-side by clientId in filename
            let completeMealFiles: any[] = [];
            try {
                const cmResult = await ik.listFiles({
                    path: '/complete-meal',
                    searchQuery: `name : "${clientId}"`,
                    limit: 100
                });
                completeMealFiles = Array.isArray(cmResult) ? cmResult : [];
            } catch {
                // Fallback: fetch all and filter client-side
                const allCmFiles = await ik.listFiles({ path: '/complete-meal', limit: 500 });
                completeMealFiles = Array.isArray(allCmFiles)
                    ? allCmFiles.filter((f: any) => f.name?.startsWith(clientId))
                    : [];
            }

            if (completeMealFiles.length > 0) {
                // Extra safety: ensure only this client's files
                const clientMealFiles = completeMealFiles.filter((file: any) =>
                    file.name?.startsWith(clientId)
                );

                imagekitMealPictures = clientMealFiles.map((file: any) => {
                    // Extract parts from filename: clientId-timestamp-MEAL_TYPE_imagekitSuffix.jpg
                    // The filename after removing clientId prefix and timestamp gives us the meal type
                    const fileName = file.name || '';
                    let mealTypeDisplay = 'Complete Meal';
                    let extractedDate = file.createdAt || new Date().toISOString();

                    // Remove clientId prefix and split remaining by '-'
                    const afterClientId = fileName.startsWith(clientId)
                        ? fileName.substring(clientId.length + 1) // +1 for the dash
                        : fileName;
                    const remainingParts = afterClientId.split('-');

                    if (remainingParts.length >= 1) {
                        // First part is the timestamp
                        const timestampPart = remainingParts[0];
                        if (timestampPart && !isNaN(Number(timestampPart))) {
                            extractedDate = new Date(Number(timestampPart)).toISOString();
                        }

                        // Everything after timestamp is meal type (may include ImageKit suffix)
                        if (remainingParts.length >= 2) {
                            const mealTypeRaw = remainingParts.slice(1).join('-');
                            mealTypeDisplay = extractMealType(mealTypeRaw);
                        }
                    }

                    // Format date for display
                    const dateObj = new Date(extractedDate);
                    const formattedDate = dateObj.toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        timeZone: 'Asia/Kolkata'
                    });
                    const formattedTime = dateObj.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });

                    return {
                        id: file.fileId || `ik-meal-${Date.now()}-${Math.random()}`,
                        type: 'meal-picture' as const,
                        fileName: `${mealTypeDisplay}`,
                        filePath: file.url || '',
                        uploadedAt: extractedDate,
                        source: 'imagekit-meal',
                        tag: mealTypeDisplay,
                        date: `${formattedDate} ${formattedTime}`,
                        category: 'Complete Meal'
                    };
                });
            }
        } catch (imagekitError) {
            // Log but don't fail if ImageKit fetch fails
            console.error('Error fetching from ImageKit:', imagekitError);
        }

        // Combine all documents and sort by upload date (most recent first)
        const allDocuments = [
            ...manualDocuments,
            ...medicalReports,
            ...mealCompletionImages,
            ...transformationImages,
            ...imagekitMealPictures
        ].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

        // Remove duplicates (same filePath)
        const uniqueDocuments = allDocuments.filter((doc, index, self) =>
            index === self.findIndex((d) => d.filePath === doc.filePath)
        );

        // Count by type from unique documents
        const mealPicturesCount = uniqueDocuments.filter(d => d.type === 'meal-picture').length;
        const medicalReportsCount = uniqueDocuments.filter(d => d.type === 'medical-report').length;
        const transformationsCount = uniqueDocuments.filter(d => d.type === 'transformation').length;

        return NextResponse.json({
            success: true,
            documents: uniqueDocuments,
            counts: {
                total: uniqueDocuments.length,
                manual: manualDocuments.length,
                medicalReports: medicalReportsCount,
                mealCompletions: mealPicturesCount,
                transformations: transformationsCount
            },
            client: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName
            }
        });
    } catch (error) {
        console.error('Error fetching client documents:', error);
        return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
    }
}
