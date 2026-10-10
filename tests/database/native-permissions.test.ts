import type * as MongoTypes from '@/lib/db/mongo-types';
import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {updateNativePermissions,nativePermissionView} from '@/lib/db/repository/native-permissions';
import {checkPermission,getUserPermissions} from '@/lib/permissions/check';
import {PermissionKey} from '@/types/permissions';
import {UserRole} from '@/types';
jest.mock('@/lib/auth/config',()=>({authOptions:{}}));
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native permission rules',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:MongoTypes.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 const id=()=>randomBytes(12).toString('hex');
 async function put(collection:string,data:Record<string,unknown>){const ref=db.collection(collection).doc(id());refs.push(ref);await ref.set(data);return ref;}
 it('honors deny before allow and applies revocations without a stale permission cache',async()=>{
  const user=id(),key='test_'+id() as PermissionKey;
  const permission=await put('permissions',{key,isActive:true,allowedRoles:['dietitian'],allowedUsers:[user],deniedUsers:[user]});
  expect((await checkPermission(user,UserRole.DIETITIAN,key)).hasPermission).toBe(false);
  await updateNativePermissions(db,[{permissionId:permission.id,deniedUsers:[]}]);expect((await checkPermission(user,UserRole.DIETITIAN,key)).hasPermission).toBe(true);
  await updateNativePermissions(db,[{permissionId:permission.id,isActive:false}]);expect((await checkPermission(user,UserRole.DIETITIAN,key)).hasPermission).toBe(false);
 });
 it('fails closed on duplicate keys and never exposes user credentials',async()=>{
  const key='test_'+id() as PermissionKey,user=await put('users',{firstName:'Synthetic',role:'dietitian',password:'secret'});
  const a=await put('permissions',{key,isActive:true,allowedUsers:[user.id],deniedUsers:[],allowedRoles:[]});
  await put('permissions',{key,isActive:true,allowedUsers:[],deniedUsers:[user.id],allowedRoles:[]});
  expect((await checkPermission(user.id,UserRole.DIETITIAN,key)).hasPermission).toBe(false);
  expect(await getUserPermissions(user.id,UserRole.DIETITIAN)).not.toContain(key);
  const [view]=await nativePermissionView(db,[await a.get()]);expect(view.allowedUsers[0].password).toBeUndefined();
 });
 it('validates an entire bulk request before writing any permission',async()=>{
  const ref=await put('permissions',{isActive:true});
  await expect(updateNativePermissions(db,[{permissionId:ref.id,isActive:false},{permissionId:id(),allowedRoles:['superuser']}])).rejects.toThrow('Invalid');
  expect((await ref.get()).get('isActive')).toBe(true);
 });
});
