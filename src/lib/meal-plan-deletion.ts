import mongoose from "mongoose";
import { differenceInCalendarDays } from "date-fns";
import ClientMealPlan from "@/lib/db/models/ClientMealPlan";
import UnifiedPayment from "@/lib/db/models/UnifiedPayment";

export class PlanDeletionConflict extends Error {}

/** Remove the plan and reconcile its program allocation as one atomic operation. */
export async function deleteMealPlanWithAllocation(
  planId: string,
  actorId: string,
  hasPurchase: boolean,
) {
  const remove = async (session?: mongoose.ClientSession) => {
    const deletedPlan = await ClientMealPlan.findOneAndUpdate(
      { _id: planId, isDeleted: { $ne: true } },
      { $set: {
        isDeleted: true, deletedAt: new Date(), deletedBy: actorId,
        deletionReason: "admin-requested-plan-delete", status: "cancelled",
      } },
      { new: false, session },
    );
    if (!deletedPlan) return { deletedPlan: null, restoredDays: 0 };

    // Drafts never consume program days. Plans without a purchase have no balance to credit.
    if (!deletedPlan.purchaseId || deletedPlan.status === "draft") {
      return { deletedPlan, restoredDays: 0 };
    }

    const purchase = await UnifiedPayment.findOne({
      _id: deletedPlan.purchaseId, client: deletedPlan.clientId,
    }).session(session!);
    if (!purchase) {
      throw new PlanDeletionConflict("The linked program could not be found. Restore its link before deleting this plan.");
    }

    // Use the same allocated phases as publication. duration excludes free freeze recovery days.
    const remainingPlans = await ClientMealPlan.find({
      purchaseId: purchase._id, clientId: deletedPlan.clientId,
      status: { $in: ["active", "completed", "paused"] },
      isDeleted: { $ne: true },
    }).select("duration startDate endDate freezedDays").session(session!);
    const daysUsed = remainingPlans.reduce((sum, plan) => {
      // Older plans may predate the stored duration field. Do not release their allocation.
      const duration = Number(plan.duration) ||
        differenceInCalendarDays(plan.endDate, plan.startDate) + 1 - (plan.freezedDays?.length || 0);
      if (!Number.isFinite(duration) || duration < 0) {
        throw new PlanDeletionConflict("A remaining phase has invalid dates. Correct it before deleting this plan.");
      }
      return sum + duration;
    }, 0);
    const programDays = Math.max(0, Number(purchase.durationDays ||
      (purchase.daysUsed || 0) + (purchase.remainingDays || 0)));
    const remainingDays = Math.max(0, programDays - daysUsed);
    const restoredDays = Math.max(0, remainingDays - Math.max(0, Number(purchase.remainingDays || 0)));

    await UnifiedPayment.updateOne({ _id: purchase._id }, {
      $set: {
        daysUsed, remainingDays, mealPlanCreated: remainingPlans.length > 0,
        ...(String(purchase.mealPlan) === String(deletedPlan._id)
          ? { mealPlan: remainingPlans[remainingPlans.length - 1]?._id || null } : {}),
      },
      $pull: { linkedMealPlanIds: deletedPlan._id },
    }, { session });
    return { deletedPlan, restoredDays };
  };

  // Linked deletions must never commit without their balance update.
  return hasPurchase ? mongoose.connection.transaction(remove) : remove();
}
