import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/firestore-native';
import {mutateEcommerceContent,readEcommerceContent} from '@/lib/db/repository/native-ecommerce-content';
const suite=process.env.FIRESTORE_EMULATOR_HOST?describe:describe.skip;
suite('native ecommerce content',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const refs:FirebaseFirestore.DocumentReference[]=[];
 beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{for(const ref of refs)await ref.delete();await db.terminate();});
 it('validates server-owned fields, public visibility, and current admin rights',async()=>{
  const actor=db.collection('users').doc(randomBytes(12).toString('hex'));refs.push(actor);await actor.set({role:'admin',status:'active'});
  const result=await mutateEcommerceContent(db,'plans',actor.id,{name:'Synthetic native plan',price:100,isActive:false,createdBy:'forged',raw:{secret:'hidden'}});
  const plan=(result as any).plan,ref=db.collection('ecommerceplan').doc(plan._id);refs.push(ref,db.collection('_nativeDeletedContent').doc('ecommerceplan-'+plan._id));
  expect(plan.createdBy).toBe(actor.id);expect(plan.raw).toBeUndefined();
  await expect(readEcommerceContent(db,'plans',new URLSearchParams(),true,plan._id)).rejects.toThrow('Not found');
  await mutateEcommerceContent(db,'plans',actor.id,{isActive:true},plan._id);
  const visible:any=await readEcommerceContent(db,'plans',new URLSearchParams(),true,plan._id);expect(visible.plan.createdBy).toBeUndefined();
  await actor.update({role:'client'});await expect(mutateEcommerceContent(db,'plans',actor.id,{price:0},plan._id)).rejects.toThrow('Forbidden');
  await actor.update({role:'admin'});await mutateEcommerceContent(db,'plans',actor.id,{},plan._id,true);
  expect((await ref.get()).exists).toBe(false);expect((await refs[2].get()).get('name')).toBe('Synthetic native plan');
 });
});
