import type * as MongoTypes from '@/lib/db/mongo-types';
import { randomUUID } from 'node:crypto';
import { getNativeDatabase } from '@/lib/db/database';
import { recalculateNativeClientStatus, nativeClientStatusInfo } from '@/lib/db/repository/native-client-status';
import { ClientStatus } from '@/types';
const suite = process.env.DTPS_MONGODB_LOCAL_TEST ? describe : describe.skip;
suite('native subscription status', () => {
  let db: ReturnType<typeof getNativeDatabase>;
  const refs: MongoTypes.DocumentReference[] = [];
  beforeAll(() => { db = getNativeDatabase(); });
  afterAll(async () => { for (const ref of refs) await ref.delete(); await db.terminate(); });
  async function put(collection: string, data: MongoTypes.DocumentData) {
    const ref = db.collection(collection).doc(randomUUID()); refs.push(ref); await ref.set(data); return ref;
  }
  it('uses subscription expiry, excludes deleted phases, and writes one audit under concurrency', async () => {
    const client = await put('users', {clientStatus:ClientStatus.LEAD});
    const future = new Date(Date.now()+86400000*30);
    const purchase = await put('unifiedpayments', {client:client.id,status:'paid',expectedEndDate:future});
    await put('clientmealplans', {clientId:client.id,status:'active',isDeleted:true,endDate:future});
    await Promise.all([recalculateNativeClientStatus(db,client.id),recalculateNativeClientStatus(db,client.id)]);
    expect((await client.get()).get('clientStatusHistory')).toHaveLength(1);
    expect(await nativeClientStatusInfo(db,client.id)).toMatchObject({clientStatus:ClientStatus.ACTIVE,hasActivePlan:false});
    await purchase.update({expectedEndDate:new Date(0)});
    expect(await recalculateNativeClientStatus(db,client.id)).toBe(ClientStatus.INACTIVE);
    await client.update({holdStatus:{isOnHold:true}});
    expect(await recalculateNativeClientStatus(db,client.id)).toBe(ClientStatus.HOLD);
  });
  it('does not activate an unpaid client because a future phase exists', async () => {
    const client = await put('users', {clientStatus:ClientStatus.LEAD});
    await put('unifiedpayments',{client:client.id,status:'pending',expectedEndDate:new Date(Date.now()+86400000)});
    await put('clientmealplans',{clientId:client.id,status:'active',endDate:new Date(Date.now()+86400000)});
    expect(await nativeClientStatusInfo(db,client.id)).toMatchObject({clientStatus:ClientStatus.LEAD,hasActivePlan:true});
  });
});
