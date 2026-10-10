import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {mutateStaffTemplate,readStaffTemplate,listStaffTemplates} from '@/lib/db/repository/native-staff-templates';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native staff templates',()=>{
 let db:ReturnType<typeof getNativeDatabase>;beforeAll(async()=>{db=getNativeDatabase();await db.collection('_nativeCounters').doc('dietTemplateIds').set({seq:1000});await db.collection('_nativeCounters').doc('mealPlanTemplateIds').set({seq:1000});});afterAll(async()=>{await db.terminate();});const id=()=>randomBytes(12).toString('hex');
 it('preserves partial updates, restricts private data and makes archive recoverable',async()=>{
  const owner=id(),other=id(),admin=id();for(const [uid,role] of [[owner,'dietitian'],[other,'dietitian'],[admin,'admin']])await db.collection('users').doc(uid).set({role,status:'active'});
  const created=await mutateStaffTemplate(db,'diettemplates',owner,{name:id(),description:'Keep me',category:'custom',duration:10,isPublic:false});
  await expect(readStaffTemplate(db,'diettemplates',created._id,null)).rejects.toMatchObject({status:404});
  const updated=await mutateStaffTemplate(db,'diettemplates',owner,{name:'Updated'},created._id);expect(updated.description).toBe('Keep me');expect(updated.duration).toBe(10);
  await expect(mutateStaffTemplate(db,'diettemplates',other,{name:'Denied'},created._id)).rejects.toMatchObject({status:403});
  await mutateStaffTemplate(db,'diettemplates',owner,{},created._id,'delete');expect((await db.collection('diettemplates').doc(created._id).get()).exists).toBe(true);
  await expect(mutateStaffTemplate(db,'diettemplates',owner,{},created._id,'restore')).rejects.toMatchObject({status:403});await mutateStaffTemplate(db,'diettemplates',admin,{},created._id,'restore');expect((await readStaffTemplate(db,'diettemplates',created._id,{id:owner,role:'dietitian'})).isActive).toBe(true);
 });
 it('does not allow query parameters to expose private templates anonymously',async()=>{
  const owner=id();await db.collection('users').doc(owner).set({role:'dietitian',status:'active'});const created=await mutateStaffTemplate(db,'mealplantemplates',owner,{name:id(),category:'custom',duration:3,isPublic:false});
  const response=await listStaffTemplates(db,'mealplantemplates',null,new URLSearchParams({createdBy:owner,isPublic:'false'}));expect(response.templates.map(t=>t._id)).not.toContain(created._id);
 });
 it('coalesces summary enrichment without caching authorization or hiding template edits',async()=>{
  const owner=id();await db.collection('users').doc(owner).set({role:'dietitian',status:'active'});
  const created=await mutateStaffTemplate(db,'diettemplates',owner,{name:id(),category:'custom',duration:10,isPublic:false});
  const params=new URLSearchParams({summary:'true',search:created.name});
  const reads=jest.spyOn(db,'getAll');
  try{
   const [first,second]=await Promise.all([listStaffTemplates(db,'diettemplates',{id:owner,role:'dietitian'},params),listStaffTemplates(db,'diettemplates',{id:owner,role:'dietitian'},params)]);
   expect(reads.mock.calls.filter(call=>(call.at(-1) as any)?.fieldMask?.join(',')==='firstName,lastName,role')).toHaveLength(1);expect(first.templates).toEqual(second.templates);
   first.templates[0].name='Caller mutation';expect(second.templates[0].name).toBe(created.name);
   await mutateStaffTemplate(db,'diettemplates',owner,{description:'Fresh edit'},created._id);reads.mockClear();
   expect((await listStaffTemplates(db,'diettemplates',{id:owner,role:'dietitian'},params)).templates[0].description).toBe('Fresh edit');expect(reads.mock.calls.filter(call=>(call.at(-1) as any)?.fieldMask?.join(',')==='firstName,lastName,role')).toHaveLength(1);
   await db.collection('users').doc(owner).update({status:'suspended'});
   await expect(listStaffTemplates(db,'diettemplates',{id:owner,role:'dietitian'},params)).rejects.toMatchObject({status:401});
  }finally{reads.mockRestore();}
 });

 it('restores the shared staff plan library, including legacy types, without exposing it to clients',async()=>{
  const owner=id(),reader=id(),legacy=id();for(const uid of [owner,reader])await db.collection('users').doc(uid).set({role:'dietitian',status:'active'});
  const template=await mutateStaffTemplate(db,'mealplantemplates',owner,{name:id(),category:'custom',duration:10,isPublic:false});
  await db.collection('mealplantemplates').doc(legacy).set({name:'Legacy',createdBy:owner,isActive:true,isPublic:false});
  const params=new URLSearchParams({templateType:'plan',limit:'1000',summary:'true'});
  const result=await listStaffTemplates(db,'mealplantemplates',{id:reader,role:'dietitian'},params);
  expect(result.templates.map(t=>t._id)).toEqual(expect.arrayContaining([template._id,legacy]));
  expect((await listStaffTemplates(db,'mealplantemplates',null,params)).templates.map(t=>t._id)).not.toEqual(expect.arrayContaining([template._id,legacy]));
  await expect(mutateStaffTemplate(db,'mealplantemplates',reader,{name:'Denied'},template._id)).rejects.toMatchObject({status:403});
 });

});
