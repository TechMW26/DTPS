import { FieldValue, Timestamp, type Firestore, type DocumentData } from 'firebase-admin/firestore';
import { computeClientStatusFromDocs } from '@/lib/status/computeClientStatus';
import { ClientStatus } from '@/types';

function date(value: unknown): Date | undefined {
  if (value == null) return undefined;
  const result = value instanceof Timestamp ? value.toDate() : new Date(value as string);
  return Number.isFinite(result.getTime()) ? result : undefined;
}

function paymentDates(data: DocumentData) {
  return { ...data, expectedEndDate: date(data.expectedEndDate), endDate: date(data.endDate) };
}

function payments(db: Firestore, clientId: string) {
  return db.collection('unifiedpayments').where('client', '==', clientId)
    .select('status', 'paymentStatus', 'expectedEndDate', 'endDate');
}

export async function recalculateNativeClientStatus(
  db: Firestore, clientId: string,
  meta?: { trigger?: string; changedBy?: string; isManual?: boolean; relatedEvent?: string },
) {
  const ref = db.collection('users').doc(clientId);
  return db.runTransaction(async tx => {
    const client = (await tx.get(ref)).data();
    if (!client) return ClientStatus.LEAD;
    const purchases = await tx.get(payments(db, clientId));
    const status = computeClientStatusFromDocs(purchases.docs.map(doc => paymentDates(doc.data())), !!client.holdStatus?.isOnHold);
    if (client.clientStatus !== status) {
      tx.update(ref, {
        clientStatus: status, updatedAt: new Date(),
        clientStatusHistory: FieldValue.arrayUnion({
          previousStatus: client.clientStatus || null, newStatus: status,
          changedBy: meta?.changedBy || null, isManual: !!meta?.isManual,
          trigger: meta?.trigger || 'auto', relatedEvent: meta?.relatedEvent || null,
          timestamp: new Date(),
        }),
      });
    }
    return status;
  });
}

export async function findNativeActivePlan(db: Firestore, clientId: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const plans = await db.collection('clientmealplans').where('clientId', '==', clientId)
    .where('status', '==', 'active').where('endDate', '>=', today)
    .select('startDate', 'endDate', 'isDeleted').get();
  // Historical documents may omit isDeleted, so a false-equality query would hide them.
  const plan = plans.docs.find(doc => !doc.get('isDeleted'));
  return plan ? { startDate: date(plan.get('startDate')), endDate: date(plan.get('endDate')) } : null;
}

export async function nativeClientStatusInfo(db: Firestore, clientId: string) {
  const [plan, purchases, client] = await Promise.all([
    findNativeActivePlan(db, clientId), payments(db, clientId).get(), db.collection('users').doc(clientId).get(),
  ]);
  return {
    clientStatus: computeClientStatusFromDocs(purchases.docs.map(doc => paymentDates(doc.data())), !!client.get('holdStatus')?.isOnHold),
    hasActivePlan: !!plan, activePlanStartDate: plan?.startDate, activePlanEndDate: plan?.endDate,
  };
}
