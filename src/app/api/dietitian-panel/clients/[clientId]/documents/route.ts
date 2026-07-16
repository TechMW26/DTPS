import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import User from '@/lib/db/models/User';
import MedicalInfo from '@/lib/db/models/MedicalInfo';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import { UserRole } from '@/types';
import { serverCache, withCache } from '@/lib/api/utils';
import { getImageKit } from '@/lib/imagekit';
import { Types } from 'mongoose';

export const dynamic = 'force-dynamic';

const IMAGEKIT_LIST_TIMEOUT_MS = 2500;
const DOCUMENTS_CACHE_TTL_SECONDS = 300;

type ClientAssignedRef = { toString: () => string } | string;

type UserDocument = {
    id?: string;
    _id?: { toString: () => string };
    type?: string;
    fileName?: string;
    filePath?: string;
    url?: string;
    uploadedAt?: string | Date;
    createdAt?: string | Date;
};

type ClientUserLite = {
    _id: unknown;
    firstName?: string;
    lastName?: string;
    documents?: UserDocument[];
    assignedDietitian?: ClientAssignedRef;
    assignedDietitians?: ClientAssignedRef[];
};

type MedicalReport = {
    id?: string;
    fileName?: string;
    url?: string;
    uploadedOn?: string | Date;
    category?: string;
};

type MedicalInfoLite = {
    reports?: MedicalReport[];
};

type MealCompletion = {
    imagePath?: string;
    date?: string | Date;
    mealType?: string;
    mealTypeOriginal?: string;
    notes?: string;
};

type MealPlanLite = {
    _id: unknown;
    name?: string;
    mealCompletions?: MealCompletion[];
};

type ImageKitFileLite = {
    fileId?: string;
    name?: string;
    createdAt?: string;
    url?: string;
};

