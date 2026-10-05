import {Filter,type Firestore,type Query,type DocumentData} from 'firebase-admin/firestore';
import {nativeDates} from './native-plan-editor';
import {nativeAppointmentActor} from './native-staff-appointments';
import {NativeStaffClientError} from './native-staff-client';
import {differenceInDays} from 'date-fns';
import {canonicalizePurchaseRecords} from '@/lib/payments/canonicalize-purchases';
import {resolveEntitlementEndDate} from '@/lib/payments/entitlement-dates';
import {indexedDashboardRows,hydrateDashboardClientDetails,indexedDashboardScope,indexedDashboardClients,indexedDashboardPaymentSummary,indexedDashboardPlanSummary,summarizeDashboardPayments} from './native-dashboard-indexed';
export async function dashboardClients(db:Firestore,actorId:string,kind:'dietitian'|'health_counselor'|'pending',dietitianId?:string|null){
 const actor=await nativeAppointmentActor(db,actorId),role=actor.get('role');if(role==='client'||kind==='health_counselor'&&!['admin','health_counselor'].includes(role))throw new NativeStaffClientError('Forbidden',403);
 let query:Query=db.collection('users').where('role','==','client');const staff=role==='admin'?dietitianId:actorId;
 if(staff){const conditions=kind==='health_counselor'?[Filter.where('assignedHealthCounselor','==',staff),Filter.where('assignedHealthCounselors','array-contains',staff)]:[Filter.where('assignedDietitian','==',staff),Filter.where('assignedDietitians','array-contains',staff)];if(role==='health_counselor'&&kind!=='health_counselor')conditions.push(Filter.where('assignedHealthCounselor','==',staff),Filter.where('assignedHealthCounselors','array-contains',staff));if(kind!=='pending')conditions.push(Filter.where('createdBy.userId','==',staff));query=query.where(Filter.or(...conditions));}
 let denseScope=false;
 if(process.env.FIRESTORE_NATIVE_PROJECT_ID==='dtps-2cbac'&&db.databaseId==='dtps-native-staging'&&!process.env.FIRESTORE_EMULATOR_HOST){
  const scope=await indexedDashboardScope(staff,kind==='health_counselor',role==='health_counselor'&&kind!=='health_counselor',kind!=='pending');
  denseScope=scope.length>=3000&&scope.length*2>=(await db.collection('users').where('role','==','client').count().get()).data().count;
  if(denseScope){
   const clients=await indexedDashboardClients(scope);
   if(clients)return {role,clients:clients.filter(c=>kind!=='pending'||c.status!=='suspended').sort((a,b)=>new Date(b.createdAt||0).getTime()-new Date(a.createdAt||0).getTime()),summaryOnly:true,denseScope};
  }
 }
 const rows=await query.select('firstName','lastName','email','phone','avatar','clientId','clientStatus','status','createdAt','dateOfBirth','anniversary','holdStatus.isOnHold','assignedDietitian','assignedDietitians').get();
 return {role,summaryOnly:false,denseScope,clients:rows.docs.map(r=>({_id:r.id,...nativeDates(r.data())}) as DocumentData).filter(c=>kind!=='pending'||c.status!=='suspended').sort((a,b)=>new Date(b.createdAt||0).getTime()-new Date(a.createdAt||0).getTime())};
}
// Bound each Firestore membership query and network wave; only dashboard fields are read.
export async function dashboardRelated(db:Firestore,collection:string,field:string,ids:string[],fields:string[],configure?:(q:Query)=>Query,membershipSize=30){
 // An additional status IN multiplies disjunctions; those callers explicitly use 10.
 if(!Number.isInteger(membershipSize)||membershipSize<1||membershipSize>30)throw new Error('Invalid membership batch size');
 const rows:DocumentData[]=[],uniqueIds=[...new Set(ids)];
 // Explicit membership ordering lets Enterprise use the relationship index instead
 // of choosing a table scan for IN. Callers independently sort their final results.
 const batches:DocumentData[][]=[];let next=0;
 await Promise.all(Array.from({length:Math.min(6,Math.ceil(uniqueIds.length/membershipSize))},async()=>{
  for(;;){const slot=next++,i=slot*membershipSize;if(i>=uniqueIds.length)return;
   let q:Query=db.collection(collection).where(field,'in',uniqueIds.slice(i,i+membershipSize));if(configure)q=configure(q);
   const snap=await q.orderBy(field).select(...fields).get();
   batches[slot]=snap.docs.map(doc=>({_id:doc.id,...nativeDates(doc.data())}));
  }
 }));
 for(const batch of batches)rows.push(...batch);
 return rows;
}
export async function nativePendingPlans(db:Firestore,actorId:string,params:URLSearchParams){
 const {clients,summaryOnly,denseScope}=await dashboardClients(db,actorId,'pending',params.get('dietitianId')),clientIds=clients.map(c=>c._id);const today=new Date();today.setHours(0,0,0,0);
 const useIndexed=process.env.FIRESTORE_NATIVE_PROJECT_ID==='dtps-2cbac'&&db.databaseId==='dtps-native-staging'&&!process.env.FIRESTORE_EMULATOR_HOST;
 const [rawPlans,purchases]=await Promise.all([
 useIndexed?indexedDashboardRows('pendingPlans',clientIds,denseScope):dashboardRelated(db,'clientmealplans','clientId',clientIds,['clientId','name','startDate','endDate','duration','status','purchaseId','isDeleted'],q=>q.where('status','in',['active','paused','completed']),10),
 useIndexed?indexedDashboardRows('pendingPurchases',clientIds):dashboardRelated(db,'unifiedpayments','client',clientIds,'client planName durationDays durationLabel startDate endDate expectedStartDate expectedEndDate mealPlanCreated daysUsed remainingDays linkedMealPlanIds parentPaymentId status paymentStatus finalAmount amount paymentLink otherPlatformPayment razorpayOrderId razorpayPaymentId razorpayPaymentLinkId transactionId stripePaymentIntentId createdAt updatedAt'.split(' '),q=>q.where('status','in',['active','paid','completed']),10)]);
 const mealPlans=rawPlans.filter(p=>p.isDeleted!==true);purchases.sort((a,b)=>new Date(b.createdAt||0).getTime()-new Date(a.createdAt||0).getTime());
    // Group meal plans by client
    const mealPlansByClient: Record<string, any[]> = {};
    mealPlans.forEach((plan: any) => {
      const clientId = plan.clientId.toString();
      if (!mealPlansByClient[clientId]) {
        mealPlansByClient[clientId] = [];
      }
      mealPlansByClient[clientId].push(plan);
    });

    // Group purchases by client
    const purchasesByClient: Record<string, any[]> = {};
    purchases.forEach((purchase: any) => {
      const clientId = purchase.client.toString();
      if (!purchasesByClient[clientId]) {
        purchasesByClient[clientId] = [];
      }
      purchasesByClient[clientId].push(purchase);
    });

    const pendingPlans: any[] = [];

    for (const client of clients) {
      const previousPendingCount = pendingPlans.length;
      const clientId = (client as any)._id.toString();
      const clientMealPlans = mealPlansByClient[clientId] || [];
      const clientPurchases = canonicalizePurchaseRecords(
        purchasesByClient[clientId] || [],
      ).purchases.map((purchase: any) => ({
        ...purchase,
        expectedEndDate:
          resolveEntitlementEndDate({
            expectedStartDate: purchase.expectedStartDate,
            expectedEndDate: purchase.expectedEndDate,
            endDate: purchase.endDate,
            durationLabel: purchase.durationLabel,
            durationDays: purchase.durationDays,
          }) || purchase.expectedEndDate,
      }));

      if (clientPurchases.length === 0) continue;

      // A leftover counter on an expired purchase is historical accounting, not
      // work that should create a new phase. This also neutralizes duplicated
      // migration purchases whose unused copy retained all of its days.
      const eligiblePurchases = clientPurchases.filter((purchase: any) => {
        const entitlementEnd = purchase.expectedEndDate || purchase.endDate;
        if (!entitlementEnd) return true;

        const endDate = new Date(entitlementEnd);
        if (Number.isNaN(endDate.getTime())) return true;
        endDate.setHours(23, 59, 59, 999);
        return endDate >= today;
      });

      if (eligiblePurchases.length === 0) continue;

      // Sort meal plans by start date
      const sortedMealPlans = [...clientMealPlans].sort(
        (a, b) =>
          new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
      );

      // Prefer the newest purchase that still has unallocated days. Falling
      // back to the newest record preserves the previous response contract.
      const latestPurchase =
        eligiblePurchases.find(
          (purchase: any) =>
            Math.max(
              0,
              Number(purchase.durationDays || 0) -
                Number(purchase.daysUsed || 0),
            ) > 0,
        ) || eligiblePurchases[0];

      // Calculate total purchased days from the purchase record
      const totalPurchasedDays = latestPurchase.durationDays || 0;

      // Get days already used from the purchase record
      const daysUsed = latestPurchase.daysUsed || 0;

      // Pending days to create = purchased days - days used
      const pendingDaysToCreate = Math.max(0, totalPurchasedDays - daysUsed);

      // Calculate total meal plan days created (for display purposes)
      const totalMealPlanDays = daysUsed;

      // Find current running plan
      const currentPlan = sortedMealPlans.find((plan: any) => {
        const planStart = new Date(plan.startDate);
        const planEnd = new Date(plan.endDate);
        planStart.setHours(0, 0, 0, 0);
        planEnd.setHours(23, 59, 59, 999);
        return today >= planStart && today <= planEnd;
      });

      // Find upcoming plans (starting in future)
      const upcomingPlans = sortedMealPlans.filter((plan: any) => {
        const planStart = new Date(plan.startDate);
        planStart.setHours(0, 0, 0, 0);
        return planStart > today;
      });

      // Find the most recent completed/previous plan
      const previousPlans = sortedMealPlans.filter((plan: any) => {
        const planEnd = new Date(plan.endDate);
        planEnd.setHours(23, 59, 59, 999);
        return planEnd < today;
      });
      const lastPlan =
        previousPlans.length > 0
          ? previousPlans[previousPlans.length - 1]
          : null;

      // CASE 1: Has purchase but NO meal plan created at all
      if (clientMealPlans.length === 0) {
        pendingPlans.push({
          clientId: (client as any)._id,
          displayClientId: (client as any).clientId || null,
          assignedDietitianId:
            (client as any).assignedDietitian?.toString() || null,
          clientName: `${(client as any).firstName} ${(client as any).lastName}`,
          phone: (client as any).phone || "N/A",
          email: (client as any).email,

          // Current plan info
          currentPlanName: null,
          currentPlanStartDate: null,
          currentPlanEndDate: null,
          currentPlanRemainingDays: 0,

          // Previous plan info
          previousPlanName: null,

          // Purchase info
          purchasedPlanName: latestPurchase.planName,
          totalPurchasedDays,
          totalMealPlanDays,
          pendingDaysToCreate,

          // Expected dates from purchase
          expectedStartDate: latestPurchase.expectedStartDate,
          expectedEndDate: latestPurchase.expectedEndDate,

          // Status
          reason: "no_meal_plan",
          reasonText: "No meal plan created",
          urgency: "critical",
          hasNextPhase: false,
        });
        continue;
      }

      // CASE 2: Current plan ends within 5 days AND there are pending days
      if (currentPlan && pendingDaysToCreate > 0) {
        const planEndDate = new Date(currentPlan.endDate);
        planEndDate.setHours(0, 0, 0, 0);
        const daysRemaining = differenceInDays(planEndDate, today);

        if (daysRemaining <= 5 && daysRemaining >= 0) {
          // Check if next phase/plan already exists
          const hasNextPlan = upcomingPlans.length > 0;

          if (!hasNextPlan) {
            // Updated urgency logic based on days remaining
            // 0 days or expired = Highly Critical
            // 1-3 days = High Priority
            // 4+ days = Medium
            let urgency: "critical" | "high" | "medium" = "medium";
            if (daysRemaining <= 0) {
              urgency = "critical";
            } else if (daysRemaining <= 3) {
              urgency = "high";
            } else {
              urgency = "medium";
            }

            pendingPlans.push({
              clientId: (client as any)._id,
              displayClientId: (client as any).clientId || null,
              assignedDietitianId:
                (client as any).assignedDietitian?.toString() || null,
              clientName: `${(client as any).firstName} ${(client as any).lastName}`,
              phone: (client as any).phone || "N/A",
              email: (client as any).email,

              // Current plan info
              currentPlanName: currentPlan.name,
              currentPlanStartDate: currentPlan.startDate,
              currentPlanEndDate: currentPlan.endDate,
              currentPlanRemainingDays: daysRemaining,

              // Previous plan info
              previousPlanName: lastPlan?.name || null,

              // Purchase info
              purchasedPlanName: latestPurchase.planName,
              totalPurchasedDays,
              totalMealPlanDays,
              pendingDaysToCreate,

              // Expected dates from purchase
              expectedStartDate: latestPurchase.expectedStartDate,
              expectedEndDate: latestPurchase.expectedEndDate,

              // Status
              reason: "current_ending_soon",
              reasonText: `Current phase ends in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`,
              urgency,
              hasNextPhase: false,
            });
          }
        }
      }

      // CASE 3: No current running plan but has pending days (gap between phases)
      if (!currentPlan && pendingDaysToCreate > 0 && lastPlan) {
        // Check if the last plan ended recently (within last 7 days) or there's a gap
        const lastPlanEnd = new Date(lastPlan.endDate);
        const daysSinceLastPlan = differenceInDays(today, lastPlanEnd);

        if (
          daysSinceLastPlan >= 0 &&
          daysSinceLastPlan <= 7 &&
          upcomingPlans.length === 0
        ) {
          pendingPlans.push({
            clientId: (client as any)._id,
            displayClientId: (client as any).clientId || null,
            assignedDietitianId:
              (client as any).assignedDietitian?.toString() || null,
            clientName: `${(client as any).firstName} ${(client as any).lastName}`,
            phone: (client as any).phone || "N/A",
            email: (client as any).email,

            // Current plan info (none currently running)
            currentPlanName: null,
            currentPlanStartDate: null,
            currentPlanEndDate: null,
            currentPlanRemainingDays: 0,

            // Previous plan info
            previousPlanName: lastPlan.name,
            previousPlanEndDate: lastPlan.endDate,

            // Purchase info
            purchasedPlanName: latestPurchase.planName,
            totalPurchasedDays,
            totalMealPlanDays,
            pendingDaysToCreate,

            // Expected dates
            expectedStartDate: latestPurchase.expectedStartDate,
            expectedEndDate: latestPurchase.expectedEndDate,

            // Status
            // Status
            reason: "phase_gap",
            reasonText: `Previous phase ended ${daysSinceLastPlan} day${daysSinceLastPlan !== 1 ? "s" : ""} ago`,
            // 3+ days since last plan = critical (client without active plan)
            // 1-2 days = high
            // 0 days = medium (just ended today)
            urgency:
              daysSinceLastPlan >= 3
                ? "critical"
                : daysSinceLastPlan >= 1
                  ? "high"
                  : "medium",
            hasNextPhase: false,
          });
        }
      }

      // Eligible purchases were already checked against their entitlement end.
      // An old completed phase does not finish a still-valid paid program.
      // Keep outstanding days visible until they are allocated or expire.
      if (pendingDaysToCreate > 0) {
        // Check if already added in previous cases
        // Only this client's cases can append during the current iteration.
        // Avoid rescanning every previously collected client for each row.
        const alreadyAdded = pendingPlans.length > previousPendingCount;

        if (!alreadyAdded) {
          // Determine the "current" plan to show - either running plan or the upcoming one
          const displayPlan =
            currentPlan || (upcomingPlans.length > 0 ? upcomingPlans[0] : null);

          let daysUntilNextAction = 0;
          let reasonText = "";
          let urgency: "critical" | "high" | "medium" = "medium";

          if (currentPlan) {
            // Has a running plan
            daysUntilNextAction = differenceInDays(
              new Date(currentPlan.endDate),
              today,
            );
            reasonText = `Current plan ends in ${daysUntilNextAction} days`;
            urgency =
              daysUntilNextAction <= 2
                ? "critical"
                : daysUntilNextAction <= 5
                  ? "high"
                  : "medium";
          } else if (upcomingPlans.length > 0) {
            // Has upcoming plan but no current
            const nextPlan = upcomingPlans[0];
            daysUntilNextAction = differenceInDays(
              new Date(nextPlan.startDate),
              today,
            );
            reasonText = `Next plan starts in ${daysUntilNextAction} days, ${pendingDaysToCreate} days pending`;
            urgency = pendingDaysToCreate > 10 ? "high" : "medium";
          } else {
            // No current or upcoming plan - needs immediate attention
            reasonText = `${pendingDaysToCreate} days need meal plans`;
            urgency = "critical";
          }

          pendingPlans.push({
            clientId: (client as any)._id,
            displayClientId: (client as any).clientId || null,
            assignedDietitianId:
              (client as any).assignedDietitian?.toString() || null,
            clientName: `${(client as any).firstName} ${(client as any).lastName}`,
            phone: (client as any).phone || "N/A",
            email: (client as any).email,

            // Current/Display plan info
            currentPlanName: currentPlan?.name || null,
            currentPlanStartDate: currentPlan?.startDate || null,
            currentPlanEndDate: currentPlan?.endDate || null,
            currentPlanRemainingDays: currentPlan
              ? differenceInDays(new Date(currentPlan.endDate), today)
              : 0,

            // Previous plan info
            previousPlanName: lastPlan?.name || null,
            previousPlanEndDate: lastPlan?.endDate || null,

            // Upcoming plan info
            upcomingPlanName:
              upcomingPlans.length > 0 ? upcomingPlans[0].name : null,
            upcomingPlanStartDate:
              upcomingPlans.length > 0 ? upcomingPlans[0].startDate : null,
            upcomingPlanEndDate:
              upcomingPlans.length > 0 ? upcomingPlans[0].endDate : null,

            // Purchase info
            purchasedPlanName: latestPurchase.planName,
            totalPurchasedDays,
            totalMealPlanDays,
            pendingDaysToCreate,

            // Expected dates
            expectedStartDate: latestPurchase.expectedStartDate,
            expectedEndDate: latestPurchase.expectedEndDate,

            // Status
            reason: currentPlan
              ? "current_ending_soon"
              : upcomingPlans.length > 0
                ? "upcoming_with_pending"
                : "phase_gap",
            reasonText,
            urgency,
            hasNextPhase: upcomingPlans.length > 0,
          });
        }
      }
    }

    // Only clients with actionable allocations need their contact details loaded.
    if(summaryOnly){
      await hydrateDashboardClientDetails(clients,pendingPlans.map(plan=>plan.clientId));
      const byId=new Map(clients.map(client=>[client._id,client]));
      for(const plan of pendingPlans){const client=byId.get(plan.clientId)!;Object.assign(plan,{
        displayClientId:client.clientId||null,assignedDietitianId:client.assignedDietitian?.toString()||null,
        clientName:`${client.firstName} ${client.lastName}`,phone:client.phone||'N/A',email:client.email,
      });}
    }
    // Sort by urgency (critical first) and then by pending days
    pendingPlans.sort((a, b) => {
      const urgencyOrder: Record<string, number> = {
        critical: 0,
        high: 1,
        medium: 2,
      };
      const urgencyDiff =
        (urgencyOrder[a.urgency] ?? 3) - (urgencyOrder[b.urgency] ?? 3);
      if (urgencyDiff !== 0) return urgencyDiff;
      return (b.pendingDaysToCreate || 0) - (a.pendingDaysToCreate || 0); // Higher pending days first
    });

    return {
      success: true,
      pendingPlans,
      totalCount: pendingPlans.length,
      criticalCount: pendingPlans.filter((p) => p.urgency === "critical")
        .length,
      highCount: pendingPlans.filter((p) => p.urgency === "high").length,
      mediumCount: pendingPlans.filter((p) => p.urgency === "medium").length,
    };

}

