import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {mutateStaffTask,readStaffTasks} from '@/lib/db/repository/native-staff-tasks';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native staff tasks',()=>{let db:ReturnType<typeof getNativeDatabase>;beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{await db.terminate();});const id=()=>randomBytes(12).toString('hex');
 it('prevents early client completion, foreign task access and duplicate creation',async()=>{
  const staff=id(),client=id(),other=id();await db.collection('users').doc(staff).set({role:'dietitian',status:'active'});await db.collection('users').doc(client).set({role:'client',status:'active',assignedDietitian:staff});await db.collection('users').doc(other).set({role:'client',status:'active',assignedDietitian:staff});
  const input={taskType:'General Followup',startDate:'2099-01-01',endDate:'2099-01-01',operationId:id()},[a,b]=await Promise.all([mutateStaffTask(db,staff,client,input),mutateStaffTask(db,staff,client,input)]);expect(a!._id).toBe(b!._id);
  await expect(mutateStaffTask(db,client,client,{status:'completed'},a!._id)).rejects.toMatchObject({status:400});await expect(readStaffTasks(db,staff,other,new URLSearchParams(),a!._id)).rejects.toMatchObject({status:404});
  await mutateStaffTask(db,staff,client,{description:'Changed'},a!._id);const changed=await readStaffTasks(db,staff,client,new URLSearchParams(),a!._id);expect(changed.task).toMatchObject({description:'Changed',status:'pending'});
  await db.collection('users').doc(client).update({assignedDietitian:other});await expect(mutateStaffTask(db,staff,client,{},a!._id,true)).rejects.toMatchObject({status:403});
 });});
