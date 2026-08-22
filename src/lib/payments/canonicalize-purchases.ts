type PurchaseRecord = {
  _id?: unknown;
  client?: unknown;
  paymentLink?: unknown;
  otherPlatformPayment?: unknown;
  razorpayOrderId?: unknown;
  razorpayPaymentId?: unknown;
  razorpayPaymentLinkId?: unknown;
  transactionId?: unknown;
  stripePaymentIntentId?: unknown;
  planName?: unknown;
  durationDays?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  finalAmount?: unknown;
  amount?: unknown;
  daysUsed?: unknown;
  mealPlanCreated?: unknown;
  linkedMealPlanIds?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

const LEGACY_DUPLICATE_CREATION_WINDOW_MS = 5 * 60 * 1000;

function idValue(value: unknown): string {
  if (!value) return "";
  if (typeof value === "object" && value !== null && "_id" in value) {
    return String((value as { _id?: unknown })._id || "");
  }
  return String(value);
}

function dateValue(value: unknown): number | null {
  if (!value) return null;
  const timestamp = new Date(value as string | number | Date).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function numberValue(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function strongPaymentIdentity(purchase: PurchaseRecord): string | null {
  const identities = [
    ["payment-link", purchase.paymentLink],
    ["other-platform", purchase.otherPlatformPayment],
    ["razorpay-order", purchase.razorpayOrderId],
    ["razorpay-payment", purchase.razorpayPaymentId],
    ["razorpay-link", purchase.razorpayPaymentLinkId],
    ["transaction", purchase.transactionId],
    ["stripe", purchase.stripePaymentIntentId],
  ] as const;

  for (const [type, value] of identities) {
    const normalized = idValue(value).trim();
    if (normalized) return `${type}:${normalized}`;
  }

  return null;
}

function legacyEntitlementSignature(purchase: PurchaseRecord): string | null {
  const clientId = idValue(purchase.client);
  const planName = String(purchase.planName || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const durationDays = numberValue(purchase.durationDays);
  const startDate = dateValue(purchase.startDate);
  const endDate = dateValue(purchase.endDate);

  // Missing entitlement dates remain separate so renewals cannot be merged.
  if (
    !clientId ||
    !planName ||
    !durationDays ||
    startDate === null ||
    endDate === null
  ) {
    return null;
  }

  const amount = numberValue(purchase.finalAmount || purchase.amount);
  return [clientId, planName, durationDays, startDate, endDate, amount].join(
    "|",
  );
}

function canonicalScore(
  purchase: PurchaseRecord,
): [number, number, number, number] {
  const linkedCount = Array.isArray(purchase.linkedMealPlanIds)
    ? purchase.linkedMealPlanIds.length
    : 0;
  return [
    numberValue(purchase.daysUsed),
    purchase.mealPlanCreated ? 1 : 0,
    linkedCount,
    dateValue(purchase.updatedAt || purchase.createdAt) || 0,
  ];
}

function isBetterCanonical(
  candidate: PurchaseRecord,
  current: PurchaseRecord,
): boolean {
  const candidateScore = canonicalScore(candidate);
  const currentScore = canonicalScore(current);
  for (let index = 0; index < candidateScore.length; index += 1) {
    if (candidateScore[index] !== currentScore[index]) {
      return candidateScore[index] > currentScore[index];
    }
  }
  return false;
}

export function canonicalizePurchaseRecords<T extends PurchaseRecord>(
  records: T[],
): {
  purchases: T[];
  duplicateEntriesDetected: number;
} {
  const groups: Array<{
    key: string;
    creationAnchor: number | null;
    canonical: T;
  }> = [];

  for (const purchase of records) {
    const strongIdentity = strongPaymentIdentity(purchase);
    const legacySignature = strongIdentity
      ? null
      : legacyEntitlementSignature(purchase);
    const createdAt = dateValue(purchase.createdAt);

    const matchingGroup = strongIdentity
      ? groups.find((group) => group.key === `strong:${strongIdentity}`)
      : legacySignature && createdAt !== null
        ? groups.find(
            (group) =>
              group.key === `legacy:${legacySignature}` &&
              group.creationAnchor !== null &&
              Math.abs(group.creationAnchor - createdAt) <=
                LEGACY_DUPLICATE_CREATION_WINDOW_MS,
          )
        : undefined;

    if (!matchingGroup) {
      groups.push({
        key: strongIdentity
          ? `strong:${strongIdentity}`
          : legacySignature
            ? `legacy:${legacySignature}`
            : `record:${idValue(purchase._id)}`,
        creationAnchor: createdAt,
        canonical: purchase,
      });
      continue;
    }

    if (isBetterCanonical(purchase, matchingGroup.canonical)) {
      matchingGroup.canonical = purchase;
    }
  }

  return {
    purchases: groups.map((group) => group.canonical),
    duplicateEntriesDetected: Math.max(0, records.length - groups.length),
  };
}
