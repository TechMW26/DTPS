import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {cleanupNativeTransientDocuments} from '@/lib/realtime/native-expiry';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native transient retention',()=>{it('deletes expired events but preserves renewed leases',async()=>{const db=getNativeDatabase(),prefix=randomBytes(12).toString('hex'),past=db.collection('_nativeRealtimeEvents').doc(prefix),future=db.collection('_nativePresence').doc(prefix);try{await past.set({expiresAt:new Date(Date.now()-1000)});await future.set({expiresAt:new Date(Date.now()+60000)});const summary=await cleanupNativeTransientDocuments(db);expect(summary._nativeRealtimeEvents).toBeGreaterThanOrEqual(1);expect((await past.get()).exists).toBe(false);expect((await future.get()).exists).toBe(true);}finally{await past.delete();await future.delete();await db.terminate();}});});
