import type {Firestore} from 'firebase-admin/firestore';
import { candidateCacheDuration, mealEngagementCandidateCache, reusableCandidates, type MealEngagementCandidateCache } from './mealEngagementCandidates';
import { getNativeDatabase } from '@/lib/db/firestore-native';
import { hydrateNativeDocument } from '@/lib/storage/native-document';
import { nativeDates } from '@/lib/db/repository/native-plan-editor';
import { createHash } from 'node:crypto';
import { sendNotificationToUser } from "@/lib/firebase/firebaseNotification";
import { MEAL_TYPES, type MealTypeKey } from "@/lib/mealConfig";
import { isValidMealTimeZone, completionMatchesMeal } from '@/lib/task-schedule';

export const MEAL_NOTIFICATION_TIMEZONE =
  process.env.MEAL_NOTIFICATION_TIMEZONE || "Asia/Kolkata";

// Plans contain both current and legacy/custom meal shapes, so this boundary is intentionally dynamic.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseRecord = Record<string, any>;

export interface ScheduledMealEngagement {
  mealId: string;
  mealType: string;
  label: string;
  displayTime: string;
  minuteOfDay: number;
  foodNames: string[];
}

export type DueMealEvent = ScheduledMealEngagement & {
  eventType: "upcoming" | "photo_prompt";
  targetMinute: number;
};

export function allowsMealEngagement(user?: LooseRecord): boolean {
  if (!user) return true;
  return user.settings?.mealReminders !== false
    && user.settings?.pushNotifications !== false
    && user.reminderPreferences?.mealReminders !== false;
}

function normalized(value: unknown): string {
  return String(value || "").toLowerCase().replace(/[\s_-]+/g, "");
}

function titleCase(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function parseMealTimeToMinutes(value: unknown): number | null {
  const match = String(value || "")
    .trim()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3]?.toLowerCase();
  if (minute > 59) return null;

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) hour = 0;
    if (meridiem === "pm") hour += 12;
  } else if (hour > 23) {
    return null;
  }

  return hour * 60 + minute;
}

