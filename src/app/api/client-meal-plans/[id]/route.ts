import {nativeResponseJson} from '@/lib/api/native-response';
import { validPlanDate, planNeedsDateCorrection } from '@/lib/meal-plan-date-validity';
import { getNativeDatabase } from '@/lib/db/database';
import { NativePlanEditor, nativePlanStaffAccess, appendNativePlanAudit } from '@/lib/db/repository/native-plan-editor';
import { deleteNativeMealPlan, NativePlanDeletionConflict } from '@/lib/db/repository/native-meal-plans';
import { clearCacheByTag } from '@/lib/cache/memoryCache';
import { NextRequest, NextResponse } from "next/server";
import { updateClientStatusFromMealPlan } from "@/lib/status/computeClientStatus";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendNotificationToUser } from "@/lib/firebase/firebaseNotification";
import { logHistoryServer } from "@/lib/server/history";
import { logActivity } from "@/lib/utils/activityLogger";
import { addDays, differenceInDays, format, startOfDay } from "date-fns";
import { UserRole } from "@/types";
import { grantDietPlanAccess } from "@/lib/auth/onboarding-access";
import { checkPhaseStartPolicy } from "@/lib/meal-plan-phase-continuity";
import { resolveEntitlementEndDate } from "@/lib/payments/entitlement-dates";

const hasPublishableMealData = (meals: any[] | undefined | null): boolean => {
  if (!Array.isArray(meals) || meals.length === 0) return false;

  return meals.some((day: any) => {
    const dayMeals = day?.meals;
    if (!dayMeals || typeof dayMeals !== "object") return false;

    return Object.values(dayMeals).some((meal: any) => {
      if (!meal) return false;
      const foodOptions = Array.isArray(meal.foodOptions)
        ? meal.foodOptions
        : [];
      if (foodOptions.length === 0) return false;

      return foodOptions.some((option: any) => {
        if (!option) return false;

        if (typeof option.food === "string" && option.food.trim().length > 0)
          return true;

        if (Array.isArray(option.foods)) {
          return option.foods.some(
            (f: any) =>
              !!f &&
              ((typeof f.food === "string" && f.food.trim().length > 0) ||
                (typeof f.name === "string" && f.name.trim().length > 0)),
          );
        }

        return false;
      });
    });
  });
};

const dateKey = (value: unknown): string | null => {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return format(startOfDay(date), "yyyy-MM-dd");
};

const applyFrozenFlagsFromFreezedDays = (plan: any) => {
  const meals = Array.isArray(plan?.meals) ? plan.meals : [];
  const freezedDays = Array.isArray(plan?.freezedDays) ? plan.freezedDays : [];

  if (meals.length === 0 || freezedDays.length === 0) {
    return plan;
  }

  const frozenDateSet = new Set(
    freezedDays
      .map((fd: any) => dateKey(fd?.date))
      .filter((v: string | null): v is string => Boolean(v)),
  );

  if (frozenDateSet.size === 0) {
    return plan;
  }

  const normalizedMeals = meals.map((meal: any) => {
    const mealDateKey = dateKey(meal?.date);
    if (!mealDateKey) return meal;

    if (frozenDateSet.has(mealDateKey)) {
      return { ...meal, isFrozen: true };
    }

    return meal;
  });

  return {
    ...plan,
    meals: normalizedMeals,
  };
};

/**
 * Merge incoming meals with existing meals while ALWAYS preserving freeze
 * recovery days and frozen flags. The MealGridTable client may serialize the
 * meals array without the recovery days (or strip metadata flags) when the
 * dietitian edits and re-publishes — this helper guarantees recovery days
 * never disappear and frozen-flag metadata stays intact.
 *
 * Rules:
 *   1. Every recovery day (addedDate in existingPlan.freezedDays) that is
 *      missing from incoming meals is re-attached from existing meals.
 *   2. For incoming meals at a recovery date, the recovery metadata
 *      (`isFreezeRecovery`, `originalFreezeDate`, `originalFreezeDateLabel`)
 *      is force-restored from existing data even if the client dropped it.
 *   3. For incoming meals at an originally-frozen date, `isFrozen: true` is
 *      re-applied.
 *   4. The merged array is sorted by `date`.
 */
