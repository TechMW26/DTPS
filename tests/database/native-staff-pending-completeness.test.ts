import type * as MongoTypes from '@/lib/db/mongo-types';
import {randomBytes} from 'node:crypto';
import {NextRequest} from 'next/server';
import {getServerSession} from 'next-auth';
import {getNativeDatabase} from '@/lib/db/database';
jest.mock('next-auth',()=>({getServerSession:jest.fn()}));
jest.mock('@/lib/auth/config',()=>({authOptions:{}}));
let db:ReturnType<typeof getNativeDatabase>;const refs:MongoTypes.DocumentReference[]=[];
const entityId=(row:any)=>row._id;
async function put(collection:string,data:any){const ref=db.collection(collection).doc(randomBytes(12).toString('hex'));refs.push(ref);await ref.set({...data,createdAt:new Date()});return {...data,_id:ref.id};}
async function createAssignedDietitianClientPair(){const dietitian=await put('users',{role:'dietitian',status:'active'}),client=await put('users',{role:'client',status:'active',assignedDietitian:dietitian._id});return {dietitian,client};}
async function invokeRoute(handler:any,options:any){(getServerSession as jest.Mock).mockResolvedValue({user:{...options.user,id:options.user._id}});const response=await handler(new NextRequest(options.url));return {status:response.status,json:await response.json(),cacheControl:response.headers.get('cache-control')};}
(process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip)("pending plans completeness", () => {
  beforeAll(()=>{db=getNativeDatabase();});
  afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});

  it("includes assigned inactive clients with paid allocations still needing a plan", async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    await db.collection('users').doc(client._id).update({status:'inactive'});

    await put('unifiedpayments',{
      client: client._id,
      dietitian: dietitian._id,
      planName: "Completed Payment Allocation",
      durationDays: 30,
      durationLabel: "30 Days",
      status: "completed",
      paymentStatus: "paid",
      daysUsed: 0,
      mealPlanCreated: false,
    });

    const route = await import("@/app/api/dashboard/pending-plans/route");
    const result = await invokeRoute(route.GET, {
      method: "GET",
      url: "http://localhost/api/dashboard/pending-plans",
      user: dietitian,
    });

    expect(result.status).toBe(200);
    expect(result.json.pendingPlans).toEqual([
      expect.objectContaining({
        clientId: entityId(client),
        purchasedPlanName: "Completed Payment Allocation",
        pendingDaysToCreate: 30,
        reason: "no_meal_plan",
      }),
    ]);
  });

  it("keeps overdue clients pending after a completed phase has been overdue for more than thirty days", async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const relativeDate = (days: number) => new Date(today.getTime() + days * 86_400_000);
    const purchase = await put('unifiedpayments',{
      client: client._id, dietitian: dietitian._id,
      planName: "Unfinished paid plan", durationDays: 90, durationLabel: "90 Days",
      status: "paid", paymentStatus: "paid", daysUsed: 14, remainingDays: 76,
      mealPlanCreated: true, expectedStartDate: relativeDate(-53), expectedEndDate: relativeDate(37),
    });
    await put('clientmealplans',{
      clientId: client._id, dietitianId: dietitian._id, purchaseId: purchase._id,
      name: "Previous phase", startDate: relativeDate(-53), endDate: relativeDate(-40),
      duration: 14, status: "completed", meals: [], goals: { primaryGoal: "weight-loss" },
    });
    const route = await import("@/app/api/dashboard/pending-plans/route");
    const result = await invokeRoute(route.GET, {
      method: "GET", url: "http://localhost/api/dashboard/pending-plans", user: dietitian,
    });
    expect(result.status).toBe(200);
    expect(result.json.pendingPlans).toEqual([expect.objectContaining({
      clientId: entityId(client), pendingDaysToCreate: 76, urgency: "critical",
    })]);
  });

  it("does not treat an expired purchase counter as pending plan work", async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();

    await put('unifiedpayments',{
      client: client._id,
      dietitian: dietitian._id,
      planName: "Expired Trial",
      durationDays: 10,
      durationLabel: "10 Days",
      status: "completed",
      paymentStatus: "paid",
      daysUsed: 0,
      mealPlanCreated: false,
      expectedStartDate: new Date("2026-06-01T00:00:00.000Z"),
      expectedEndDate: new Date("2026-06-10T00:00:00.000Z"),
    });

    const route = await import("@/app/api/dashboard/pending-plans/route");
    const result = await invokeRoute(route.GET, {
      method: "GET",
      url: "http://localhost/api/dashboard/pending-plans",
      user: dietitian,
    });

    expect(result.status).toBe(200);
    expect(result.json.pendingPlans).toEqual([]);
  });

  it("uses the authoritative counter when an imported entitlement has duplicate rows", async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const startDate = new Date("2099-07-15T00:00:00.000Z");
    const endDate = new Date("2099-10-25T00:00:00.000Z");
    const common = {
      client: client._id,
      dietitian: dietitian._id,
      planName: "Weight Loss",
      durationDays: 90,
      durationLabel: "3 Months",
      status: "paid",
      paymentStatus: "paid",
      startDate,
      endDate,
      expectedStartDate: startDate,
      expectedEndDate: endDate,
      finalAmount: 5000,
      amount: 5000,
    } as const;

    await put('unifiedpayments',{
      ...common,
      mealPlanCreated: true,
      daysUsed: 13,
      remainingDays: 77,
    });
    await put('unifiedpayments',{
      ...common,
      mealPlanCreated: false,
      daysUsed: 0,
      remainingDays: 90,
    });
    await put('unifiedpayments',{
      ...common,
      mealPlanCreated: true,
      daysUsed: 37,
      remainingDays: 53,
    });

    const route = await import("@/app/api/dashboard/pending-plans/route");
    const result = await invokeRoute(route.GET, {
      method: "GET",
      url: "http://localhost/api/dashboard/pending-plans",
      user: dietitian,
    });

    expect(result.status).toBe(200);
    expect(result.json.pendingPlans).toEqual([
      expect.objectContaining({
        clientId: entityId(client),
        totalMealPlanDays: 37,
        pendingDaysToCreate: 53,
      }),
    ]);
  });
  it("excludes clients whose upcoming phase has already been published", async () => {
    const { client, dietitian } = await createAssignedDietitianClientPair();
    const secondPair = await createAssignedDietitianClientPair();
    await db.collection('users').doc(secondPair.client._id).update({assignedDietitian:dietitian._id,assignedDietitians:[dietitian._id]});
    const tomorrow = new Date(Date.now() + 86_400_000);
    const purchaseFields = { dietitian: dietitian._id, planName: 'Pending priority',
      durationDays: 30, durationLabel: '30 Days', status: 'paid', paymentStatus: 'paid', daysUsed: 0 };
    await put('unifiedpayments',{ ...purchaseFields, client: client._id });
    const secondPurchase = await put('unifiedpayments',{ ...purchaseFields, client: secondPair.client._id });
    await put('clientmealplans',{
      clientId: secondPair.client._id, dietitianId: dietitian._id, purchaseId: secondPurchase._id,
      name: 'Upcoming phase', status: 'active', startDate: tomorrow,
      endDate: new Date(tomorrow.getTime() + 6 * 86_400_000), duration: 7, meals: [], goals: { primaryGoal: 'weight-loss' },
    });
    const route = await import("@/app/api/dashboard/pending-plans/route");
    const result = await invokeRoute(route.GET, { method: 'GET',
      url: 'http://localhost/api/dashboard/pending-plans', user: dietitian });
    expect(result.status).toBe(200);
    expect(result.json.pendingPlans).toHaveLength(1);
    expect(result.json.pendingPlans[0]).toMatchObject({ clientId: entityId(client), urgency: 'critical' });
    expect(result.json.pendingPlans.some((row:any)=>row.clientId===entityId(secondPair.client))).toBe(false);
  });

  it('removes resolved work on the next read without waiting for a cached dashboard', async () => {
    const {client,dietitian}=await createAssignedDietitianClientPair();
    const purchase=await put('unifiedpayments',{client:client._id,planName:'Published program',durationDays:90,status:'paid',daysUsed:0});
    const route=await import('@/app/api/dashboard/pending-plans/route');
    const read=()=>invokeRoute(route.GET,{url:'http://localhost/api/dashboard/pending-plans',user:dietitian});
    expect((await read()).json.pendingPlans).toHaveLength(1);
    await put('clientmealplans',{clientId:client._id,purchaseId:purchase._id,name:'Given phase',status:'active',startDate:new Date(Date.now()-86400000),endDate:new Date(Date.now()+14*86400000),duration:16});
    const result=await read();
    expect(result.json.pendingPlans).toEqual([]);
    expect(result.json.totalCount).toBe(0);
    expect(result.cacheControl).toBe('private, no-store, max-age=0');
  });

  it('keeps an ending phase pending until its next phase is published', async () => {
    const {client,dietitian}=await createAssignedDietitianClientPair();
    const purchase=await put('unifiedpayments',{client:client._id,planName:'Phased program',durationDays:90,status:'paid',daysUsed:0});
    await put('clientmealplans',{clientId:client._id,purchaseId:purchase._id,name:'Ending phase',status:'active',startDate:new Date(Date.now()-11*86400000),endDate:new Date(Date.now()+2*86400000),duration:14});
    const route=await import('@/app/api/dashboard/pending-plans/route');
    const read=()=>invokeRoute(route.GET,{url:'http://localhost/api/dashboard/pending-plans',user:dietitian});
    const pending=await read();
    expect(pending.json.pendingPlans).toEqual([expect.objectContaining({reason:'current_ending_soon',currentPlanRemainingDays:2,totalMealPlanDays:14,pendingDaysToCreate:76,planNeededDate:expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)})]);
    await put('clientmealplans',{clientId:client._id,purchaseId:purchase._id,name:'Next given phase',status:'active',startDate:new Date(Date.now()+3*86400000),endDate:new Date(Date.now()+16*86400000),duration:14});
    expect((await read()).json.pendingPlans).toEqual([]);
  });

  it('does not let draft, cancelled, deleted or paused phases resolve missing work', async () => {
    const {client,dietitian}=await createAssignedDietitianClientPair();
    const purchase=await put('unifiedpayments',{client:client._id,planName:'Unresolved program',durationDays:90,status:'paid',daysUsed:0});
    for(const fields of [{status:'draft'},{status:'cancelled'},{status:'active',isDeleted:true},{status:'paused'}]){
      await put('clientmealplans',{...fields,clientId:client._id,purchaseId:purchase._id,name:'Not delivered',startDate:new Date(Date.now()+86400000),endDate:new Date(Date.now()+14*86400000),duration:14});
    }
    const route=await import('@/app/api/dashboard/pending-plans/route');
    const result=await invokeRoute(route.GET,{url:'http://localhost/api/dashboard/pending-plans',user:dietitian});
    expect(result.json.pendingPlans).toHaveLength(1);
    expect(result.json.pendingPlans[0]).toMatchObject({clientId:client._id,hasNextPhase:false});
  });

  it('excludes a fully allocated purchase even if its saved counter is stale', async () => {
    const {client,dietitian}=await createAssignedDietitianClientPair();
    const purchase=await put('unifiedpayments',{client:client._id,planName:'Finished program',durationDays:14,status:'paid',daysUsed:0});
    await put('clientmealplans',{clientId:client._id,purchaseId:purchase._id,name:'Delivered',status:'completed',startDate:new Date(Date.now()-20*86400000),endDate:new Date(Date.now()-7*86400000),duration:14});
    const route=await import('@/app/api/dashboard/pending-plans/route');
    const result=await invokeRoute(route.GET,{url:'http://localhost/api/dashboard/pending-plans',user:dietitian});
    expect(result.json.pendingPlans).toEqual([]);
  });

  it('does not allocate old purchase phases to a separate renewal', async () => {
    const {client,dietitian}=await createAssignedDietitianClientPair();
    const old=await put('unifiedpayments',{client:client._id,planName:'Old program',durationDays:30,status:'paid',daysUsed:30,expectedEndDate:new Date(Date.now()-86400000)});
    await put('clientmealplans',{clientId:client._id,purchaseId:old._id,name:'Old delivered',status:'completed',startDate:new Date(Date.now()-40*86400000),endDate:new Date(Date.now()-11*86400000),duration:30});
    await put('unifiedpayments',{client:client._id,planName:'New renewal',durationDays:30,status:'paid',daysUsed:0,expectedStartDate:new Date(),expectedEndDate:new Date(Date.now()+30*86400000)});
    const route=await import('@/app/api/dashboard/pending-plans/route');
    const result=await invokeRoute(route.GET,{url:'http://localhost/api/dashboard/pending-plans',user:dietitian});
    expect(result.json.pendingPlans).toEqual([expect.objectContaining({purchasedPlanName:'New renewal',totalMealPlanDays:0,pendingDaysToCreate:30})]);
  });

  it('does not show a purchased program with no days left and no surviving phase', async () => {
    const {client,dietitian}=await createAssignedDietitianClientPair();
    await put('unifiedpayments',{client:client._id,planName:'Allocated program',durationDays:30,status:'paid',daysUsed:30});
    const route=await import('@/app/api/dashboard/pending-plans/route');
    const result=await invokeRoute(route.GET,{url:'http://localhost/api/dashboard/pending-plans',user:dietitian});
    expect(result.json.pendingPlans).toEqual([]);
  });

});