function toTime(value: unknown): number {
    if (value instanceof Date) {
        return value.getTime();
    }

    if (typeof value === 'string' || typeof value === 'number') {
        const time = new Date(value).getTime();
        return Number.isNaN(time) ? 0 : time;
    }

    return 0;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`Timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        promise.then((value) => {
            clearTimeout(timeoutId);
            resolve(value);
        }).catch((error) => {
            clearTimeout(timeoutId);
            reject(error);
        });
    });
}

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

async function listImageKitFilesForClient(path: string, clientId: string) {
    const cacheKey = `dietitian-panel:documents:imagekit:${path}:${clientId}`;
    const cachedFiles = serverCache.get<ImageKitFileLite[]>(cacheKey);
    if (cachedFiles) {
        return cachedFiles;
    }

    const normalizeFiles = (files: unknown): ImageKitFileLite[] => {
        return Array.isArray(files)
            ? (files as ImageKitFileLite[]).filter((file) => file.name?.startsWith(clientId))
            : [];
    };

    let ik;
    try {
        ik = getImageKit();
    } catch {
        return [];
    }

    try {
        const result = await withTimeout(
            ik.listFiles({
                path,
                searchQuery: `name : "${clientId}"`,
                limit: 100
            }),
            IMAGEKIT_LIST_TIMEOUT_MS
        );
        const filtered = normalizeFiles(result);
        serverCache.set(cacheKey, filtered, DOCUMENTS_CACHE_TTL_SECONDS);
        return filtered;
    } catch {
        try {
            const fallbackResult = await withTimeout(
                ik.listFiles({ path, limit: 100 }),
                IMAGEKIT_LIST_TIMEOUT_MS
            );
            const filtered = normalizeFiles(fallbackResult);
            serverCache.set(cacheKey, filtered, DOCUMENTS_CACHE_TTL_SECONDS);
            return filtered;
        } catch {
            return [];
        }
    }
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
        if (!Types.ObjectId.isValid(clientId)) {
            return NextResponse.json({ error: 'Invalid client ID' }, { status: 400 });
        }

        await connectDB();

        // Fetch client once and reuse for assignment + response payload + manual docs.
        const user = await withCache<ClientUserLite | null>(
            `dietitian-panel:clients:${clientId}:documents:client`,
            async () => await User.findById(clientId)
                .select('documents firstName lastName assignedDietitian assignedDietitians')
                .lean<ClientUserLite | null>(),
            { ttl: 120000, tags: ['dietitian_panel'] }
        );
        if (!user) {
            return NextResponse.json({ error: 'Client not found' }, { status: 404 });
        }

        // For dietitians, verify assignment; admins can access any client
        if (session.user.role === UserRole.DIETITIAN) {
            const isAssigned =
                user.assignedDietitian?.toString() === session.user.id ||
                user.assignedDietitians?.some((d) => d.toString() === session.user.id);
            if (!isAssigned) {
                return NextResponse.json({ error: 'You are not assigned to this client' }, { status: 403 });
            }
        }

        const manualDocuments = (user.documents || []).map((doc) => ({
            id: doc.id || doc._id?.toString() || `manual-${Date.now()}`,
            type: doc.type || 'medical-report',
            fileName: doc.fileName || 'Document',
            filePath: doc.filePath || doc.url || '',
            uploadedAt: doc.uploadedAt || doc.createdAt || new Date().toISOString(),
            source: 'manual-upload',
            tag: doc.type === 'meal-picture' ? 'Meal Picture' :
                doc.type === 'transformation' ? 'Transformation' : 'Manual Upload'
        }));

        const assembled = await withCache(
            `dietitian-panel:clients:${clientId}:documents:assembled`,
            async () => {
                // Fetch remaining data sources in parallel to reduce tail latency.
                // Each source is individually guarded so one failure doesn't crash the whole request.
                const [medicalInfo, mealPlans, transformationFiles, completeMealFiles] = await Promise.all([
                    MedicalInfo.findOne({ userId: clientId }).lean<MedicalInfoLite | null>().catch(() => null),
                    ClientMealPlan.find({
                        clientId,
                        'mealCompletions.imagePath': { $exists: true, $ne: '' }
                    }).select('mealCompletions name').lean<MealPlanLite[]>().catch(() => []),
                    listImageKitFilesForClient('/transformation', clientId),
                    listImageKitFilesForClient('/complete-meal', clientId),
                ]);

                // 2. Fetch medical reports from MedicalInfo collection
                const medicalReports = (medicalInfo?.reports || []).map((report) => ({
                    id: report.id || `medical-${Date.now()}`,
                    type: 'medical-report' as const,
                    fileName: report.fileName || 'Medical Report',
                    filePath: report.url || '',
                    uploadedAt: report.uploadedOn || new Date().toISOString(),
                    source: 'medical-info',
                    tag: report.category || 'Medical Report',
                    category: report.category || 'Medical Report'
                }));

                const mealCompletionImages: Array<Record<string, unknown>> = [];

                mealPlans.forEach((plan) => {
                    const completions = plan.mealCompletions || [];
                    completions.forEach((completion) => {
                        if (completion.imagePath) {
                            const completionDate = new Date(completion.date ?? Date.now());
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

                            const mealTypeDisplay = completion.mealTypeOriginal || (completion.mealType || 'Meal')
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

                let transformationImages: Array<Record<string, unknown>> = [];
                let imagekitMealPictures: Array<Record<string, unknown>> = [];

                try {
                    if (transformationFiles.length > 0) {
                        const clientTransformationFiles = transformationFiles.filter((file) =>
                            file.name?.startsWith(clientId)
                        );

                        transformationImages = clientTransformationFiles.map((file) => {
                            const nameParts = file.name?.split('-') || [];
                            let extractedDate = file.createdAt || new Date().toISOString();

                            if (nameParts.length >= 2) {
                                const timestampPart = nameParts[1]?.split('.')[0];
                                if (timestampPart && !isNaN(Number(timestampPart))) {
                                    extractedDate = new Date(Number(timestampPart)).toISOString();
                                }
                            }

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

                    if (completeMealFiles.length > 0) {
                        const clientMealFiles = completeMealFiles.filter((file) =>
                            file.name?.startsWith(clientId)
                        );

                        imagekitMealPictures = clientMealFiles.map((file) => {
                            const fileName = file.name || '';
                            let mealTypeDisplay = 'Complete Meal';
                            let extractedDate = file.createdAt || new Date().toISOString();

                            const afterClientId = fileName.startsWith(clientId)
                                ? fileName.substring(clientId.length + 1)
                                : fileName;
                            const remainingParts = afterClientId.split('-');

                            if (remainingParts.length >= 1) {
                                const timestampPart = remainingParts[0];
                                if (timestampPart && !isNaN(Number(timestampPart))) {
                                    extractedDate = new Date(Number(timestampPart)).toISOString();
                                }

                                if (remainingParts.length >= 2) {
                                    const mealTypeRaw = remainingParts.slice(1).join('-');
                                    mealTypeDisplay = extractMealType(mealTypeRaw);
                                }
                            }

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
                    console.error('Error fetching from ImageKit:', imagekitError);
                }

                return {
                    medicalReports,
                    mealCompletionImages,
                    transformationImages,
                    imagekitMealPictures,
                };
            },
            { ttl: 300000, tags: ['dietitian_panel'] }
        );

        // Combine all documents and sort by upload date (most recent first)
        const allDocuments = [
            ...manualDocuments,
            ...assembled.medicalReports,
            ...assembled.mealCompletionImages,
            ...assembled.transformationImages,
            ...assembled.imagekitMealPictures
        ].sort((a, b) => toTime(b.uploadedAt) - toTime(a.uploadedAt));

        // Remove duplicates by filePath while preserving order, but prefer
        // DB-backed meal completion entries over generic ImageKit fallback entries.
        const uniqueDocuments: typeof allDocuments = [];
        const pathIndex = new Map<string, number>();

        allDocuments.forEach((doc) => {
            const key = String(doc.filePath || '');
            if (!key) {
                uniqueDocuments.push(doc);
                return;
            }

            const existingIndex = pathIndex.get(key);
            if (existingIndex === undefined) {
                pathIndex.set(key, uniqueDocuments.length);
                uniqueDocuments.push(doc);
                return;
            }

            const existing = uniqueDocuments[existingIndex] as any;
            const shouldReplaceExisting =
                existing?.source === 'imagekit-meal' &&
                (doc as any)?.source === 'meal-completion';

            if (shouldReplaceExisting) {
                uniqueDocuments[existingIndex] = doc as any;
            }
        });

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
    } catch (error: any) {
        console.error('Error fetching client documents:', error);
        return NextResponse.json({
            error: 'Failed to fetch documents',
            details: error?.message || String(error),
            stack: process.env.NODE_ENV !== 'production' ? error?.stack : undefined,
        }, { status: 500 });
    }
}