const mergeMealsPreservingFreezeRecovery = (
  incomingMeals: any[],
  existingPlan: any,
): any[] => {
  const safeIncoming = Array.isArray(incomingMeals) ? incomingMeals : [];
  const existingMeals: any[] = Array.isArray(existingPlan?.meals)
    ? existingPlan.meals
    : [];
  const freezedDays: any[] = Array.isArray(existingPlan?.freezedDays)
    ? existingPlan.freezedDays
    : [];

  if (freezedDays.length === 0) {
    return safeIncoming;
  }

  const recoveryDateSet = new Set<string>();
  const frozenDateSet = new Set<string>();
  for (const fd of freezedDays) {
    const addedKey = dateKey(fd?.addedDate);
    if (addedKey) recoveryDateSet.add(addedKey);
    const origKey = dateKey(fd?.date);
    if (origKey) frozenDateSet.add(origKey);
  }

  const existingByDate = new Map<string, any>();
  for (const meal of existingMeals) {
    const key = dateKey(meal?.date);
    if (key) existingByDate.set(key, meal);
  }

  const incomingByDate = new Map<string, any>();
  for (const meal of safeIncoming) {
    const key = dateKey(meal?.date);
    if (key) incomingByDate.set(key, meal);
  }

  const merged: any[] = [];

  // 1. Walk incoming meals first (preserves caller-provided ordering hints).
  for (const meal of safeIncoming) {
    const key = dateKey(meal?.date);
    if (!key) {
      merged.push(meal);
      continue;
    }

    let next = meal;
    if (recoveryDateSet.has(key)) {
      const existing = existingByDate.get(key) || {};
      // Force-restore recovery metadata that the client may have stripped.
      next = {
        ...meal,
        isFreezeRecovery: true,
        originalFreezeDate:
          meal?.originalFreezeDate || existing?.originalFreezeDate,
        originalFreezeDateLabel:
          meal?.originalFreezeDateLabel || existing?.originalFreezeDateLabel,
      };
    }

    if (frozenDateSet.has(key)) {
      next = { ...next, isFrozen: true };
    }

    merged.push(next);
  }

  // 2. Re-attach any recovery day the client dropped entirely.
  for (const fd of freezedDays) {
    const addedKey = dateKey(fd?.addedDate);
    if (!addedKey) continue;
    if (incomingByDate.has(addedKey)) continue;

    const existing = existingByDate.get(addedKey);
    if (existing) {
      merged.push({ ...existing, isFreezeRecovery: true });
    }
  }

  // 3. Sort by date so the timeline is contiguous.
  merged.sort((a: any, b: any) => {
    const aTime = a?.date ? new Date(a.date).getTime() : 0;
    const bTime = b?.date ? new Date(b.date).getTime() : 0;
    return aTime - bTime;
  });

  return merged;
};

/**
 * After merging meals, the resulting end date must encompass every recovery
 * day. If the caller sent a shorter endDate (or omitted it), expand it to the
 * latest meal date in the merged array.
 */
const resolveEndDateCoveringMeals = (
  candidateEndDate: Date | null,
  mergedMeals: any[],
): Date | null => {
  if (!Array.isArray(mergedMeals) || mergedMeals.length === 0)
    return candidateEndDate;

  let latest: Date | null = null;
  for (const meal of mergedMeals) {
    if (!meal?.date) continue;
    const d = new Date(meal.date);
    if (Number.isNaN(d.getTime())) continue;
    if (!latest || d.getTime() > latest.getTime()) latest = d;
  }

  if (!latest) return candidateEndDate;
  if (!candidateEndDate) return latest;
  return candidateEndDate.getTime() >= latest.getTime()
    ? candidateEndDate
    : latest;
};

const shiftDateValue = (value: any, deltaDays: number): Date | null => {
  if (!value || deltaDays === 0) return value ? new Date(value) : null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return addDays(startOfDay(date), deltaDays);
};

const sortPhasesForCascade = (a: any, b: any): number => {
  const aPhase =
    typeof a?.phaseNumber === "number"
      ? a.phaseNumber
      : Number.MAX_SAFE_INTEGER;
  const bPhase =
    typeof b?.phaseNumber === "number"
      ? b.phaseNumber
      : Number.MAX_SAFE_INTEGER;
  if (aPhase !== bPhase) return aPhase - bPhase;

  const aStart = new Date(a?.startDate || 0).getTime();
  const bStart = new Date(b?.startDate || 0).getTime();
  if (aStart !== bStart) return aStart - bStart;

  const aCreated = new Date(a?.createdAt || 0).getTime();
  const bCreated = new Date(b?.createdAt || 0).getTime();
  return aCreated - bCreated;
};

const cascadeShiftLinkedPhases = async (
  editor: NativePlanEditor,
  anchorPlan: any,
  deltaDays: number,
): Promise<Array<{plan:any;patch:any}>> => {
  const mutations:Array<{plan:any;patch:any}>=[];
  if (!anchorPlan || deltaDays === 0) return mutations;

  const siblingPlans = await Promise.all((await editor.siblings(anchorPlan)).filter(plan=>plan.status!=='draft').map(plan=>editor.hydrate(plan)));
  if (siblingPlans.length === 0) return mutations;

  const orderedPlans = [anchorPlan, ...siblingPlans].sort(sortPhasesForCascade);
  const anchorIndex = orderedPlans.findIndex(
    (plan) => String(plan._id) === String(anchorPlan._id),
  );
  if (anchorIndex < 0 || anchorIndex >= orderedPlans.length - 1) return mutations;

  for (let i = anchorIndex + 1; i < orderedPlans.length; i += 1) {
    const plan = orderedPlans[i];

    const shiftedStartDate = shiftDateValue(plan.startDate, deltaDays);
    const shiftedEndDate = shiftDateValue(plan.endDate, deltaDays);
    if (shiftedStartDate) plan.startDate = shiftedStartDate;
    if (shiftedEndDate) plan.endDate = shiftedEndDate;

    if (Array.isArray(plan.meals)) {
      plan.meals = plan.meals.map((meal: any) => {
        if (!meal?.date) return meal;
        const shiftedMealDate = shiftDateValue(meal.date, deltaDays);
        if (!shiftedMealDate) return meal;
        return {
          ...meal,
          date: shiftedMealDate,
        };
      });
    }

    if (Array.isArray(plan.freezedDays)) {
      plan.freezedDays = plan.freezedDays.map((fd: any) => ({
        ...fd,
        date: shiftDateValue(fd?.date, deltaDays) || fd?.date,
        addedDate: fd?.addedDate
          ? shiftDateValue(fd.addedDate, deltaDays) || fd.addedDate
          : fd?.addedDate,
      }));
    }

    mutations.push({plan,patch:{startDate:plan.startDate,endDate:plan.endDate,meals:plan.meals,freezedDays:plan.freezedDays,updatedAt:new Date()}});
  }
  return mutations;
};

