import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import connectDB from '@/lib/db/connection';
import ClientMealPlan from '@/lib/db/models/ClientMealPlan';
import UnifiedPayment from '@/lib/db/models/UnifiedPayment';
import { UserRole } from '@/types';

/**
 * GET /api/clients/[clientId]/phase-history
 * 
 * Returns the complete phase history for a client, including:
 * - All meal plans with their phase tags
 * - Associated payment information
 * - Timeline of phases
 * 
 * Access: Admin, Dietitian, Health Counselor (staff only)
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ clientId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Only staff can view phase history
        const allowedRoles = [UserRole.ADMIN, UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR];
        if (!allowedRoles.includes(session.user.role as UserRole)) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        await connectDB();

        const { clientId } = await params;

        if (!clientId) {
            return NextResponse.json({ error: 'Client ID is required' }, { status: 400 });
        }

        // Fetch all meal plans for this client, sorted by phase/date
        const mealPlans = await ClientMealPlan.find({
            clientId,
            status: { $in: ['active', 'completed', 'draft'] }
        })
            .sort({ phaseNumber: 1, startDate: 1, createdAt: 1 })
            .populate('dietitianId', 'firstName lastName')
            .populate('purchaseId', 'amount paymentType paidAt phaseTag phaseNumber')
            .select('name status startDate endDate duration phaseNumber phaseTag previousPhaseId purchaseId createdAt')
            .lean();

        // Fetch associated payments
        const payments = await UnifiedPayment.find({
            client: clientId,
            $or: [
                { status: 'paid' },
                { paymentStatus: 'paid' },
                { status: 'completed' }
            ]
        })
            .sort({ paidAt: -1, createdAt: -1 })
            .select('amount paymentType status paidAt phaseTag phaseNumber linkedMealPlanIds createdAt')
            .lean();

        // Build phase timeline
        const phaseTimeline = mealPlans.map((plan: any, index: number) => {
            const linkedPayment = payments.find((p: any) =>
                p.linkedMealPlanIds?.some((id: any) => String(id) === String(plan._id))
            );

            return {
                phase: plan.phaseNumber || index + 1,
                phaseTag: plan.phaseTag || `PHASE-${plan.phaseNumber || index + 1}`,
                mealPlan: {
                    id: plan._id,
                    name: plan.name,
                    status: plan.status,
                    startDate: plan.startDate,
                    endDate: plan.endDate,
                    duration: plan.duration,
                    dietitian: plan.dietitianId ? {
                        id: (plan.dietitianId as any)._id,
                        name: `${(plan.dietitianId as any).firstName} ${(plan.dietitianId as any).lastName}`
                    } : null,
                    createdAt: plan.createdAt
                },
                payment: linkedPayment ? {
                    id: linkedPayment._id,
                    amount: linkedPayment.amount,
                    paymentType: linkedPayment.paymentType,
                    status: linkedPayment.status,
                    paidAt: linkedPayment.paidAt
                } : null,
                previousPhaseId: plan.previousPhaseId
            };
        });

        // Calculate summary statistics
        const completedPhases = mealPlans.filter((p: any) => p.status === 'completed').length;
        const activePhases = mealPlans.filter((p: any) => p.status === 'active').length;
        const draftPhases = mealPlans.filter((p: any) => p.status === 'draft').length;
        const totalPayments = payments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

        return NextResponse.json({
            success: true,
            clientId,
            summary: {
                totalPhases: mealPlans.length,
                completedPhases,
                activePhases,
                draftPhases,
                currentPhase: activePhases > 0 ? phaseTimeline.find((p: any) => p.mealPlan.status === 'active')?.phase : null,
                totalPaymentAmount: totalPayments,
                totalPayments: payments.length
            },
            phases: phaseTimeline,
            payments: payments.map((p: any) => ({
                id: p._id,
                amount: p.amount,
                paymentType: p.paymentType,
                status: p.status,
                paidAt: p.paidAt,
                phaseTag: p.phaseTag,
                phaseNumber: p.phaseNumber,
                linkedMealPlanCount: p.linkedMealPlanIds?.length || 0
            }))
        });

    } catch (error) {
        console.error('[PhaseHistory] Error fetching phase history:', error);
        return NextResponse.json({
            error: 'Failed to fetch phase history',
            message: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
