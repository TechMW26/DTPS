import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '@/lib/db/models/User';
import { registerFCMToken } from '@/lib/firebase/firebaseNotification';
jest.mock('@/lib/db/connection',()=>({__esModule:true,default:async()=>undefined}));
jest.mock('@/lib/firebase/firebaseAdmin',()=>({getMessaging:jest.fn(),getNativeMessaging:jest.fn()}));
let server:MongoMemoryServer;
beforeAll(async()=>{server=await MongoMemoryServer.create();await mongoose.connect(server.getUri(),{autoIndex:false});});
afterAll(async()=>{await mongoose.disconnect();await server.stop();});
it('moves a token between accounts without rewriting unrelated user records',async()=>{
  const [owner,previous,unrelated]=Array.from({length:3},()=>new mongoose.Types.ObjectId());
  const unchangedAt=new Date('2025-01-01');
  await User.collection.insertMany([
    {_id:owner,fcmTokens:[],updatedAt:unchangedAt},
    {_id:previous,fcmTokens:[{token:'synthetic-token'}],updatedAt:unchangedAt},
    {_id:unrelated,fcmTokens:[{token:'other-token'}],updatedAt:unchangedAt},
  ] as any);
  expect((await registerFCMToken(String(owner),'synthetic-token')).success).toBe(true);
  expect((await User.collection.findOne({_id:previous}))!.fcmTokens).toHaveLength(0);
  expect((await User.collection.findOne({_id:owner}))!.fcmTokens).toHaveLength(1);
  expect((await User.collection.findOne({_id:unrelated}))!.updatedAt).toEqual(unchangedAt);
  await registerFCMToken(String(owner),'synthetic-token');
  expect((await User.collection.findOne({_id:owner}))!.fcmTokens).toHaveLength(1);
  expect((await User.collection.findOne({_id:unrelated}))!.updatedAt).toEqual(unchangedAt);
});
