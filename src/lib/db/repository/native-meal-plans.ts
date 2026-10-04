import { differenceInCalendarDays } from 'date-fns';
import { Timestamp, type Firestore, type DocumentData } from 'firebase-admin/firestore';

export class NativePlanDeletionConflict extends Error {}

function calendarDate(value: unknown): Date {
  const date = value instanceof Timestamp ? value.toDate() : value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new NativePlanDeletionConflict('A remaining phase has invalid dates');
  return date;
}

/** Native Firestore transaction. Retrying a deletion can never refund the same phase twice. */
export async function deleteNativeMealPlan(
  db: Firestore,
  planId: string,
  actor: { id: string; role: 'admin' | 'dietitian' | 'health_counselor' },
):Promise<{deletedPlan:DocumentData|null;restoredDays:number}> {
  if (!['admin', 'dietitian', 'health_counselor'].includes(actor.role)) throw new Error('Forbidden');
  if (!planId || planId.includes('/') || !actor.id) throw new Error('Invalid plan or actor');
  const planRef = db.collection('clientmealplans').doc(planId);
  return db.runTransaction(async tx => {
    const [snapshot, actorSnapshot] = await tx.getAll(planRef,db.collection('users').doc(actor.id));
    const currentActor=actorSnapshot.data(),role=currentActor?.role==='dietician'?'dietitian':currentActor?.role;
    if(!currentActor||currentActor.isActive===false||['inactive','suspended'].includes(currentActor.status)||!['admin','dietitian','health_counselor'].includes(role))throw new Error('Forbidden');
    const plan = snapshot.data();
    if (!plan || plan.isDeleted) return { deletedPlan: null, restoredDays: 0 };
    const draft = plan.status === 'draft' && !plan.firstPublishedAt;
    if (role !== 'admin' && !draft) throw new Error('Only admins can delete published plans');
    if (role !== 'admin') {
      const client = typeof plan.clientId === 'string'
        ? (await tx.get(db.collection('users').doc(plan.clientId))).data() : undefined;
      const assigned = role === 'health_counselor'
        ? client?.assignedHealthCounselor === actor.id || client?.assignedHealthCounselors?.includes(actor.id)
        : client?.assignedDietitian === actor.id || client?.assignedDietitians?.includes(actor.id);
      if (!assigned) throw new Error('Forbidden: client is not assigned to this staff member');
    }

    // All reads precede all writes, including the query read protecting concurrent publications.
    let updatePurchase: { ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData } | undefined;
    let restoredDays = 0;
    if (plan.purchaseId && plan.status !== 'draft') {
      const purchaseRef = db.collection('unifiedpayments').doc(String(plan.purchaseId));
      const purchase = (await tx.get(purchaseRef)).data();
      if (!purchase || purchase.client !== plan.clientId) throw new NativePlanDeletionConflict('Linked program is missing or belongs to another client');
      const siblings = await tx.get(db.collection('clientmealplans')
        .where('purchaseId', '==', plan.purchaseId).where('clientId', '==', plan.clientId));
      const remaining = siblings.docs.filter(doc => doc.id !== planId && !doc.get('isDeleted') && ['active', 'completed', 'paused'].includes(doc.get('status')));
      const daysUsed = remaining.reduce((sum, doc) => {
        const phase = doc.data();
        const duration = Number(phase.duration) || differenceInCalendarDays(calendarDate(phase.endDate), calendarDate(phase.startDate)) + 1 - (phase.freezedDays?.length || 0);
        if (!Number.isFinite(duration) || duration < 0) throw new NativePlanDeletionConflict('Remaining phase duration is invalid');
        return sum + duration;
      }, 0);
      const programDays = Math.max(0, Number(purchase.durationDays || (purchase.daysUsed || 0) + (purchase.remainingDays || 0)));
      if (!Number.isFinite(programDays)) throw new NativePlanDeletionConflict('Program duration is invalid');
      const remainingDays = Math.max(0, programDays - daysUsed);
      restoredDays = Math.max(0, remainingDays - Math.max(0, Number(purchase.remainingDays || 0)));
      updatePurchase = { ref: purchaseRef, data: {
        daysUsed, remainingDays, mealPlanCreated: remaining.length > 0,
        linkedMealPlanIds: (purchase.linkedMealPlanIds || []).filter((id: string) => id !== planId),
        ...(purchase.mealPlan === planId ? {mealPlan: remaining.at(-1)?.id || null} : {}),
        updatedAt: Timestamp.now(),
      } };
    }
    tx.update(planRef, {
      isDeleted: true, deletedAt: Timestamp.now(), deletedBy: actor.id,
      deletionReason: draft ? 'staff-requested-draft-delete' : 'admin-requested-plan-delete',
      status: 'cancelled', updatedAt: Timestamp.now(),
    });
    if (updatePurchase) tx.update(updatePurchase.ref, updatePurchase.data);
    return { deletedPlan: { ...plan, _id: planId }, restoredDays };
  });
}