const getNormalizedRole = (role: unknown): string =>
  String(role || "").toLowerCase();

const toActivityRole = (
  role: string,
): "admin" | "dietitian" | "health_counselor" | "client" => {
  if (role === "admin") return "admin";
  if (role === "health_counselor") return "health_counselor";
  if (role === "client") return "client";
  return "dietitian";
};

const isSessionUserAssignedToClient = async (
  sessionUserId: string,
  clientId: string,
  role: string,
  editor: NativePlanEditor,
): Promise<boolean> => {
  const client = await editor.document('users', clientId);

  if (!client) return false;

  if (role === UserRole.DIETITIAN || role === "dietician") {
    return (
      client.assignedDietitian?.toString() === sessionUserId ||
      client.assignedDietitians?.some(
        (id: any) => id?.toString() === sessionUserId,
      )
    );
  }

  if (role === UserRole.HEALTH_COUNSELOR || role === "health_counselor") {
    return (
      client.assignedHealthCounselor?.toString() === sessionUserId ||
      client.assignedHealthCounselors?.some(
        (id: any) => id?.toString() === sessionUserId,
      )
    );
  }

  return false;
};

const canAccessMealPlan = async (
  session: any,
  mealPlan: any,
  editor: NativePlanEditor,
): Promise<boolean> => {
  const actorId=String(session?.user?.id||'');
  if(!actorId)return false;
  const actor=await editor.document('users',actorId);
  if(!actor||actor.isActive===false||['inactive','suspended'].includes(actor.status))return false;
  session.user.role=actor.role;
  if(actor.role==='client')return mealPlan.clientId===actorId;
  return nativePlanStaffAccess(editor,mealPlan,session.user);
};

const getRequestMeta = (request: NextRequest) => ({
  ipAddress:
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    undefined,
  userAgent: request.headers.get("user-agent") || undefined,
});

// Allowed lifecycle transitions for a meal plan.
// Any transition not listed here is rejected with HTTP 409.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ["active"],
  active: ["paused", "cancelled", "completed"],
  paused: ["active", "cancelled", "completed"],
  completed: [],
  cancelled: [],
};

const isAllowedTransition = (from: string, to: string): boolean => {
  if (from === to) return true; // no-op
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
};

const appendLifecycleAudit = async (
  planId: unknown,
  entry: {
    action:
      | "status_change"
      | "publish"
      | "republish"
      | "blocked_title_edit"
      | "blocked_revert_to_draft"
      | "blocked_invalid_transition"
      | "blocked_delete"
      | "soft_delete";
    by?: string;
    fromStatus?: string;
    toStatus?: string;
    reason?: string;
    blocked?: boolean;
    meta?: Record<string, unknown>;
  },
) => {
  try {
    await appendNativePlanAudit(getNativeDatabase(), String(planId), entry);
  } catch (err) {
    console.error("Failed to append lifecycleAudit entry:", err);
  }
};

// GET single meal plan by ID
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const [session, { id }] = await Promise.all([getServerSession(authOptions), context.params]);
    const editor = new NativePlanEditor(getNativeDatabase());
    if (!session?.user) {
      return nativeResponseJson({ error: "Unauthorized" }, { status: 401 });
    }

    const mealPlan = await editor.plan(id);

    if (!mealPlan) {
      return nativeResponseJson(
        { success: false, error: "Meal plan not found" },
        { status: 404 },
      );
    }

    const hasAccess = await canAccessMealPlan(session, mealPlan, editor);
    if (!hasAccess) {
      return nativeResponseJson(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const planWithFrozenMeals = applyFrozenFlagsFromFreezedDays(
      await editor.populateTemplate(await editor.hydrate(mealPlan)),
    );

    return nativeResponseJson({
      success: true,
      mealPlan: planWithFrozenMeals,
    });
  } catch (error) {
    console.error("Error fetching meal plan:", error);
    return nativeResponseJson(
      { success: false, error: "Failed to fetch meal plan" },
      { status: 500 },
    );
  }
}