function zonedParts(date: Date, timeZone = MEAL_NOTIFICATION_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

export function getZonedDateKey(
  date: Date,
  timeZone = MEAL_NOTIFICATION_TIMEZONE,
): string {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function dateKeyDayNumber(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function resolveBuiltInMealType(value: unknown): MealTypeKey | null {
  const key = normalized(value);
  const aliases: Record<string, MealTypeKey> = {
    earlymorning: "EARLY_MORNING",
    breakfast: "BREAKFAST",
    midmorning: "MID_MORNING",
    morningsnack: "MID_MORNING",
    lunch: "LUNCH",
    midevening: "MID_EVENING",
    afternoonsnack: "MID_EVENING",
    evening: "EVENING",
    eveningsnack: "EVENING",
    dinner: "DINNER",
    pastdinner: "PAST_DINNER",
    postdinner: "PAST_DINNER",
    bedtime: "PAST_DINNER",
  };
  return aliases[key] || null;
}

function flattenFoods(meal: LooseRecord): LooseRecord[] {
  const foods = meal?.foods || meal?.items || meal?.foodOptions || [];
  if (!Array.isArray(foods)) return [];
  return foods.flatMap((food) =>
    Array.isArray(food?.foods) && food.foods.length ? food.foods : [food],
  );
}

function completionMatches(
  completions: LooseRecord[],
  mealDate: string,
  mealType: string,
): boolean {
  const mealKey = normalized(mealType);
  return completions.some((completion) => {
    if (!completion?.completed) return false;
    const completionDate = getZonedDateKey(new Date(completion.date));
    if (completionDate !== mealDate) return false;
    return completionMatchesMeal(completion, mealKey);
  });
}

function mealTypeSchedule(plan: LooseRecord, mealType: string): LooseRecord | undefined {
  const mealKey = normalized(mealType);
  return (plan.mealTypes || []).find(
    (entry: LooseRecord) => normalized(entry?.name) === mealKey,
  );
}

function buildSchedule(
  plan: LooseRecord,
  meal: LooseRecord,
  mealType: string,
  mealId: string,
): ScheduledMealEngagement | null {
  const configured = mealTypeSchedule(plan, mealType);
  const builtIn = resolveBuiltInMealType(mealType);
  const rawTime = meal.time || configured?.time || (builtIn ? MEAL_TYPES[builtIn].time12h : "");
  const minuteOfDay = parseMealTimeToMinutes(rawTime);
  const foods = flattenFoods(meal);
  if (minuteOfDay === null || foods.length === 0) return null;

  const foodNames = foods
    .map((food) => String(food?.food || food?.name || food?.foodName || food?.recipeName || "").trim())
    .filter(Boolean)
    .slice(0, 3);

  return {
    mealId,
    mealType,
    label: meal.label || configured?.name || (builtIn ? MEAL_TYPES[builtIn].label : titleCase(mealType)),
    displayTime: String(rawTime),
    minuteOfDay,
    foodNames,
  };
}

export function getPlanMealSchedules(
  plan: LooseRecord,
  mealDate: string,
): ScheduledMealEngagement[] {
  const planStartKey = getZonedDateKey(new Date(plan.startDate));
  const planEndKey = getZonedDateKey(new Date(plan.endDate));
  if (mealDate < planStartKey || mealDate > planEndKey) return [];

  const isFrozen = (plan.freezedDays || []).some(
    (entry: LooseRecord) => getZonedDateKey(new Date(entry.date)) === mealDate,
  );
  if (isFrozen) return [];

  const dayIndex = dateKeyDayNumber(mealDate) - dateKeyDayNumber(planStartKey);
  if (dayIndex < 0) return [];

  const planDays = plan.meals?.length
    ? plan.meals
    : plan.templateId?.meals || [];
  if (!planDays.length) return [];

  const dayData = planDays.find((day: LooseRecord) => day.date && getZonedDateKey(new Date(day.date)) === mealDate)
    || (plan.meals?.length ? planDays[dayIndex] : planDays[dayIndex % planDays.length]);
  const mealsData = dayData?.meals || dayData;
  const completions = Array.isArray(plan.mealCompletions) ? plan.mealCompletions : [];
  const schedules: ScheduledMealEngagement[] = [];

  if (Array.isArray(mealsData)) {
    mealsData.forEach((meal, index) => {
      const defaultMealType = (Object.keys(MEAL_TYPES) as MealTypeKey[])[
        index % Object.keys(MEAL_TYPES).length
      ] || "BREAKFAST";
      const mealType = String(meal?.mealType || meal?.type || defaultMealType).trim();
      if (completionMatches(completions, mealDate, mealType)) return;
      const schedule = buildSchedule(plan, meal, mealType, `${plan._id}-${dayIndex}-${index}`);
      if (schedule) schedules.push(schedule);
    });
    return schedules;
  }

  if (!mealsData || typeof mealsData !== "object") return schedules;
  let mealIndex = 0;
  Object.entries(mealsData).forEach(([mealType, mealValue]) => {
    const meal = mealValue as LooseRecord;
    if (!meal || typeof meal !== "object" || Array.isArray(meal)) return;
    // Match the client API's indexing exactly, including configured empty meal arrays.
    const hasFoodData = Boolean(meal.foods || meal.items || meal.foodOptions);
    const isMeal = hasFoodData || Boolean(resolveBuiltInMealType(mealType));
    if (!isMeal) return;

    const currentIndex = mealIndex++;
    if (completionMatches(completions, mealDate, mealType)) return;
    const schedule = buildSchedule(
      plan,
      meal,
      mealType,
      `${plan._id}-${dayIndex}-${currentIndex}`,
    );
    if (schedule) schedules.push(schedule);
  });
  return schedules;
}

export function getDueMealEvents(
  schedules: ScheduledMealEngagement[],
  minuteOfDay: number,
  lookbackMinutes = 4,
): DueMealEvent[] {
  const events: DueMealEvent[] = [];
  for (const schedule of schedules) {
    const targets: Array<{ eventType: DueMealEvent["eventType"]; targetMinute: number }> = [
      { eventType: "upcoming", targetMinute: schedule.minuteOfDay - 30 },
      { eventType: "photo_prompt", targetMinute: schedule.minuteOfDay },
    ];
    for (const target of targets) {
      const elapsed = minuteOfDay - target.targetMinute;
      if (target.targetMinute >= 0 && elapsed >= 0 && elapsed < lookbackMinutes) {
        events.push({ ...schedule, ...target });
      }
    }
  }
  return events;
}

function scheduledDateForEvent(now: Date, currentMinute: number, targetMinute: number): Date {
  return new Date(now.getTime() - (currentMinute - targetMinute) * 60_000);
}

export async function runMealEngagementNotifications(now = new Date()) {
  // Local migration validation must never send real reminders or create delivery claims.
  if (process.env.NODE_ENV !== 'production') {
    return { plans: 0, due: 0, sent: 0, duplicates: 0, failed: 0, skipped: 'local_delivery_disabled' };
  }
  const db = getNativeDatabase();
  return runNativeMealEngagementNotifications(db, now, sendNotificationToUser, mealEngagementCandidateCache(db));
}

/** Injectable provider boundary allows emulator regressions without outbound delivery. */
export async function runNativeMealEngagementNotifications(db:Firestore,now:Date,deliver:typeof sendNotificationToUser, candidateCache?: MealEngagementCandidateCache){
  const lookbackMinutes = Math.max(
    1,
    Math.min(Number(process.env.MEAL_REMINDER_LOOKBACK_MINUTES || 4), 15),
  );

  const cacheDuration = candidateCacheDuration(lookbackMinutes);
  const cached = candidateCache ? await candidateCache.get() : null;
  const reuse = reusableCandidates(cached, now, cacheDuration);
  // A cached discovery contains only candidates. Always reload due plans and
  // preferences before checking completion, freezes, holds, or notification opt-outs.
  async function loadCandidateDocuments(ids: string[]) {
    const batches: FirebaseFirestore.DocumentSnapshot[][] = [];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(3, Math.ceil(ids.length / 100)) }, async () => {
      for (;;) {
        const slot = next++, batch = ids.slice(slot * 100, (slot + 1) * 100);
        if (!batch.length) return;
        batches[slot] = await db.getAll(...batch.map(id => db.collection('clientmealplans').doc(id)));
      }
    }));
    return batches.flat().filter(doc => doc.exists);
  }
  const documents = reuse
    ? await loadCandidateDocuments(cached.planIds)
    : (await db.collection('clientmealplans')
    .where('status', '==', 'active')
    .where('startDate', '<=', new Date(now.getTime() + 86_400_000))
    .where('endDate', '>=', new Date(now.getTime() - 86_400_000)).get()).docs;
  const plans: LooseRecord[] = [];
  // Hydrate large plan fields stored in Blob before calculating reminder schedules.
  for (let offset = 0; offset < documents.length; offset += 10) {
    await Promise.all(documents.slice(offset, offset + 10).map(async doc => {
      const plan = nativeDates(await hydrateNativeDocument(doc.data()!));
      if (plan.status !== 'active' || plan.isDeleted || plan.reminders?.mealReminders === false) return;
      if (!plan.meals?.length && typeof plan.templateId === 'string') {
        const template = await db.collection('diettemplates').doc(plan.templateId).get();
        if (template.exists) plan.templateId = nativeDates(await hydrateNativeDocument(template.data()!));
      }
      plans.push({ ...plan, _id: doc.id });
    }));
  }
  const clientIds: string[] = [...new Set(plans.map(plan => String(plan.clientId)).filter(Boolean))];
  const users: LooseRecord[] = [];
  for (let offset = 0; offset < clientIds.length; offset += 100) {
    const rows = await db.getAll(...clientIds.slice(offset, offset + 100).map(id => db.collection('users').doc(id)),
      { fieldMask: ['settings', 'reminderPreferences', 'notificationTimeZone', 'holdStatus'] });
    users.push(...rows.filter(row => row.exists).map(row => ({ ...row.data(), _id: row.id })));
  }
  const preferencesByClient = new Map(
    users.map((user) => [String(user._id), user]),
  );

  if (!reuse && candidateCache && cacheDuration > 0) {
    // Include every minute through expiry, including local midnight. New/retimed
    // plans are rediscovered before their existing lookback window elapses.
    const candidateIds = plans.filter(plan => {
      const user = preferencesByClient.get(String(plan.clientId));
      const timeZone = isValidMealTimeZone(user?.notificationTimeZone) ? user.notificationTimeZone : MEAL_NOTIFICATION_TIMEZONE;
      for (let offset = 0; offset <= cacheDuration; offset += 60_000) {
        const at = new Date(now.getTime() + offset);
        const parts = zonedParts(at, timeZone);
        if (getDueMealEvents(getPlanMealSchedules(plan, getZonedDateKey(at, timeZone)), parts.hour * 60 + parts.minute, lookbackMinutes).length) return true;
      }
      return false;
    }).map(plan => String(plan._id));
    await candidateCache.set({ generatedAt: now.getTime(), expiresAt: now.getTime() + cacheDuration, planIds: candidateIds, plans: plans.length });
  }

  const summary = { plans: reuse ? cached.plans : plans.length, due: 0, sent: 0, duplicates: 0, failed: 0, discoveryCached: reuse, plansLoaded: plans.length };
  async function processPlan(plan: LooseRecord) {
    const user = preferencesByClient.get(String(plan.clientId));
    if (!user || !allowsMealEngagement(user) || user?.holdStatus?.isOnHold) return;
    const timeZone = isValidMealTimeZone(user?.notificationTimeZone) ? user.notificationTimeZone : MEAL_NOTIFICATION_TIMEZONE;
    const parts = zonedParts(now, timeZone);
    const mealDate = getZonedDateKey(now, timeZone);
    const currentMinute = parts.hour * 60 + parts.minute;
    const events = getDueMealEvents(
      getPlanMealSchedules(plan, mealDate),
      currentMinute,
      lookbackMinutes,
    );
    summary.due += events.length;

    for (const event of events) {
      const planId = String(plan._id);
      const clientId = String(plan.clientId);
      const dispatchId = `${planId}:${mealDate}:${event.mealId}:${event.eventType}`;
      const scheduledFor = scheduledDateForEvent(now, currentMinute, event.targetMinute);

      const dispatch = db.collection('mealengagementdispatches').doc(createHash('sha256').update(dispatchId).digest('hex'));
      try {
        await db.runTransaction(async tx=>{
          const current=await tx.get(dispatch);
          if(current.exists)throw Object.assign(new Error('Dispatch already claimed'),{code:6});
          // Only legacy records need the compatibility lookup. Most overlapping
          // cron attempts already have a deterministic claim and stop above.
          const existing=await tx.get(db.collection('mealengagementdispatches').where('_id','==',dispatchId).limit(1));
          if(!existing.empty)throw Object.assign(new Error('Dispatch already claimed'),{code:6});
          tx.create(dispatch,{
          _id: dispatchId,
          clientId,
          mealPlanId: planId,
          mealId: event.mealId,
          mealDate,
          eventType: event.eventType,
          scheduledFor,
          status: "processing",
          expiresAt: new Date(now.getTime() + 45 * 86_400_000),
          });
        });
      } catch (error) {
        const errorCode = error && typeof error === "object" && "code" in error
          ? (error as { code?: number }).code
          : undefined;
        if (errorCode === 6) {
          summary.duplicates++;
          continue;
        }
        summary.failed++;
        console.error("[MealEngagement] Failed to claim notification", error);
        continue;
      }

      const clickAction = `/user/plan?${new URLSearchParams({
        date: mealDate,
        mealId: event.mealId,
        mealType: event.mealType,
        action: "camera",
      }).toString()}`;
      const foodSummary = event.foodNames.length
        ? ` (${event.foodNames.join(", ")})`
        : "";
      const isPhotoPrompt = event.eventType === "photo_prompt";

      try {
        const result = await deliver(clientId, {
          title: isPhotoPrompt
            ? `${event.label} time — show us your plate`
            : `${event.label} in 30 minutes`,
          body: isPhotoPrompt
            ? `Your ${event.label.toLowerCase()}${foodSummary} is ready. Tap to take a photo and complete your meal.`
            : `Your meal is scheduled for ${event.displayTime}${foodSummary}. Time to get it ready!`,
          icon: "/icons/icon-192x192.png",
          data: {
            type: isPhotoPrompt ? "meal_photo_prompt" : "meal_upcoming",
            actionType: isPhotoPrompt ? "open_meal_camera" : "view_meal",
            planId,
            mealId: event.mealId,
            mealType: event.mealType,
            mealLabel: event.label,
            mealDate,
            scheduledTime: event.displayTime,
            clickAction,
            url: clickAction,
            tag: dispatchId,
          },
          clickAction,
        });

        await dispatch.update({
          status: result.successCount > 0 ? 'sent' : 'failed',
          result: {
            successCount: result.successCount,
            failureCount: result.failureCount,
            errorCode: result.errorCode || null,
            providerErrors: [...new Set(result.responses?.map(response => response.error).filter(Boolean))],
            storedInApp: true,
          },
          updatedAt: new Date(),
        });
        if (result.successCount > 0) summary.sent++;
        else summary.failed++;
      } catch (error) {
        summary.failed++;
        await dispatch.update({ status: 'failed', result: { error: 'DELIVERY_FAILED' }, updatedAt: new Date() });
        console.error("[MealEngagement] Notification delivery was not confirmed");
      }
    }
  }

  // Bound concurrent sends so one busy meal slot does not run serially for
  // thousands of clients or open unbounded Firebase/DB requests.
  for (let index = 0; index < plans.length; index += 10) {
    await Promise.all(plans.slice(index, index + 10).map(processPlan));
  }

  return summary;
}
