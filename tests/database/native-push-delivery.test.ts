import {randomBytes,createHash} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {sendNotificationToUser} from '@/lib/firebase/firebaseNotification';
import {getMessaging,getNativeMessaging} from '@/lib/firebase/firebaseAdmin';
jest.mock('@/lib/firebase/firebaseAdmin',()=>({getMessaging:jest.fn(),getNativeMessaging:jest.fn()}));
jest.mock('@/lib/db/database',()=>({getNativeDatabase:jest.fn()}));
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native push delivery with mocked providers',()=>{
 let db:any,user:any;const primary=jest.fn(),secondary=jest.fn(),token='synthetic-device-token',payload={title:'Synthetic reminder',body:'Synthetic content',clickAction:'/user/plan'};
 beforeAll(()=>{db=jest.requireActual('@/lib/db/database').getNativeDatabase();jest.mocked(getNativeDatabase).mockReturnValue(db);});
 beforeEach(async()=>{user=db.collection('users').doc(randomBytes(12).toString('hex'));await user.set({role:'client',fcmTokens:[{token,deviceType:'android'}]});primary.mockReset().mockResolvedValue('mock-message');secondary.mockReset().mockResolvedValue('mock-fallback');jest.mocked(getMessaging).mockResolvedValue({send:primary} as any);jest.mocked(getNativeMessaging).mockReset().mockResolvedValue({send:secondary} as any);jest.replaceProperty(process.env,'NODE_ENV','production');});
 afterEach(async()=>{jest.restoreAllMocks();await user.delete();for(const row of(await db.collection('notifications').where('userId','==',user.id).get()).docs)await row.ref.delete();await db.collection('_nativeFcmTokens').doc(createHash('sha256').update(token).digest('hex')).delete();});afterAll(async()=>{await db.terminate();});
 it('falls back only for sender mismatch and persists one inbox entry',async()=>{primary.mockRejectedValue({code:'messaging/mismatched-credential'});expect((await sendNotificationToUser(user.id,payload)).successCount).toBe(1);expect(secondary).toHaveBeenCalledTimes(1);expect(secondary.mock.calls[0][0]).toMatchObject({token,android:{notification:{channelId:'dtps_notifications'}}});expect((await db.collection('notifications').where('userId','==',user.id).get()).size).toBe(1);expect((await user.get()).get('fcmTokens')).toHaveLength(1);});
 it('does not retry acknowledged primary delivery',async()=>{expect((await sendNotificationToUser(user.id,payload)).successCount).toBe(1);expect(getNativeMessaging).not.toHaveBeenCalled();});
 it.each(['messaging/invalid-argument','messaging/mismatched-credential'])('retains device registration after %s',async code=>{primary.mockRejectedValue({code});jest.mocked(getNativeMessaging).mockResolvedValue(null);expect((await sendNotificationToUser(user.id,payload)).failureCount).toBe(1);expect((await user.get()).get('fcmTokens')).toHaveLength(1);});
 it('removes definitively unregistered tokens',async()=>{primary.mockRejectedValue({code:'messaging/registration-token-not-registered'});await sendNotificationToUser(user.id,payload);expect((await user.get()).get('fcmTokens')).toHaveLength(0);});
});
