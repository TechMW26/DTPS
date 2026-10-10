import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {saveStaffRecipe,readStaffRecipe} from '@/lib/db/repository/native-staff-recipes';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('native recipe mutations',()=>{let db:ReturnType<typeof getNativeDatabase>;beforeAll(()=>{db=getNativeDatabase();});afterAll(async()=>{await db.terminate();});const id=()=>randomBytes(12).toString('hex');
 it('serializes identical creates, preserves ownership and hides archives from clients',async()=>{
  const staff=id(),client=id();await db.collection('users').doc(staff).set({role:'dietitian',status:'active'});await db.collection('users').doc(client).set({role:'client',status:'active'});await db.collection('_nativeCounters').doc('recipeIds').set({seq:10000});
  const input={name:id(),ingredients:[{name:'Rice',quantity:1,unit:'cup'}],instructions:['Cook rice'],prepTime:5,cookTime:20,servings:1,nutrition:{calories:100,protein:5,carbs:20,fat:2},isActive:false};const results=await Promise.allSettled([saveStaffRecipe(db,staff,input),saveStaffRecipe(db,staff,input)]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.find(r=>r.status==='rejected')).toMatchObject({reason:{status:409}});
  const recipe=(results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<any>).value;const updated=await saveStaffRecipe(db,staff,{description:'Changed',createdBy:client},recipe._id);expect(updated.description).toBe('Changed');expect(updated.createdBy._id).toBe(staff);expect(updated.flatNutrition.calories).toBe(100);await expect(readStaffRecipe(db,client,recipe._id)).rejects.toMatchObject({status:404});await saveStaffRecipe(db,staff,{},recipe._id,true);expect((await db.collection('recipes').doc(recipe._id).get()).exists).toBe(true);
 });});