// PUT - Update meal plan
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return nativeResponseJson(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    const editor = new NativePlanEditor(getNativeDatabase());
    if (!['admin','dietitian','dietician','health_counselor'].includes(String(session.user.role))) return nativeResponseJson({error:'Forbidden'},{status:403});

    const { id } = await context.params;
    const body = await request.json();
    if (!body || typeof body!=='object' || Array.isArray(body)) return nativeResponseJson({error:'Invalid plan data'},{status:400});

    const {
      name,
      description,
      startDate,
      endDate,
      duration,
      meals,
      mealTypes,
      customizations,
      goals,
      templateId,
      status,
      statusReason,
    } = body;

    if ((name !== undefined && (typeof name !== 'string' || !name.trim())) ||
        (description !== undefined && typeof description !== 'string') ||
        (duration !== undefined && (!Number.isSafeInteger(Number(duration)) || Number(duration) < 1)) ||
        (meals !== undefined && !Array.isArray(meals)) || (mealTypes !== undefined && !Array.isArray(mealTypes)) ||
        [startDate,endDate].some(value=>value!==undefined&&!validPlanDate(value))) {
      return nativeResponseJson({error:'Invalid plan fields'},{status:400});
    }

    // Validate date range
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (start > end) {
        return nativeResponseJson(
          { success: false, error: "Start date cannot be after end date" },
          { status: 400 },
        );
      }
    }

    // Fetch existing plan first to allow partial/merge updates
    let existingPlan = await editor.plan(id);
    if (!existingPlan) {
      return nativeResponseJson(
        { success: false, error: "Meal plan not found" },
        { status: 404 },
      );
    }

    const hasAccess = await canAccessMealPlan(session, existingPlan, editor);
    if (!hasAccess) {
      return nativeResponseJson(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    if (!['admin','dietitian','dietician','health_counselor'].includes(String(session.user.role))) return nativeResponseJson({error:'Forbidden'},{status:403});
    existingPlan = await editor.hydrate(existingPlan);
    if (planNeedsDateCorrection(existingPlan)) {
      return nativeResponseJson({success:false,code:'PLAN_DATES_NEED_CORRECTION',error:'An administrator must confirm the missing plan dates before this plan can be edited or published.'},{status:409});
    }
    const scopedPlans = await editor.siblings(existingPlan);

    const rawOperationId = request.headers.get("x-idempotency-key")?.trim();
    const operationId =
      rawOperationId && /^[a-zA-Z0-9._:-]{8,128}$/.test(rawOperationId)
        ? rawOperationId
        : undefined;
    if (operationId && existingPlan.lastOperationId === operationId) {
      const replayPlan = await editor.populateTemplate(existingPlan);
      return nativeResponseJson({
        success: true,
        message:
          existingPlan.status === "draft"
            ? "Draft already saved"
            : "Meal plan update already applied",
        mealPlan: applyFrozenFlagsFromFreezedDays(replayPlan),
        replayed: true,
      });
    }

    // Detect publish action early so phase metadata can be assigned in the same update.
    const isPublishing = existingPlan.status === "draft" && status === "active";
    const isStatusChange =
      status !== undefined && status !== existingPlan.status;
    const existingStartDateKey = dateKey(existingPlan.startDate);
    const existingEndDateKey = dateKey(existingPlan.endDate);
    const incomingStartDateKey = dateKey(startDate);
    const incomingEndDateKey = dateKey(endDate);
    const startDateChanged =
      startDate !== undefined &&
      (incomingStartDateKey === null ||
        incomingStartDateKey !== existingStartDateKey);
    const endDateChanged =
      endDate !== undefined &&
      (incomingEndDateKey === null || incomingEndDateKey !== existingEndDateKey);

    // An existing published phase is not a reusable shell for the next one.
    // Moving its start date removes the client's historical coverage. Timeline
    // shifts from explicit freeze/extension actions use their own endpoints.
    if (existingPlan.status !== "draft" && startDateChanged) {
      return nativeResponseJson(
        {
          success: false,
          code: "PUBLISHED_START_DATE_LOCKED",
          error: "This phase is already published. Create a new plan for new dates, or use Freeze/Extend to adjust its schedule.",
        },
        { status: 409 },
      );
    }

    // ------------------------------------------------------------------
    // HOLD STATUS CHECK: Block publishing meal plans to clients on hold
    // ------------------------------------------------------------------
    if (isPublishing) {
      const clientUser = await editor.document('users', String(existingPlan.clientId));
      if (!clientUser) return nativeResponseJson({error:"Client not found"},{status:404});
      if (clientUser.holdStatus?.isOnHold) {
        return nativeResponseJson(
          {
            success: false,
            code: "CLIENT_ON_HOLD",
            error: "Cannot publish meal plan - client is on hold",
            message: `Client "${clientUser.firstName} ${clientUser.lastName}" is currently on hold. Activate the client first to publish meal plans.`,
          },
          { status: 403 },
        );
      }
    }

    // ------------------------------------------------------------------
    // PERMANENT FIX: Lifecycle state-machine + publish immutability guards
    // ------------------------------------------------------------------
    // Block any non-draft -> draft transition (prevents silent demotion of
    // published plans through auto-save or explicit edits).
    if (
      isStatusChange &&
      status === "draft" &&
      existingPlan.status !== "draft"
    ) {
      await appendLifecycleAudit(existingPlan._id, {
        action: "blocked_revert_to_draft",
        by: session.user.id,
        fromStatus: existingPlan.status,
        toStatus: "draft",
        blocked: true,
        reason: "non-draft-to-draft-forbidden",
      });
      await logActivity({
        userId: session.user.id,
        userRole: toActivityRole(getNormalizedRole(session.user.role)),
        userName: session.user.name || session.user.email || "Unknown",
        userEmail: session.user.email || undefined,
        action: "Blocked Meal Plan Revert To Draft",
        actionType: "update",
        category: "meal_plan",
        description: `Blocked attempt to revert "${existingPlan.name}" from ${existingPlan.status} to draft`,
        targetUserId: existingPlan.clientId?.toString(),
        resourceId: existingPlan._id?.toString(),
        resourceType: "ClientMealPlan",
        resourceName: existingPlan.name,
        details: { fromStatus: existingPlan.status, toStatus: "draft" },
        ...getRequestMeta(request),
      }).catch(() => null);

      return nativeResponseJson(
        {
          success: false,
          code: "FORBIDDEN_STATE_TRANSITION",
          error: "Published meal plans cannot be reverted to draft",
          message: `Cannot change status from ${existingPlan.status} to draft. Once published, plans stay published.`,
        },
        { status: 409 },
      );
    }

    // Block any other disallowed transition.
    if (isStatusChange && !isAllowedTransition(existingPlan.status, status)) {
      await appendLifecycleAudit(existingPlan._id, {
        action: "blocked_invalid_transition",
        by: session.user.id,
        fromStatus: existingPlan.status,
        toStatus: status,
        blocked: true,
      });
      return nativeResponseJson(
        {
          success: false,
          code: "FORBIDDEN_STATE_TRANSITION",
          error: "Invalid status transition",
          message: `Cannot change status from ${existingPlan.status} to ${status}.`,
        },
        { status: 409 },
      );
    }

    // Block title edits on any non-draft plan (preserve published name).
    if (
      name !== undefined &&
      typeof name === "string" &&
      name.trim() !== (existingPlan.name || "").trim() &&
      existingPlan.status !== "draft"
    ) {
      await appendLifecycleAudit(existingPlan._id, {
        action: "blocked_title_edit",
        by: session.user.id,
        fromStatus: existingPlan.status,
        toStatus: existingPlan.status,
        blocked: true,
        meta: { attemptedName: name, currentName: existingPlan.name },
      });
      await logActivity({
        userId: session.user.id,
        userRole: toActivityRole(getNormalizedRole(session.user.role)),
        userName: session.user.name || session.user.email || "Unknown",
        userEmail: session.user.email || undefined,
        action: "Blocked Meal Plan Title Edit",
        actionType: "update",
        category: "meal_plan",
        description: `Blocked title edit on published plan "${existingPlan.name}"`,
        targetUserId: existingPlan.clientId?.toString(),
        resourceId: existingPlan._id?.toString(),
        resourceType: "ClientMealPlan",
        resourceName: existingPlan.name,
        details: {
          attemptedName: name,
          currentName: existingPlan.name,
          status: existingPlan.status,
        },
        ...getRequestMeta(request),
      }).catch(() => null);

      return nativeResponseJson(
        {
          success: false,
          code: "TITLE_LOCKED_AFTER_PUBLISH",
          error: "Title cannot be edited after publish",
          message:
            "Meal plan name is locked once the plan is published. Create a new plan for a new name.",
        },
        { status: 409 },
      );
    }
    // ------------------------------------------------------------------

    // Build update object — only include fields explicitly provided
    const updateData: Record<string, any> = {};
    if (operationId) updateData.lastOperationId = operationId;
    const resultingStatus = status !== undefined ? status : existingPlan.status;

    // Merge incoming meals with existing meals so freeze recovery days and
    // frozen flags are never silently dropped on edit/publish.
    let mergedIncomingMeals: any[] | null = null;
    if (Array.isArray(meals)) {
      mergedIncomingMeals = mergeMealsPreservingFreezeRecovery(
        meals,
        existingPlan,
      );
    }
    const resultingMeals = mergedIncomingMeals ?? existingPlan.meals;

    if (
      resultingStatus === "active" &&
      !hasPublishableMealData(resultingMeals)
    ) {
      return nativeResponseJson(
        {
          success: false,
          error:
            "Cannot publish plan without at least one meal slot containing food items",
        },
        { status: 400 },
      );
    }

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (startDate !== undefined) updateData.startDate = new Date(startDate);
    if (endDate !== undefined) updateData.endDate = new Date(endDate);
    if (duration !== undefined) {
      const existingDuration =
        typeof existingPlan.duration === "number"
          ? existingPlan.duration
          : null;
      const isDraftPlan = existingPlan.status === "draft";

      // Keep assigned duration immutable once plan is not draft.
      if (!isDraftPlan && existingDuration && existingDuration > 0) {
        updateData.duration = existingDuration;
      } else {
        updateData.duration = Number(duration);
      }
    }

    // For meals: accept the full structured array as-is (preserves nested meal data)
    if (meals !== undefined && Array.isArray(meals)) {
      updateData.meals = mergedIncomingMeals ?? meals;
    }

    // For mealTypes: accept the array of { name, time } configs
    if (mealTypes !== undefined && Array.isArray(mealTypes)) {
      updateData.mealTypes = mealTypes;
    }

    if (customizations !== undefined)
      updateData.customizations = customizations;
    if (goals !== undefined) updateData.goals = goals;
    if (
      templateId !== undefined &&
      typeof templateId === "string" &&
      templateId.trim()
    ) {
      updateData.templateId = templateId.trim();
    }
    if (status !== undefined) updateData.status = status;

    // Guarantee endDate covers every meal (including freeze recovery days).
    if (Array.isArray(updateData.meals) && updateData.meals.length > 0) {
      const candidateEndDate: Date | null =
        updateData.endDate instanceof Date
          ? updateData.endDate
          : existingPlan?.endDate
            ? new Date(existingPlan.endDate)
            : null;
      const safeEndDate = resolveEndDateCoveringMeals(
        candidateEndDate,
        updateData.meals,
      );
      if (safeEndDate) {
        updateData.endDate = safeEndDate;
      }
    }

    // Drafts may have been autosaved before their purchase dates were final.
    // Revalidate the authoritative purchase window when publishing or moving
    // dates so an early draft cannot become an incorrectly dated active plan.
    if (
      existingPlan.purchaseId &&
      (isPublishing || startDateChanged || endDateChanged)
    ) {
      const purchase = await editor.document('unifiedpayments', String(existingPlan.purchaseId));

      if (!purchase || purchase.client !== existingPlan.clientId) {
        return nativeResponseJson(
          { success: false, error: "Linked purchase could not be found" },
          { status: 400 },
        );
      }

      const expectedStart = startOfDay(
        new Date(purchase.expectedStartDate || purchase.startDate),
      );
      const expectedEnd = startOfDay(
        new Date(
          resolveEntitlementEndDate({
            expectedStartDate: purchase.expectedStartDate || purchase.startDate,
            expectedEndDate: purchase.expectedEndDate,
            endDate: purchase.endDate,
            durationLabel: purchase.durationLabel,
            durationDays: purchase.durationDays,
          }) ||
            purchase.expectedEndDate ||
            purchase.endDate,
        ),
      );
      const proposedStart = startOfDay(
        new Date(updateData.startDate || existingPlan.startDate),
      );
      const proposedEnd = startOfDay(
        new Date(updateData.endDate || existingPlan.endDate),
      );
      const datesAreValid = [
        expectedStart,
        expectedEnd,
        proposedStart,
        proposedEnd,
      ].every((date) => !Number.isNaN(date.getTime()));

      if (!datesAreValid) {
        return nativeResponseJson(
          {
            success: false,
            error:
              "Valid expected purchase dates are required before publishing",
          },
          { status: 400 },
        );
      }

      if (proposedStart < expectedStart || proposedEnd > expectedEnd) {
        return nativeResponseJson(
          {
            success: false,
            error:
              "Meal plan dates must remain within the linked purchase expected window",
          },
          { status: 400 },
        );
      }
    }

    // A later phase in the same purchase must begin immediately after the
    // previous phase. Planned breaks are represented by freeze/pause actions,
    // which shift the linked phase chain without creating uncovered days.
    if (existingPlan.purchaseId && (isPublishing || startDateChanged)) {
      const proposedStart = new Date(
        updateData.startDate || existingPlan.startDate,
      );
      let previousPlan: any = null;

      const publishedSiblings = scopedPlans.filter(plan=>['active','completed','paused'].includes(plan.status));
      if (existingPlan.previousPhaseId) {
        previousPlan = publishedSiblings.find(plan=>plan._id===existingPlan.previousPhaseId) || null;
      } else {
        previousPlan = publishedSiblings.filter(plan=>existingPlan.phaseNumber>1
          ? plan.phaseNumber<existingPlan.phaseNumber : isPublishing || new Date(plan.endDate)<proposedStart)
          .sort((a,b)=>(b.phaseNumber||0)-(a.phaseNumber||0)||new Date(b.endDate).getTime()-new Date(a.endDate).getTime()||new Date(b.createdAt||0).getTime()-new Date(a.createdAt||0).getTime())[0] || null;
      }

      if (previousPlan?.endDate) {
        const continuity = checkPhaseStartPolicy(
          proposedStart,
          previousPlan.endDate,
        );
        if (continuity && !continuity.allowed) {
          return nativeResponseJson(
            {
              success: false,
              error: "Phase start date is too early",
              code: "PHASE_START_BEFORE_EARLIEST_ALLOWED",
              message: `This phase cannot start before ${continuity.earliestAllowedDateKey}. Choose that date or a later date within the purchase window.`,
              expectedStartDate: continuity.expectedStartDateKey,
              earliestAllowedDate: continuity.earliestAllowedDateKey,
              proposedStartDate: continuity.actualStartDateKey,
              gapDays: continuity.gapDays,
              previousPlan: {
                id: String(previousPlan._id),
                name: previousPlan.name,
                phaseTag: previousPlan.phaseTag,
                endDate: previousPlan.endDate,
              },
            },
            { status: 409 },
          );
        }

        if (isPublishing && !existingPlan.previousPhaseId) {
          updateData.previousPhaseId = previousPlan._id;
        }
      }
    }

    if (isStatusChange && status === "cancelled") {
      const reasonText =
        typeof statusReason === "string" ? statusReason.trim() : "";
      if (!reasonText) {
        return nativeResponseJson(
          {
            success: false,
            error: "Cancellation reason required",
            message: "Please provide statusReason when cancelling a meal plan.",
          },
          { status: 400 },
        );
      }
      updateData.deletionReason = reasonText;
    }

    // Ensure draft->active publish always receives correct phase numbering.
    if (isPublishing) {
      const publishedPhases = scopedPlans.filter(plan=>['active','completed'].includes(plan.status));

      if (!existingPlan.phaseNumber) {
        const previousPlansCount =
          publishedPhases.length;

        updateData.phaseNumber = previousPlansCount + 1;
      }

      if (!existingPlan.phaseTag) {
        const resolvedPhaseNumber =
          updateData.phaseNumber || existingPlan.phaseNumber;
        if (resolvedPhaseNumber) {
          updateData.phaseTag = `PHASE-${resolvedPhaseNumber}`;
        }
      }

      if (!existingPlan.previousPhaseId) {
        const previousPlan = [...publishedPhases].sort((a,b)=>new Date(b.endDate).getTime()-new Date(a.endDate).getTime()||new Date(b.createdAt||0).getTime()-new Date(a.createdAt||0).getTime())[0];

        if (previousPlan?._id) {
          updateData.previousPhaseId = previousPlan._id;
        }
      }

      // Publish timeline fields: set firstPublishedAt only once; always bump lastPublishedAt.
      const nowDate = new Date();
      if (!existingPlan.firstPublishedAt) {
        updateData.firstPublishedAt = nowDate;
      }
      updateData.lastPublishedAt = nowDate;
    }

    // Track lifecycle audit + publish counters on relevant transitions.
    const auditEntries: Array<Record<string, unknown>> = [];
    if (isPublishing) {
      auditEntries.push({
        action: existingPlan.firstPublishedAt ? "republish" : "publish",
        at: new Date(),
        by: session.user.id,
        fromStatus: existingPlan.status,
        toStatus: status,
      });
    } else if (isStatusChange) {
      auditEntries.push({
        action: "status_change",
        at: new Date(),
        by: session.user.id,
        fromStatus: existingPlan.status,
        toStatus: status,
        reason:
          typeof statusReason === "string" ? statusReason.trim() : undefined,
      });
    }
    const previousEnd = startOfDay(new Date(existingPlan.endDate));
    const nextEnd = startOfDay(new Date(updateData.endDate || existingPlan.endDate));
    const cascade = await cascadeShiftLinkedPhases(editor, {...existingPlan,...updateData}, differenceInDays(nextEnd,previousEnd));
    const savedPlan = await editor.save(existingPlan,updateData,auditEntries,isPublishing,cascade);
    const updatedPlan = savedPlan ? await editor.populateTemplate(savedPlan) : null;

    if (!updatedPlan) {
      return nativeResponseJson(
        {
          success: false,
          code: "PLAN_WRITE_CONFLICT",
          error: "This plan changed while saving. Your changes have not overwritten the newer plan. Reload the plan before trying again.",
        },
        { status: 409 },
      );
    }

    if (isStatusChange) {
      const role = getNormalizedRole(session.user.role);
      const reasonText =
        typeof statusReason === "string" ? statusReason.trim() : "";
      const requestMeta = getRequestMeta(request);

      await logActivity({
        userId: session.user.id,
        userRole: toActivityRole(role),
        userName: session.user.name || session.user.email || "Unknown",
        userEmail: session.user.email || undefined,
        action: "Meal Plan Status Changed",
        actionType: "update",
        category: "meal_plan",
        description: `Meal plan status changed from ${existingPlan.status} to ${status} for "${existingPlan.name}"`,
        targetUserId: existingPlan.clientId?.toString(),
        resourceId: existingPlan._id?.toString(),
        resourceType: "ClientMealPlan",
        resourceName: existingPlan.name,
        details: {
          previousStatus: existingPlan.status,
          newStatus: status,
          reason: reasonText || null,
          startDate: updateData.startDate
            ? new Date(updateData.startDate).toISOString()
            : undefined,
          endDate: updateData.endDate
            ? new Date(updateData.endDate).toISOString()
            : undefined,
        },
        ...requestMeta,
      }).catch(() => null);
    }

    if (updatedPlan.status === "active") {
      const clientId = updatedPlan.clientId?.toString();
      if (clientId) await grantDietPlanAccess(clientId);
    }

    // Clear cached responses so subsequent GETs return fresh data
    clearCacheByTag("client_meal_plans");

    // Update client status if status or dates changed (could affect active status)
    if (
      (status && status !== "draft") ||
      startDateChanged ||
      endDateChanged
    ) {
      try {
        const clientId = updatedPlan.clientId?.toString();
        if (clientId) {
          const newStatus = await updateClientStatusFromMealPlan(clientId);
          console.log(
            `[ClientMealPlan] Client ${clientId} status updated to: ${newStatus}`,
          );
        }
      } catch (statusError) {
        console.error("Failed to update client status:", statusError);
      }
    }

    // When publishing (draft → active), send notification and log history
    if (isPublishing) {
      const clientId = updatedPlan.clientId?.toString();
      const planName = updatedPlan.name || "Diet Plan";

      // Send push notification
      try {
        if (clientId) {
          await sendNotificationToUser(clientId, {
            title: "📋 New Meal Plan Assigned",
            body: `You have a new meal plan: "${planName}". Check your plan now!`,
            data: {
              type: "meal_plan",
              mealPlanId: updatedPlan._id?.toString(),
              url: "/my-plan",
            },
          });
        }
      } catch (notificationError) {
        console.error(
          "Failed to send meal plan notification:",
          notificationError,
        );
      }

      // Log history
      try {
        if (clientId) {
          await logHistoryServer({
            userId: clientId,
            action: "assign",
            category: "diet",
            description: `Meal plan published: ${planName}`,
            performedById: session.user.id,
            metadata: {
              mealPlanId: updatedPlan._id,
              name: planName,
              status: "active",
            },
          });
        }
      } catch (historyError) {
        console.error("Failed to log history:", historyError);
      }
    }

    const updatedPlanWithFrozenMeals = applyFrozenFlagsFromFreezedDays(
      updatedPlan,
    );

    return nativeResponseJson({
      success: true,
      message: isPublishing
        ? "Meal plan published successfully"
        : "Meal plan updated successfully",
      mealPlan: updatedPlanWithFrozenMeals,
    });
  } catch (error) {
    console.error("Error updating meal plan:", error);
    // Handle validation errors
    if (
      error instanceof Error &&
      (error.name === "ValidationError" ||
        error.message.toLowerCase().includes("validation"))
    ) {
      return nativeResponseJson(
        {
          success: false,
          error: "Invalid data provided. Please check your inputs.",
        },
        { status: 400 },
      );
    }
    return nativeResponseJson(
      { success: false, error: "Failed to update meal plan" },
      { status: 500 },
    );
  }
}