async function dashboardAppointments(db:Firestore,actorId:string,role:string,health:boolean,start:Date,end:Date){
 let q:Query=db.collection('appointments');if(role!=='admin')q=health?q.where(Filter.or(Filter.where('dietitian','==',actorId),Filter.where('healthCounselor','==',actorId))):q.where('dietitian','==',actorId);
 const count=async(q:Query)=>(await q.count().get()).data().count,day=q.where('scheduledAt','>=',start).where('scheduledAt','<',end);
 const [totalAppointments,completedSessions,totalPastAppointments,rows]=await Promise.all([count(q.where('scheduledAt','>=',start).where('status','in',['scheduled','confirmed','rescheduled','in-progress','pending'])),count(q.where('scheduledAt','<',start).where('status','in',['confirmed','completed'])),count(q.where('scheduledAt','<',start)),day.select('client','scheduledAt','duration','status','type').orderBy('scheduledAt').get()]);
 // Derive today's counters from the schedule already required by the response.
 const todaysAppointments=rows.size,confirmedAppointments=rows.docs.filter(row=>['scheduled','confirmed','rescheduled'].includes(row.get('status'))).length,pendingAppointments=rows.docs.filter(row=>row.get('status')==='pending').length;
 const schedule:DocumentData[]=rows.docs.map(r=>({_id:r.id,...nativeDates(r.data())}));const ids=[...new Set(schedule.map(r=>r.client).filter(Boolean))];const users=new Map();for(let i=0;i<ids.length;i+=100)for(const r of await db.getAll(...ids.slice(i,i+100).map(id=>db.collection('users').doc(id)),{fieldMask:['firstName','lastName','email','avatar']}))if(r.exists)users.set(r.id,{_id:r.id,...r.data()});for(const r of schedule)r.client=users.get(r.client)||null;
 return {metrics:{totalAppointments,todaysAppointments,confirmedAppointments,pendingAppointments,completedSessions,totalPastAppointments},schedule};
}
export async function nativeStaffStats(db:Firestore,actorId:string,kind:'dietitian'|'health_counselor'){
 const {clients:assignedClients,role,summaryOnly,denseScope}=await dashboardClients(db,actorId,kind),clientIds=assignedClients.map(c=>c._id),clientMap=new Map(assignedClients.map(c=>[c._id,c]));
 const today=new Date();today.setHours(0,0,0,0);const startOfToday=today,endOfToday=new Date(today.getTime()+86400000),endOfPendingWindow=new Date(today.getTime()+4*86400000),startOfExpiredWindow=new Date(today.getTime()-3*86400000),todayMonth=today.getMonth(),todayDate=today.getDate();
 const useCoveringIndexes=process.env.FIRESTORE_NATIVE_PROJECT_ID==='dtps-2cbac'&&db.databaseId==='dtps-native-staging'&&!process.env.FIRESTORE_EMULATOR_HOST;
 // Reuse this request's verified scope density; do not bill a second population count.
 const allowDenseScan=useCoveringIndexes&&denseScope;
 let taskQuery:Query=db.collection('tasks');if(role!=='admin')taskQuery=taskQuery.where('dietitian','==',actorId);
 const [appt,planSummary,paymentSummary,taskRows]=await Promise.all([
  dashboardAppointments(db,actorId,role,kind==='health_counselor',startOfToday,endOfToday),
  useCoveringIndexes?indexedDashboardPlanSummary(clientIds,startOfToday,endOfPendingWindow,allowDenseScan,kind!=='health_counselor'):dashboardRelated(db,'clientmealplans','clientId',clientIds,['clientId','name','startDate','endDate','status','isDeleted'],q=>q.where('status','==','active')).then(plans=>{const active=plans.filter(p=>p.isDeleted!==true);return {activeClientIds:[...new Set(active.map(p=>p.clientId))],expiringPlans:active.filter(p=>p.endDate>=startOfToday&&p.endDate<endOfPendingWindow)};}),
  useCoveringIndexes?indexedDashboardPaymentSummary(clientIds,startOfExpiredWindow,endOfToday,allowDenseScan,kind!=='health_counselor'):dashboardRelated(db,'unifiedpayments','client',clientIds,'client amount currency status planName planCategory durationDays durationLabel transactionId createdAt expectedEndDate'.split(' ')).then(payments=>summarizeDashboardPayments(payments,startOfExpiredWindow,endOfToday)),
  kind==='health_counselor'?Promise.resolve(null):taskQuery.where('startDate','<=',endOfToday).where('endDate','>=',startOfToday).orderBy('endDate').orderBy('startDate').select('client','title','taskType','allottedTime','status','startDate','endDate','createdAt').get()
 ]);
 const visibleTasks=(taskRows?.docs||[]).map(r=>({_id:r.id,...nativeDates(r.data())}) as DocumentData).filter(t=>t.status!=='cancelled').sort((a,b)=>a.startDate-b.startDate||b.createdAt-a.createdAt).slice(0,10);
 if(summaryOnly){
  const visible=kind==='health_counselor'?[]:assignedClients.filter(client=>[client.dateOfBirth,client.anniversary].some(value=>{const date=new Date(value);return date.getMonth()===todayMonth&&date.getDate()===todayDate;})||client.createdAt>=startOfToday&&client.createdAt<endOfToday);
  await hydrateDashboardClientDetails(assignedClients,[...assignedClients.slice(0,10).map(c=>c._id),...visible.map(c=>c._id),...(kind==='health_counselor'?[]:[...planSummary.expiringPlans.map(p=>p.clientId),...paymentSummary.expiredPayments.map(p=>p.client),...paymentSummary.recentPayments.map(p=>p.client),...visibleTasks.map(t=>t.client)])]);
 }
 const activePlanClientIds=planSummary.activeClientIds,todaysSchedule=appt.schedule;
 if(kind==='health_counselor'){
 const metrics=appt.metrics,paymentMetrics={totalRevenue:paymentSummary.groups.filter(p=>p.status==='completed').reduce((s,p)=>s+p.amount,0),pendingPaymentsCount:paymentSummary.groups.filter(p=>p.status==='pending').reduce((s,p)=>s+p.count,0),completedPaymentsCount:paymentSummary.groups.filter(p=>p.status==='completed').reduce((s,p)=>s+p.count,0)};
    const totalClients = assignedClients.length;
    const activeClients = assignedClients.filter(
      (client: any) => client.clientStatus === 'active',
    ).length;
    const leadClients = assignedClients.filter(
      (client: any) => !client.clientStatus || client.clientStatus === 'lead',
    ).length;
    const inactiveClients = assignedClients.filter(
      (client: any) => client.clientStatus === 'inactive',
    ).length;
    const totalPastAppointments = metrics.totalPastAppointments || 0;
    const completedSessions = metrics.completedSessions || 0;

    return {
      totalClients,
      activeClients,
      leadClients,
      inactiveClients,
      clientsWithMealPlans: activePlanClientIds.length,
      todaysAppointments: metrics.todaysAppointments || 0,
      confirmedAppointments: metrics.confirmedAppointments || 0,
      pendingAppointments: metrics.pendingAppointments || 0,
      completedSessions,
      completionRate:
        totalPastAppointments > 0
          ? Math.round((completedSessions / totalPastAppointments) * 100)
          : 0,
      activePercentage:
        totalClients > 0 ? Math.round((activeClients / totalClients) * 100) : 0,
      recentClients: assignedClients.slice(0, 10).map((client: any) => ({
        _id: client._id,
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        phone: client.phone,
        avatar: client.avatar,
        clientStatus: client.clientStatus,
        createdAt: client.createdAt,
      })),
      todaysSchedule: todaysSchedule.map((appointment: any) => ({
        _id: appointment._id,
        client: appointment.client
          ? {
              _id: appointment.client._id,
              firstName: appointment.client.firstName,
              lastName: appointment.client.lastName,
              avatar: appointment.client.avatar,
            }
          : null,
        scheduledAt: appointment.scheduledAt,
        duration: appointment.duration,
        status: appointment.status,
      })),
      totalRevenue: paymentMetrics.totalRevenue || 0,
      pendingPaymentsCount: paymentMetrics.pendingPaymentsCount || 0,
      completedPaymentsCount: paymentMetrics.completedPaymentsCount || 0,
    };

 }
    const totalClients = assignedClients.length;
    const activeClients = assignedClients.filter((client: any) => client.clientStatus === 'active').length;
    const leadClients = assignedClients.filter(
      (client: any) => !client.clientStatus || client.clientStatus === 'lead',
    ).length;
    const inactiveClients = assignedClients.filter(
      (client: any) => client.clientStatus === 'inactive',
    ).length;
    const holdClients = assignedClients.filter(
      (client: any) => client.clientStatus === 'hold' || client.holdStatus?.isOnHold === true,
    ).length;
    const appointmentMetrics = appt.metrics;
    const totalAppointments = appointmentMetrics.totalAppointments || 0;
    const todaysAppointments = appointmentMetrics.todaysAppointments || 0;
    const confirmedAppointments = appointmentMetrics.confirmedAppointments || 0;
    const pendingAppointments = appointmentMetrics.pendingAppointments || 0;
    const completedSessions = appointmentMetrics.completedSessions || 0;
    const totalPastAppointments = appointmentMetrics.totalPastAppointments || 0;

    // ─── Celebrations ─────────────────────────────────────────────────────────
    const isTodayMonthDay = (value?: Date | string | null) => {
      if (!value) return false;
      const d = new Date(value);
      return d.getMonth() === todayMonth && d.getDate() === todayDate;
    };

    const recentClients = assignedClients
      .filter(
        (c: any) =>
          c.createdAt &&
          new Date(c.createdAt) >= startOfToday &&
          new Date(c.createdAt) < endOfToday
      )
      .slice(0, 10);

    const todayCelebrations = assignedClients
      .flatMap((client: any) => {
        const out: Array<{
          id: string;
          clientId: string;
          clientName: string;
          clientEmail?: string;
          clientPhone?: string;
          type: 'Birthday' | 'Anniversary';
          date: string | Date;
        }> = [];

        if (isTodayMonthDay(client.dateOfBirth)) {
          out.push({
            id:          `${client._id}-birthday`,
            clientId:    client._id,
            clientName:  `${client.firstName} ${client.lastName}`,
            clientEmail: client.email,
            clientPhone: client.phone,
            type:        'Birthday',
            date:        client.dateOfBirth,
          });
        }

        if (isTodayMonthDay(client.anniversary)) {
          out.push({
            id:          `${client._id}-anniversary`,
            clientId:    client._id,
            clientName:  `${client.firstName} ${client.lastName}`,
            clientEmail: client.email,
            clientPhone: client.phone,
            type:        'Anniversary',
            date:        client.anniversary,
          });
        }

        return out;
      })
      .slice(0, 10);


 const expiringMealPlans=planSummary.expiringPlans.sort((a,b)=>a.endDate-b.endDate).map(p=>({...p,clientId:clientMap.get(p.clientId)}));
 const expiredMealPlans=paymentSummary.expiredPayments.sort((a,b)=>b.expectedEndDate-a.expectedEndDate).map(p=>({...p,client:clientMap.get(p.client)}));
 const activeMealPlanClientIds=activePlanClientIds,recentPayments=paymentSummary.recentPayments.map(p=>({...p,client:clientMap.get(p.client)}));
 const totalRevenueResult=[{total:paymentSummary.groups.filter(p=>['completed','pending','paid'].includes(p.status)).reduce((s,p)=>s+p.amount,0)}],pendingPaymentsCount=paymentSummary.groups.filter(p=>p.status==='pending').reduce((s,p)=>s+p.count,0),completedPaymentsCount=paymentSummary.groups.filter(p=>p.status==='completed').reduce((s,p)=>s+p.count,0);
 const todaysTasks=visibleTasks.map(t=>({...t,client:clientMap.get(t.client)}));
    const clientsWithMealPlans = activeMealPlanClientIds.length;
    const completionRate =
      totalPastAppointments > 0
        ? Math.round((completedSessions / totalPastAppointments) * 100)
        : 0;

    /*
      Queries above intentionally remain fresh because this dashboard includes
      appointments, messages and payments. `withCache` currently acts only as
      request de-duplication compatibility and does not serve stale data.
    */

    const totalRevenue    = totalRevenueResult[0]?.total || 0;
    const activePercentage =
      totalClients > 0 ? Math.round((activeClients / totalClients) * 100) : 0;

    // ─── Helper: calendar days remaining from today (positive = future) ───────
    // Returns 0 if endDate is today, 1 if tomorrow, -1 if yesterday, etc.
    const daysRemainingFromToday = (endDate: Date | string): number => {
      const d = new Date(endDate);
      d.setHours(0, 0, 0, 0);
      return Math.ceil((d.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
    };

    // ─── Helper: calendar days since expiry (positive = already expired) ──────
    // Returns 0 if expectedEndDate is today, 1 if yesterday, 2 if 2 days ago, etc.
    const expiredDaysFromToday = (endDate: Date | string): number => {
      const d = new Date(endDate);
      d.setHours(0, 0, 0, 0);
      return Math.round((startOfToday.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    };

    // ─── Build response ───────────────────────────────────────────────────────
    return {
      totalClients,
      activeClients,
      leadClients,
      inactiveClients,
      holdClients,
      clientsWithMealPlans,
      totalAppointments,
      todaysAppointments,
      confirmedAppointments,
      pendingAppointments,
      completedSessions,
      completionRate,
      activePercentage,

      recentClients: recentClients.map((client: any) => ({
        id:         client._id,
        name:       `${client.firstName} ${client.lastName}`,
        email:      client.email,
        phone:      client.phone,
        joinedDate: client.createdAt,
      })),

      todayCelebrations: todayCelebrations.map((c) => ({ ...c })),

      // Meal plans expiring today or in the next 3 days
      expiringMealPlans: expiringMealPlans.map((plan: any) => ({
        id:           plan._id,
        clientId:     plan.clientId?._id || plan.clientId,
        clientName:   plan.clientId
          ? `${plan.clientId.firstName} ${plan.clientId.lastName}`
          : 'Unknown Client',
        clientEmail:  plan.clientId?.email,
        clientPhone:  plan.clientId?.phone,
        mealPlanName: plan.name,
        endDate:      plan.endDate,
        startDate:    plan.startDate,
        status:       plan.status,
        daysRemaining: daysRemainingFromToday(plan.endDate),
      })),

      // FIX: Meal plans (from UnifiedPayment) that expired in the last 3 days OR today
      // NOTE: UnifiedPayment stores client ref as "client" field, not "clientId"
      expiredMealPlans: expiredMealPlans.map((plan: any) => {
        const days = expiredDaysFromToday(plan.expectedEndDate);
        // days = 0  → expires/expired today
        // days > 0  → already expired N days ago
        // days < 0  → should not happen given our query, but handle defensively
        return {
          id:           plan._id,
          clientId:     plan.client?._id   || plan.client,   // ← "client" field
          clientName:   plan.client
            ? `${plan.client.firstName} ${plan.client.lastName}`
            : 'Unknown Client',
          clientCode:   plan.client?.clientId,
          clientEmail:  plan.client?.email,
          clientPhone:  plan.client?.phone,
          clientAvatar: plan.client?.avatar,
          paymentId:    plan._id,
          expectedEndDate: plan.expectedEndDate,

          // Positive = days since expiry (0 = today)
          expiredDays: days,

          // Convenience flags
          isExpired:    days > 0,   // already in the past
          expiresToday: days === 0, // ends today
          upcoming:     days < 0,   // safety net; should never be true given the query

          // Human-readable label
          expiryStatus:
            days > 0
              ? `Expired ${days} day${days === 1 ? '' : 's'} ago`
              : days === 0
              ? 'Expires Today'
              : `Expires in ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`,
        };
      }),

      todayTasks: todaysTasks.map((task: any) => ({
        id:           task._id,
        clientId:     task.client?._id,
        clientName:   task.client
          ? `${task.client.firstName} ${task.client.lastName}`
          : 'Unknown Client',
        clientEmail:  task.client?.email,
        clientPhone:  task.client?.phone,
        title:        task.title || task.taskType,
        taskType:     task.taskType,
        allottedTime: task.allottedTime,
        status:       task.status,
        startDate:    task.startDate,
        endDate:      task.endDate,
      })),

      todaysSchedule: todaysSchedule.map((appt: any) => ({
        id: appt._id,
        time: new Date(appt.scheduledAt).toLocaleTimeString('en-US', {
          hour:   'numeric',
          minute: '2-digit',
          hour12: true,
        }),
        clientName: appt.client
          ? `${appt.client.firstName} ${appt.client.lastName}`
          : 'Unknown Client',
        clientEmail: appt.client?.email,
        status:      appt.status,
        type:        appt.type || 'Consultation',
      })),

      totalRevenue,
      pendingPaymentsCount,
      completedPaymentsCount,
      recentPayments: recentPayments.map((payment: any) => ({
        id:          payment._id,
        clientName:  payment.client
          ? `${payment.client.firstName} ${payment.client.lastName}`
          : 'Unknown Client',
        clientEmail:   payment.client?.email,
        clientPhone:   payment.client?.phone,
        amount:        payment.amount,
        currency:      payment.currency || 'INR',
        status:        payment.status,
        planName:      payment.planName      || 'N/A',
        planCategory:  payment.planCategory,
        durationDays:  payment.durationDays,
        durationLabel: payment.durationLabel,
        transactionId: payment.transactionId,
        createdAt:     payment.createdAt,
      })),
    };

}
