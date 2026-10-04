import {nativeResponseJson} from '@/lib/api/native-response';
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import {randomBytes,createHash} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {NativePlanEditor,nativePlanStaffAccess} from '@/lib/db/repository/native-plan-editor';
import {listNativePlans,populateNativePlan} from '@/lib/db/repository/native-plan-list';
import { UserRole } from "@/types";
import { z } from "zod";
import { logHistoryServer } from "@/lib/server/history";
import { sendNotificationToUser } from "@/lib/firebase/firebaseNotification";
import {clearCacheByTag} from "@/lib/cache/memoryCache";
import { updateClientStatusFromMealPlan } from "@/lib/status/computeClientStatus";
import { logActivity } from "@/lib/utils/activityLogger";
import { format, startOfDay } from "date-fns";
import { grantDietPlanAccess } from "@/lib/auth/onboarding-access";
import { checkPhaseStartPolicy } from "@/lib/meal-plan-phase-continuity";
import { resolveEntitlementEndDate } from "@/lib/payments/entitlement-dates";

const normalizeRole = (role: unknown): string => {
  const normalized = String(role || "")
    .trim()
    .toLowerCase();
  if (normalized === "dietician") return UserRole.DIETITIAN;
  return normalized;
};

// Validation schema for client meal plan assignment
const clientMealPlanSchema = z.object({
  clientId: z.string().min(1, "Client ID is required"),
  templateId: z.string().optional(), // Optional - can create plan without template
  purchaseId: z.string().optional(), // Optional - purchase ID for shared freeze tracking
  name: z.string().min(1, "Plan name is required").max(200),
  description: z.string().max(10000).optional(),
  startDate: z
    .string()
    .refine((date) => !isNaN(Date.parse(date)), "Invalid start date"),
  endDate: z
    .string()
    .refine((date) => !isNaN(Date.parse(date)), "Invalid end date"),
  duration: z.number().int().min(1).max(365).optional(),
  meals: z.array(z.any()).optional(), // Flexible meal data
  mealTypes: z
    .array(
      z.object({
        name: z.string(),
        time: z.string(),
      }),
    )
    .optional(),
  customizations: z
    .object({
      targetCalories: z.number().min(800).max(5000).optional(),
      targetMacros: z
        .object({
          protein: z.number().min(0).max(500).optional(),
          carbs: z.number().min(0).max(1000).optional(),
          fat: z.number().min(0).max(300).optional(),
        })
        .optional(),
      dietaryRestrictions: z.array(z.string()).optional(),
      notes: z.string().max(1000).optional(),
    })
    .optional(),
  goals: z
    .object({
      weightGoal: z.number().min(20).max(500).optional(),
      bodyFatGoal: z.number().min(3).max(50).optional(),
      targetDate: z
        .string()
        .refine((date) => !isNaN(Date.parse(date)), "Invalid target date")
        .optional(),
      primaryGoal: z
        .enum([
          "weight-loss",
          "weight-gain",
          "maintenance",
          "muscle-gain",
          "health-improvement",
        ])
        .optional(),
      secondaryGoals: z.array(z.string()).optional(),
    })
    .optional(),
  reminders: z
    .object({
      mealReminders: z.boolean().default(true),
      progressReminders: z.boolean().default(true),
      checkInReminders: z.boolean().default(true),
    })
    .optional(),
  status: z
    .enum(["draft", "active", "completed", "paused", "cancelled"])
    .optional(),
  // Phase assignment (optional - auto-calculated if not provided)
  phaseNumber: z.number().int().min(1).optional(),
  phaseTag: z.string().optional(),
});

// Robustly detect publishable meal content across supported meal data shapes
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

const toStartOfDayDate = (value: unknown): Date | null => {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return startOfDay(date);
};

