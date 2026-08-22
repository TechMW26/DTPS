import connectDB from "@/lib/db/connection";
import ClientMealPlan from "@/lib/db/models/ClientMealPlan";
import MealEngagementDispatch from "@/lib/db/models/MealEngagementDispatch";
import User from "@/lib/db/models/User";
import { sendNotificationToUser } from "@/lib/firebase/firebaseNotification";
import { MEAL_TYPES, type MealTypeKey } from "@/lib/mealConfig";

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
    return [completion.mealType, completion.mealTypeOriginal]
      .map(normalized)
      .includes(mealKey);
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

  const dayData = planDays[dayIndex % planDays.length];
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
  await connectDB();
  const parts = zonedParts(now);
  const mealDate = getZonedDateKey(now);
  const currentMinute = parts.hour * 60 + parts.minute;
  const lookbackMinutes = Math.max(
    1,
    Math.min(Number(process.env.MEAL_REMINDER_LOOKBACK_MINUTES || 4), 15),
  );

  await MealEngagementDispatch.deleteMany({ expiresAt: { $lt: now } });

  const plans = (await ClientMealPlan.find({
    status: "active",
    isDeleted: { $ne: true },
    startDate: { $lte: new Date(now.getTime() + 86_400_000) },
    endDate: { $gte: new Date(now.getTime() - 86_400_000) },
    "reminders.mealReminders": { $ne: false },
  })
    .select("clientId startDate endDate meals mealTypes mealCompletions freezedDays reminders templateId")
    .populate("templateId", "meals")
    .lean()) as LooseRecord[];

  const clientIds = [...new Set(plans.map((plan) => String(plan.clientId)).filter(Boolean))];
  const users = (await User.find({ _id: { $in: clientIds } })
    .select("settings.mealReminders settings.pushNotifications reminderPreferences.mealReminders")
    .lean()) as LooseRecord[];
  const preferencesByClient = new Map(
    users.map((user) => [String(user._id), user]),
  );

  const summary = { plans: plans.length, due: 0, sent: 0, duplicates: 0, failed: 0 };
  for (const plan of plans) {
    if (!allowsMealEngagement(preferencesByClient.get(String(plan.clientId)))) continue;
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

      try {
        await MealEngagementDispatch.create({
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
      } catch (error) {
        const errorCode = error && typeof error === "object" && "code" in error
          ? (error as { code?: number }).code
          : undefined;
        if (errorCode === 11000) {
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
        const result = await sendNotificationToUser(clientId, {
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

        await MealEngagementDispatch.updateOne(
          { _id: dispatchId },
          {
            $set: {
              status: "sent",
              result: {
                successCount: result.successCount,
                failureCount: result.failureCount,
                errorCode: result.errorCode,
                storedInApp: true,
              },
            },
          },
        );
        summary.sent++;
      } catch (error) {
        summary.failed++;
        await MealEngagementDispatch.updateOne(
          { _id: dispatchId },
          { $set: { status: "failed", result: { error: String(error) } } },
        );
        console.error("[MealEngagement] Failed to send notification", error);
      }
    }
  }

  return summary;
}
