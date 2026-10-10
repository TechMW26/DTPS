import {randomUUID} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {nativePasswordLogin,nativeOtpLogin,nativeSessionStatus,recordNativeLogin,saveNativeCalendarCredentials} from '@/lib/db/repository/native-auth';
import {hasPublishedMealPlan,grantDietPlanAccessIfPublished} from '@/lib/auth/onboarding-access';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native authentication and onboarding',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});
 afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 async function put(collection:string,data:FirebaseFirestore.DocumentData){const ref=db.collection(collection).doc(randomUUID());refs.push(ref);await ref.set(data);return ref;}
 it('authenticates the correct login context and denies missing, duplicate and disabled accounts',async()=>{
  const email=randomUUID()+'@example.invalid';const ref=await put('users',{email,password:'synthetic',role:'client',status:'active'});
  expect(await nativePasswordLogin(db,email,'synthetic','staff')).toBeNull();
  expect(await nativePasswordLogin(db,email,'wrong','client')).toBeNull();
  const user=await nativePasswordLogin(db,email,'synthetic','client');expect(user?._id).toBe(ref.id);expect(user).not.toHaveProperty('password');
  expect(await nativeOtpLogin(db,ref.id,'staff')).toBeNull();
  expect(await nativeOtpLogin(db,ref.id,'client')).toMatchObject({_id:ref.id});
  const second=await put('users',{email,password:'synthetic',role:'client',status:'active'});
  expect(await nativePasswordLogin(db,email,'synthetic','client')).toBeNull();await second.delete();
  await ref.update({status:'suspended'});expect(await nativePasswordLogin(db,email,'synthetic','client')).toBeNull();expect(await nativeOtpLogin(db,ref.id,'client')).toBeNull();
  expect(await nativeSessionStatus(db,'missing')).toBeNull();
 });
 it('does not allow commerce fallback to bypass a disabled primary account',async()=>{
  const email=randomUUID()+'@example.invalid';await put('woocommerceclients',{email,password:'synthetic',name:'Test Client'});
  expect(await nativePasswordLogin(db,email,'synthetic','staff')).toBeNull();
  expect(await nativePasswordLogin(db,email,'synthetic','client')).toMatchObject({isWooCommerceClient:true,role:'client'});
  await put('users',{email,password:'synthetic',role:'client',status:'inactive'});
  expect(await nativePasswordLogin(db,email,'synthetic','client')).toBeNull();
 });
 it('only grants onboarding access for a published, non-deleted plan',async()=>{
  const user=await put('users',{role:'client',status:'active'});const plan=await put('clientmealplans',{clientId:user.id,status:'draft'});
  expect(await hasPublishedMealPlan(user.id)).toBe(false);
  await plan.update({status:'active',isDeleted:true});expect(await grantDietPlanAccessIfPublished(user.id)).toBe(false);
  await plan.update({isDeleted:false});expect(await grantDietPlanAccessIfPublished(user.id)).toBe(true);expect((await user.get()).get('onboardingCompleted')).toBe(true);
 });
 it('preserves calendar refresh tokens and exposes only session revocation fields',async()=>{
  const ref=await put('users',{status:'active',googleCalendarRefreshToken:'synthetic-refresh'});
  await saveNativeCalendarCredentials(db,ref.id,{access_token:'synthetic-access'});
  expect((await ref.get()).get('googleCalendarRefreshToken')).toBe('synthetic-refresh');
  const status=await nativeSessionStatus(db,ref.id);expect(status).not.toHaveProperty('googleCalendarRefreshToken');
  await ref.update({logoutOtherSessionsAt:new Date('2026-01-01'),keepCurrentSessionId:'fixture'});
  expect((await nativeSessionStatus(db,ref.id))?.logoutOtherSessionsAt).toEqual(new Date('2026-01-01'));
 });
 it('records login history without undefined fields or a Mongo runtime',async()=>{
  const userId=randomUUID();await recordNativeLogin(db,{userId,userRole:'client',category:'auth',action:'Logged In',actionType:'login',description:'Synthetic test',ipAddress:undefined});
  const logs=await db.collection('activitylogs').where('userId','==',userId).get();expect(logs.size).toBe(1);refs.push(logs.docs[0].ref);expect(logs.docs[0].id).toMatch(/^[a-f0-9]{24}$/);expect(logs.docs[0].get('createdAt')).toBeDefined();
 });
});