const isDateWithinInclusiveWindow = (
  value: Date,
  start: Date,
  end: Date,
): boolean => {
  const target = startOfDay(value).getTime();
  return (
    target >= startOfDay(start).getTime() && target <= startOfDay(end).getTime()
  );
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

    // Preserve existing true flag but also enforce frozen from freezedDays source of truth.
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

// GET /api/client-meal-plans - Get client meal plans
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return nativeResponseJson({ error: "Unauthorized" }, { status: 401 });
    }

    const {searchParams}=new URL(request.url);
    const page=Number(searchParams.get('page')||1),limit=Number(searchParams.get('limit')||20);
    if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(limit)||limit<1||limit>200)return nativeResponseJson({error:'Invalid pagination'},{status:400});
    const db=getNativeDatabase(),editor=new NativePlanEditor(db);
    const result=await listNativePlans(db,session.user,{clientId:searchParams.get('clientId'),status:searchParams.get('status'),includeDeleted:searchParams.get('includeDeleted')==='true',page,limit});
    if(result.status!==200)return nativeResponseJson({error:'Forbidden'},{status:403});
    const mealPlans=result.plans!,total=result.total!;
    const paymentsByClient=new Map<string,Promise<any[]>>();

    // For meal plans without purchaseId populated, try to find matching payment from UnifiedPayment
    const enrichedMealPlans = await Promise.all(
      mealPlans.map(async (plan: any) => {
        // If purchaseId is already populated with payment data, format it properly
        if (plan.purchaseId && typeof plan.purchaseId === "object") {
          const planWithFrozenMeals = applyFrozenFlagsFromFreezedDays(plan);
          return {
            ...planWithFrozenMeals,
            paymentInfo: {
              _id: plan.purchaseId._id,
              planName: plan.purchaseId.planName || "N/A",
              planCategory: plan.purchaseId.planCategory || "N/A",
              durationDays: plan.purchaseId.durationDays || 0,
              durationLabel: plan.purchaseId.durationLabel || "N/A",
              status:
                plan.purchaseId.status ||
                plan.purchaseId.paymentStatus ||
                "N/A",
              paymentStatus: plan.purchaseId.paymentStatus || "N/A",
              amount:
                plan.purchaseId.finalAmount || plan.purchaseId.baseAmount || 0,
              paymentMethod: plan.purchaseId.paymentMethod || "Online",
              transactionId:
                plan.purchaseId.transactionId ||
                plan.purchaseId.razorpayPaymentId ||
                "N/A",
              paidAt: plan.purchaseId.paidAt || null,
            },
          };
        }

        // Try to find payment from UnifiedPayment based on clientId and overlapping dates
        try {
          const clientId=String(plan.clientId?._id||'');
          if(!paymentsByClient.has(clientId))paymentsByClient.set(clientId,editor.query('unifiedpayments',[['client','==',clientId],['paymentStatus','==','paid']]));
          const payments=await paymentsByClient.get(clientId)!;
          const payment=payments.filter(item=>(item.startDate<=plan.startDate&&item.endDate>=plan.startDate)||new Date(item.paidAt).getTime()>=new Date(plan.createdAt).getTime()-7*86400000).sort((a,b)=>new Date(b.paidAt).getTime()-new Date(a.paidAt).getTime())[0];

          if (payment) {
            const planWithFrozenMeals = applyFrozenFlagsFromFreezedDays(plan);
            return {
              ...planWithFrozenMeals,
              paymentInfo: {
                _id: payment._id,
                planName: payment.planName || "N/A",
                planCategory: payment.planCategory || "N/A",
                durationDays: payment.durationDays || 0,
                durationLabel: payment.durationLabel || "N/A",
                status: payment.status || payment.paymentStatus || "N/A",
                paymentStatus: payment.paymentStatus || "N/A",
                amount: payment.finalAmount || payment.baseAmount || 0,
                paymentMethod: payment.paymentMethod || "Online",
                transactionId:
                  payment.transactionId || payment.razorpayPaymentId || "N/A",
                paidAt: payment.paidAt || null,
              },
            };
          }
        } catch (err) {
          // Silently ignore errors in payment lookup
        }

        // No payment found
        const planWithFrozenMeals = applyFrozenFlagsFromFreezedDays(plan);
        return {
          ...planWithFrozenMeals,
          paymentInfo: null,
        };
      }),
    );

    return nativeResponseJson({
      success: true,
      mealPlans: enrichedMealPlans,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching client meal plans:", error);
    return nativeResponseJson(
      {
        error: "Internal server error",
        message: "Failed to fetch client meal plans",
      },
      { status: 500 },
    );
  }
}