// DELETE - Remove meal plan
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const [session, { id }] = await Promise.all([getServerSession(authOptions), context.params]);
    const editor = new NativePlanEditor(getNativeDatabase());
    if (!session?.user) {
      return nativeResponseJson({ error: "Unauthorized" }, { status: 401 });
    }

    // First, fetch plan for authorization and safe soft-delete behavior
    const mealPlan = await editor.plan(id);

    if (!mealPlan) {
      return nativeResponseJson(
        { success: false, error: "Meal plan not found" },
        { status: 404 },
      );
    }

    const role = getNormalizedRole(session.user.role);
    const isAdmin = role === UserRole.ADMIN && Boolean(session.user.id);
    const isStaff = [UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR, "dietician"].includes(role);
    const canDelete = isAdmin || (
      isStaff && mealPlan.status === "draft" && !mealPlan.firstPublishedAt &&
      await canAccessMealPlan(session, mealPlan, editor)
    );
    if (!canDelete) {
      await logActivity({
        userId: session.user.id,
        userRole: toActivityRole(role),
        userName: session.user.name || session.user.email || "Unknown",
        userEmail: session.user.email || undefined,
        action: "Blocked Meal Plan Deletion",
        actionType: "delete",
        category: "system",
        description: `Blocked delete attempt for meal plan ${mealPlan._id}`,
        targetUserId: mealPlan.clientId?.toString(),
        resourceId: mealPlan._id?.toString(),
        resourceType: "ClientMealPlan",
        resourceName: mealPlan.name,
        details: {
          reason: "forbidden",
          mealPlanStatus: mealPlan.status,
          actorRole: role,
        },
        ipAddress:
          request.headers.get("x-forwarded-for") ||
          request.headers.get("x-real-ip") ||
          undefined,
        userAgent: request.headers.get("user-agent") || undefined,
      }).catch(() => null);

      return nativeResponseJson(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const clientId = mealPlan.clientId?.toString();
    const deletionReason = isAdmin ? "admin-requested-plan-delete" : "staff-requested-draft-delete";

    const { deletedPlan, restoredDays } = await deleteNativeMealPlan(getNativeDatabase(), id, {id:session.user.id,role:toActivityRole(role) as 'admin'|'dietitian'|'health_counselor'});

    if (!deletedPlan) {
      return nativeResponseJson(
        { success: false, error: "Meal plan not found" },
        { status: 404 },
      );
    }

    await Promise.all([
      clearCacheByTag("client_meal_plans"),
      clearCacheByTag("client_purchases"),
      ...(deletedPlan.purchaseId
        ? [clearCacheByTag(`client-purchases:${JSON.stringify(String(deletedPlan.purchaseId))}`)]
        : []),
    ]);

    await logActivity({
      userId: session.user.id,
      userRole: toActivityRole(role),
      userName: session.user.name || session.user.email || "Unknown",
      userEmail: session.user.email || undefined,
      action: "Soft Deleted Meal Plan",
      actionType: "delete",
      category: "meal_plan",
      description: `Soft deleted meal plan "${mealPlan.name}"`,
      targetUserId: mealPlan.clientId?.toString(),
      resourceId: mealPlan._id?.toString(),
      resourceType: "ClientMealPlan",
      resourceName: mealPlan.name,
      details: {
        previousStatus: deletedPlan.status,
        restoredDays,
        purchaseId: deletedPlan.purchaseId?.toString(),
        deletionReason,
        deletedAt: new Date().toISOString(),
      },
      ipAddress:
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip") ||
        undefined,
      userAgent: request.headers.get("user-agent") || undefined,
    }).catch(() => null);

    if (clientId) {
      await logHistoryServer({
        userId: clientId,
        action: "delete",
        category: "diet",
        description: `Meal plan removed: ${mealPlan.name}`,
        performedById: session.user.id,
        metadata: {
          mealPlanId: mealPlan._id,
          name: mealPlan.name,
          status: deletedPlan.status,
          softDeleted: true,
        },
      }).catch(() => null);
    }

    // Update client status after deletion
    if (clientId) {
      try {
        const newStatus = await updateClientStatusFromMealPlan(clientId);
        console.log(
          `[ClientMealPlan] Client ${clientId} status updated to: ${newStatus} after meal plan soft-delete`,
        );
      } catch (statusError) {
        console.error(
          "Failed to update client status after deletion:",
          statusError,
        );
        // Don't fail the request - meal plan was deleted successfully
      }
    }

    return nativeResponseJson({
      success: true,
      message: "Meal plan deleted successfully",
      restoredDays,
    });
  } catch (error) {
    if (error instanceof NativePlanDeletionConflict) {
      return nativeResponseJson({ success: false, error: error.message }, { status: 409 });
    }
    console.error("Error deleting meal plan:", error);
    return nativeResponseJson(
      { success: false, error: "Failed to delete meal plan" },
      { status: 500 },
    );
  }
}