// POST /api/client-meal-plans - Assign meal plan to client
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return nativeResponseJson(
        {
          error: "Unauthorized",
          message: "Please log in to assign meal plans",
        },
        { status: 401 },
      );
    }

    // Only dietitians, health counselors, and admins can assign meal plans
    const userRole = normalizeRole(session.user.role);
    const allowedRoles = ["dietitian", "health_counselor", "admin"];
    if (!userRole || !allowedRoles.includes(userRole)) {
      return nativeResponseJson(
        {
          error: "Forbidden",
          message:
            "Only dietitians, health counselors, and admins can assign meal plans to clients",
        },
        { status: 403 },
      );
    }

    const body = await request.json();
    const rawOperationId = request.headers.get("x-idempotency-key")?.trim();
    const operationId =
      rawOperationId && /^[a-zA-Z0-9._:-]{8,128}$/.test(rawOperationId)
        ? rawOperationId
        : undefined;

    // Validate input
    let validatedData;
    try {
      validatedData = clientMealPlanSchema.parse(body);
    } catch (validationError) {
      console.error("Validation error:", validationError);
      if (validationError instanceof z.ZodError) {
        return nativeResponseJson(
          {
            error: "Validation failed",
            message: "Please check your input data",
            details: validationError.issues.map((err: any) => ({
              field: err.path.join("."),
              message: err.message,
            })),
          },
          { status: 400 },
        );
      }
      throw validationError;
    }

    const editor=new NativePlanEditor(getNativeDatabase());

    const planId=operationId?createHash('sha256').update(session.user.id+'\0'+operationId).digest('hex').slice(0,24):randomBytes(12).toString('hex');
    const replayedPlan=await editor.document('clientmealplans',planId)||(operationId?(await editor.query('clientmealplans',[['dietitianId','==',session.user.id],['operationId','==',operationId]]))[0]:null);
    if(replayedPlan){
      if(replayedPlan.dietitianId!==session.user.id||replayedPlan.clientId!==validatedData.clientId||replayedPlan.isDeleted)return nativeResponseJson({error:'Operation already used for a different or deleted plan'},{status:409});
      if(!await nativePlanStaffAccess(editor,replayedPlan,session.user))return nativeResponseJson({error:'Forbidden'},{status:403});
      return nativeResponseJson({success:true,message:'Meal plan already saved',mealPlan:await populateNativePlan(editor,replayedPlan),replayed:true});
    }

    // Validate that the client exists and is a client (no cache for write operations)
    const client = await editor.document('users',validatedData.clientId);
    if (!client || client.role !== UserRole.CLIENT) {
      return nativeResponseJson(
        {
          error: "Invalid client",
          message:
            "The specified client does not exist or is not a client user",
        },
        { status: 400 },
      );
    }

    if(!await nativePlanStaffAccess(editor,{clientId:validatedData.clientId},session.user))return nativeResponseJson({error:'Forbidden'},{status:403});

    // Check if client is on hold - prevent publishing meal plans to held clients
    const isCreatingDraft = validatedData.status === "draft";
    const clientData = client as any;
    if (!isCreatingDraft && clientData.holdStatus?.isOnHold) {
      return nativeResponseJson(
        {
          error: "Client on hold",
          code: "CLIENT_ON_HOLD",
          message: `Cannot publish meal plan to "${client.firstName} ${client.lastName}" - client is currently on hold. Either save as draft or activate the client first.`,
        },
        { status: 403 },
      );
    }

    // Validate template if provided - check both DietTemplate and MealPlanTemplate
    let template = null;
    let templateType = null;
    if (validatedData.templateId) {
      // First try DietTemplate
      template = await editor.document('diettemplates',validatedData.templateId);
      if (template) {
        templateType = "diet";
      } else {
        // Fallback to MealPlanTemplate
        template = await editor.document('mealplantemplates',validatedData.templateId);
        if (template) {
          templateType = "meal";
        }
      }

      // If neither found, it's an error only if templateId was provided
      if (!template) {
        return nativeResponseJson(
          {
            error: "Invalid template",
            message: "The specified template does not exist",
          },
          { status: 400 },
        );
      }
    }

    if(template)template=await editor.hydrate(template);

    // Validate date range
    const startDate = new Date(validatedData.startDate);
    const endDate = new Date(validatedData.endDate);

    if (startDate > endDate) {
      return nativeResponseJson(
        {
          error: "Invalid date range",
          message: "Start date must be before or equal to end date",
        },
        { status: 400 },
      );
    }

    const isDraft = validatedData.status === "draft";

    // Check if client has a valid (paid) payment record (skip for drafts)
    // This ensures plans are always linked to payments in the payment section
    let paymentWarning: string | null = null;
    let linkedPaymentId: string | null = validatedData.purchaseId || null;

    if (!isDraft && !linkedPaymentId) {
      // Try to find a recent paid payment for this client that doesn't have a meal plan yet
      const paidPayments=(await editor.query('unifiedpayments',[['client','==',validatedData.clientId]])).filter(item=>item.status==='paid'||item.paymentStatus==='paid'||item.status==='completed');
      const recentPaidPayment=paidPayments.filter(item=>Number(item.remainingDays)>0).sort((a,b)=>new Date(b.paidAt||b.createdAt||0).getTime()-new Date(a.paidAt||a.createdAt||0).getTime())[0];

      if (recentPaidPayment) {
        linkedPaymentId = String(recentPaidPayment._id);
      } else {
        // Check if ANY payment exists for this client at all
        const anyPayment=paidPayments[0];

        if (!anyPayment) {
          paymentWarning =
            "No paid payment record found for this client. The plan has been created but is not linked to any payment. Please ensure a payment is created for proper billing tracking.";
        }
      }
    }

    if (!isDraft && linkedPaymentId) {
      const purchase=await editor.document('unifiedpayments',linkedPaymentId);

      if (!purchase || purchase.client!==validatedData.clientId) {
        return nativeResponseJson(
          {
            error: "Invalid purchase",
            message: "The linked purchase record could not be found",
          },
          { status: 400 },
        );
      }

      const normalizedRemainingDays = Math.max(
        0,
        Number(purchase.remainingDays || 0),
      );
      if (normalizedRemainingDays <= 0) {
        return nativeResponseJson(
          {
            error: "No remaining plan days",
            message:
              "This purchase has no remaining days. Please create a new purchase before assigning another plan.",
          },
          { status: 409 },
        );
      }

      const expectedStart = toStartOfDayDate(
        purchase.expectedStartDate || purchase.startDate,
      );
      const expectedEnd = toStartOfDayDate(
        resolveEntitlementEndDate({
          expectedStartDate: purchase.expectedStartDate || purchase.startDate,
          expectedEndDate: purchase.expectedEndDate,
          endDate: purchase.endDate,
          durationLabel: purchase.durationLabel,
          durationDays: purchase.durationDays,
        }),
      );

      if (!expectedStart || !expectedEnd) {
        return nativeResponseJson(
          {
            error: "Expected dates required",
            message:
              "Expected start and end dates must be set on the purchase before creating a meal plan.",
          },
          { status: 400 },
        );
      }

      if (!isDateWithinInclusiveWindow(startDate, expectedStart, expectedEnd)) {
        return nativeResponseJson(
          {
            error: "Start date outside purchase window",
            message:
              "Meal plan start date must fall within the purchase expected start and end dates.",
          },
          { status: 400 },
        );
      }

      if (!isDateWithinInclusiveWindow(endDate, expectedStart, expectedEnd)) {
        return nativeResponseJson(
          {
            error: "End date outside purchase window",
            message:
              "Meal plan end date must fall within the purchase expected start and end dates.",
          },
          { status: 400 },
        );
      }
    }

    // ========== PHASE CALCULATION ==========
    // Calculate phase number based on client's previous meal plans
    let phaseNumber = validatedData.phaseNumber;
    let phaseTag = validatedData.phaseTag;
    let previousPhaseId: string | null = null;

    if (!isDraft) {
      const resolvedPurchaseId=linkedPaymentId||validatedData.purchaseId;
      const allClientPlans=await editor.query('clientmealplans',[['clientId','==',validatedData.clientId]]);
      const previousPlans=allClientPlans.filter(plan=>!plan.isDeleted&&['active','completed','paused'].includes(plan.status)&&(!resolvedPurchaseId||plan.purchaseId===resolvedPurchaseId));
      const previousPlansCount=previousPlans.length;
      const lastCompletedPlan=previousPlans.sort((a,b)=>new Date(b.endDate).getTime()-new Date(a.endDate).getTime()||new Date(b.createdAt||0).getTime()-new Date(a.createdAt||0).getTime())[0];

      if (lastCompletedPlan?.endDate) {
        const continuity = checkPhaseStartPolicy(
          startDate,
          lastCompletedPlan.endDate,
        );
        if (continuity && !continuity.allowed) {
          return nativeResponseJson(
            {
              error: "Phase start date is too early",
              code: "PHASE_START_BEFORE_EARLIEST_ALLOWED",
              message: `This phase cannot start before ${continuity.earliestAllowedDateKey}. Choose that date or a later date within the purchase window.`,
              expectedStartDate: continuity.expectedStartDateKey,
              earliestAllowedDate: continuity.earliestAllowedDateKey,
              proposedStartDate: continuity.actualStartDateKey,
              gapDays: continuity.gapDays,
              previousPlan: {
                id: String(lastCompletedPlan._id),
                name: lastCompletedPlan.name,
                phaseTag: lastCompletedPlan.phaseTag,
                endDate: lastCompletedPlan.endDate,
              },
            },
            { status: 409 },
          );
        }

        previousPhaseId = String(lastCompletedPlan._id);
      }

      if (!phaseNumber) {
        // Calculate phase number: previous plans count + 1
        phaseNumber = previousPlansCount + 1;
        phaseTag = `PHASE-${phaseNumber}`;
      } else if (!phaseTag) {
        phaseTag = `PHASE-${phaseNumber}`;
      }

      console.log(
        `[ClientMealPlan] Assigned phase: ${phaseTag} (previous plans: ${previousPlansCount})`,
      );
    }

    // Check for overlapping active meal plans for the same client (skip for drafts)
    if (!isDraft) {
      const resolvedMeals =
        validatedData.meals ||
        (template && templateType === "diet" ? template.meals : []);
      if (!hasPublishableMealData(resolvedMeals)) {
        return nativeResponseJson(
          {
            error: "Invalid meal data",
            message:
              "Cannot publish plan without at least one meal slot containing food items",
          },
          { status: 400 },
        );
      }

      const overlappingPlan=(await editor.query('clientmealplans',[['clientId','==',validatedData.clientId],['status','==','active']])).find(plan=>!plan.isDeleted&&plan.startDate<=endDate&&plan.endDate>=startDate);

      if (overlappingPlan) {
        return nativeResponseJson(
          {
            error: "Overlapping meal plan",
            message:
              "The client already has an active meal plan during this period",
          },
          { status: 409 },
        );
      }
    }

    // Create client meal plan - use template data if provided
    const mealPlanData: any = {
      clientId: validatedData.clientId,
      dietitianId: session.user.id,
      purchaseId: linkedPaymentId || validatedData.purchaseId || undefined, // Link to payment for tracking
      name: validatedData.name,
      description: validatedData.description,
      startDate: startDate,
      endDate: endDate,
      duration: validatedData.duration, // Store original plan duration
      meals:
        validatedData.meals ||
        (template && templateType === "diet" ? template.meals : []),
      mealTypes:
        validatedData.mealTypes ||
        (template && templateType === "diet" ? template.mealTypes : []),
      customizations:
        validatedData.customizations ||
        (template
          ? {
              targetCalories:
                template.targetCalories?.max || template.dailyCalorieTarget,
              targetMacros: template.targetMacros
                ? {
                    protein: template.targetMacros.protein?.max,
                    carbs: template.targetMacros.carbs?.max,
                    fat: template.targetMacros.fat?.max,
                  }
                : template.dailyMacros,
            }
          : undefined),
      goals: validatedData.goals || { primaryGoal: "health-improvement" },
      status: validatedData.status || "active",
      reminders: validatedData.reminders || {
        mealReminders: true,
        progressReminders: true,
        checkInReminders: true,
      },
      analytics: {
        totalDaysCompleted: 0,
      },
      // Phase tracking fields
      phaseNumber: phaseNumber || undefined,
      phaseTag: phaseTag || undefined,
      previousPhaseId: previousPhaseId || undefined,
      operationId,
    };

    // Only add templateId if provided
    if (validatedData.templateId) {
      mealPlanData.templateId = validatedData.templateId;
    }

    const now=new Date();
    Object.assign(mealPlanData,{_id:planId,createdAt:now,updatedAt:now,isDeleted:false,republishCount:0,totalFreezeCount:0,freezedDays:[],mealCompletions:[],progress:[],__v:0,...(!isDraft?{firstPublishedAt:now,publishedAt:now}:{})});
    const mutations:Array<{collection:string;id:string;patch:Record<string,any>}>=[];
    if(!isDraft&&linkedPaymentId){
      const purchase=await editor.document('unifiedpayments',linkedPaymentId);
      if(!purchase||purchase.client!==validatedData.clientId)return nativeResponseJson({error:'Invalid purchase'},{status:400});
      const siblingPlans=(await editor.query('clientmealplans',[['purchaseId','==',linkedPaymentId],['clientId','==',validatedData.clientId]])).filter(plan=>!plan.isDeleted&&['active','completed','paused'].includes(plan.status));
      const phaseDays=validatedData.duration||Math.round((endDate.getTime()-startDate.getTime())/86400000)+1;
      const daysUsed=siblingPlans.reduce((total,plan)=>total+(Number(plan.duration)||Math.round((new Date(plan.endDate).getTime()-new Date(plan.startDate).getTime())/86400000)+1-(plan.freezedDays?.length||0)),0)+phaseDays;
      const programDays=Number(purchase.durationDays||Number(purchase.daysUsed||0)+Number(purchase.remainingDays||0));
      if(!Number.isFinite(programDays)||daysUsed>programDays)return nativeResponseJson({error:'Insufficient remaining program days'},{status:409});
      mealPlanData.duration=phaseDays;
      mutations.push({collection:'unifiedpayments',id:linkedPaymentId,patch:{mealPlanCreated:true,phaseTag,phaseNumber,daysUsed,remainingDays:programDays-daysUsed,linkedMealPlanIds:[...new Set([...(purchase.linkedMealPlanIds||[]),planId])]}});
    }
    if(!isDraft&&validatedData.templateId&&templateType)mutations.push({collection:templateType==='diet'?'diettemplates':'mealplantemplates',id:validatedData.templateId,patch:{usageCount:Number(template?.usageCount||0)+1}});
    if(!await editor.commit(mutations,[{collection:'clientmealplans',id:planId,data:mealPlanData}]))return nativeResponseJson({error:'The client, plan or purchase changed. Retry with the same operation key.'},{status:409});
    const clientMealPlan=await populateNativePlan(editor,mealPlanData);
    clearCacheByTag('client_meal_plans');clearCacheByTag('client_purchases');

    // Skip history logging, notifications, and client status update for drafts
    if (!isDraft) {
      await grantDietPlanAccess(validatedData.clientId);

      // Log history for meal plan assignment
      await logHistoryServer({
        userId: validatedData.clientId,
        action: "assign",
        category: "diet",
        description: `Meal plan assigned: ${validatedData.name} (${startDate.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} - ${endDate.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })})`,
        performedById: session.user.id,
        metadata: {
          mealPlanId: clientMealPlan._id,
          name: validatedData.name,
          templateId: validatedData.templateId,
          startDate: validatedData.startDate,
          endDate: validatedData.endDate,
          status: clientMealPlan.status,
        },
      });

      // Log activity for audit trail
      const roleMap: Record<
        string,
        "admin" | "dietitian" | "health_counselor" | "client"
      > = {
        admin: "admin",
        dietitian: "dietitian",
        health_counselor: "health_counselor",
      };
      logActivity({
        userId: session.user.id,
        userRole: roleMap[userRole as string] || "admin",
        userName: session.user.name || session.user.email || "",
        userEmail: session.user.email || "",
        action: "Assigned Meal Plan",
        actionType: "create",
        category: "meal_plan",
        description: `Assigned meal plan "${validatedData.name}" to client ${client.firstName || ""} ${client.lastName || ""} (${client.email}).`,
        targetUserId: validatedData.clientId,
        targetUserName: `${client.firstName || ""} ${client.lastName || ""} (${client.email})`,
        resourceId: clientMealPlan._id?.toString(),
        resourceType: "ClientMealPlan",
        resourceName: validatedData.name,
        details: {
          startDate: validatedData.startDate,
          endDate: validatedData.endDate,
          templateId: validatedData.templateId,
        },
      }).catch(() => {});

      // Send push notification to client about new meal plan
      try {
        await sendNotificationToUser(validatedData.clientId, {
          title: "📋 New Meal Plan Assigned",
          body: `You have a new meal plan: "${validatedData.name}". Check your plan now!`,
          data: {
            type: "meal_plan",
            mealPlanId: clientMealPlan._id?.toString(),
            url: "/my-plan",
          },
        });
      } catch (notificationError) {
        console.error(
          "Failed to send meal plan notification:",
          notificationError,
        );
      }

      // Update client status based on the new meal plan
      try {
        const newStatus = await updateClientStatusFromMealPlan(
          validatedData.clientId,
        );
        console.log(
          `[ClientMealPlan] Client ${validatedData.clientId} status updated to: ${newStatus}`,
        );
      } catch (statusError) {
        console.error("Failed to update client status:", statusError);
        // Don't fail the request - meal plan was created successfully
      }
    } // end !isDraft block

    return nativeResponseJson(
      {
        success: true,
        message: isDraft
          ? "Draft saved successfully"
          : paymentWarning
            ? "Meal plan assigned successfully (Warning: No payment linked)"
            : "Meal plan assigned successfully",
        mealPlan: clientMealPlan,
        paymentWarning: isDraft ? undefined : paymentWarning || undefined,
        linkedPaymentId: isDraft ? undefined : linkedPaymentId || undefined,
        // Phase tracking info
        phaseInfo: isDraft
          ? undefined
          : phaseNumber
            ? {
                phaseNumber,
                phaseTag,
                previousPhaseId,
                isFirstPhase: phaseNumber === 1,
              }
            : undefined,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error assigning meal plan:", error);

    // Handle structured validation errors
    if (error instanceof Error && error.name === "ValidationError") {
      return nativeResponseJson(
        {
          error: "Database validation failed",
          message: "The meal plan data does not meet the required format",
          details: Object.values((error as any).errors).map((err: any) => ({
            field: err.path,
            message: err.message,
          })),
        },
        { status: 400 },
      );
    }

    return nativeResponseJson(
      {
        error: "Internal server error",
        message: "Failed to assign meal plan. Please try again later.",
      },
      { status: 500 },
    );
  }
}
