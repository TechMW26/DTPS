import {seedRecipeAdminIndex} from '@/lib/db/repository/native-recipe-admin-index';
import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {saveStaffRecipe,listStaffRecipes,readStaffRecipe} from '@/lib/db/repository/native-staff-recipes';
import {mutateStaffTemplate,readStaffTemplate,listStaffTemplates} from '@/lib/db/repository/native-staff-templates';
import {getStrictRecipeFingerprint} from '@/lib/recipe-quality';
const suite=process.env.DTPS_MONGODB_LOCAL_TEST?describe:describe.skip;
suite('ported recipe quality, pagination and template regressions',()=>{
 let db:ReturnType<typeof getNativeDatabase>;const id=()=>randomBytes(12).toString('hex');
 beforeAll(async()=>{db=getNativeDatabase();await db.collection('_nativeCounters').doc('recipeIds').set({seq:10000});await db.collection('_nativeCounters').doc('dietTemplateIds').set({seq:10000});});afterAll(()=>db.terminate());
 async function actor(){const key=id();await db.collection('users').doc(key).set({role:'dietitian',status:'active'});return key;}
 const recipe=(name:string)=>({name,ingredients:[{name:'Rice',quantity:1,unit:'cup'}],instructions:['Cook'],prepTime:5,cookTime:10,servings:1,isActive:true});
 it('rejects incomplete publication and partial blanking but allows a draft',async()=>{
  const user=await actor();await expect(saveStaffRecipe(db,user,{...recipe(id()),ingredients:[],instructions:[]})).rejects.toMatchObject({status:400});
  const draft=await saveStaffRecipe(db,user,{...recipe(id()),ingredients:[],instructions:[],isActive:false});expect(draft.isActive).toBe(false);
  const published=await saveStaffRecipe(db,user,recipe(id()));await expect(saveStaffRecipe(db,user,{ingredients:[],instructions:[]},published._id)).rejects.toMatchObject({status:400});
  expect((await readStaffRecipe(db,user,published._id)).ingredients).toHaveLength(1);
 });
 it('invalidates cached recipe summaries after edits and rechecks suspended actors',async()=>{
  const user=await actor(),term=id(),saved=await saveStaffRecipe(db,user,recipe(term));
  const params=new URLSearchParams({summary:'true',search:term,includeTotal:'true'});
  expect((await listStaffRecipes(db,user,params)).recipes[0].name).toBe(term);
  await saveStaffRecipe(db,user,{name:term+' updated'},saved._id);
  expect((await listStaffRecipes(db,user,params)).recipes[0].name).toBe(term+' updated');
  await db.collection('users').doc(user).update({status:'suspended'});
  await expect(listStaffRecipes(db,user,params)).rejects.toMatchObject({status:401});
 });
 it('uses stable numeric UUID ordering across page boundaries',async()=>{
  const user=await actor(),term=id(),rows=[];
  for(const uuid of ['100','2','10','abc','12abc','002','-3',' +5']){const key=id();await db.collection('recipes').doc(key).set({...recipe(term+' '+uuid),uuid,createdBy:user,createdAt:new Date(),isActive:true});rows.push({id:key,uuid});}
  const sorted=[...rows].sort((a,b)=>(parseInt(a.uuid,10)||0)-(parseInt(b.uuid,10)||0)||a.id.localeCompare(b.id));
  const first=await listStaffRecipes(db,user,new URLSearchParams({search:term,sortBy:'uuid',page:'1',limit:'3'}));
  const second=await listStaffRecipes(db,user,new URLSearchParams({search:term,sortBy:'uuid',page:'2',limit:'3'}));
  expect(first.recipes.map((r:any)=>r._id)).toEqual(sorted.slice(0,3).map(r=>r.id));expect(second.recipes.map((r:any)=>r._id)).toEqual(sorted.slice(3,6).map(r=>r.id));
 });
 it('uses the reconciled bounded index with stable UUID pages and immediate mutation visibility',async()=>{
  const user=await actor();await seedRecipeAdminIndex(db);
  const params=new URLSearchParams({summary:'true',includeInactive:'true',includeTotal:'true',sortBy:'uuid',limit:'3'});
  const first=await listStaffRecipes(db,user,params),second=await listStaffRecipes(db,user,new URLSearchParams({...Object.fromEntries(params),page:'2'}));
  const expected=(await db.collection('recipes').orderBy('_nativeAdminUuid').limit(6).get()).docs.map(row=>row.id);
  expect([...first.recipes,...second.recipes].map(row=>row._id)).toEqual(expected);
  const added=await saveStaffRecipe(db,user,recipe(id()));expect((await listStaffRecipes(db,user,params)).pagination.total).toBe(first.pagination.total!+1);
  await saveStaffRecipe(db,user,{},added._id,true);expect((await listStaffRecipes(db,user,params)).pagination.total).toBe(first.pagination.total);
  const imported=id();await db.collection('recipes').doc(imported).set({...recipe(id()),uuid:'100000',createdBy:user});
  await db.collection('_nativeIndexes').doc('recipeAdmin').update({sourceWatermark:-1});
  // A raw source delta lacks index fields; stale readiness must use the complete fallback.
  expect((await listStaffRecipes(db,user,params)).pagination.total).toBe(first.pagination.total!+1);
  await db.collection('_nativeIndexes').doc('recipeAdmin').delete();
 });
 it('excludes alternative food options from average daily calories',async()=>{
  const user=await actor();const template=await mutateStaffTemplate(db,'diettemplates',user,{name:id(),category:'custom',duration:2,isPublic:false,meals:[{day:1,meals:{breakfast:{foodOptions:[{cal:'400',food:'Main'},{cal:'700',food:'Alternative',isAlternative:true}]}}},{day:2,meals:{breakfast:{foodOptions:[{cal:'600',food:'Main'}]}}}]});
  const read=await readStaffTemplate(db,'diettemplates',template._id,{id:user,role:'dietitian'});expect(read.averageDailyCalories).toBe(500);expect(read.uuid).toMatch(/^\d+$/);
 });
 it('loads admin summaries without reading large meal payloads and handles an absent creator',async()=>{
  const admin=id();await db.collection('users').doc(admin).set({role:'admin',status:'active'});const key=id();await db.collection('diettemplates').doc(key).set({name:'Summary '+key,isActive:true,isPublic:false,createdBy:id(),duration:10,meals:null,_nativeExternalFields:[{path:['meals'],encoding:'utf8',file:{invalid:'must not be read by summary'}}]});
  const result=await listStaffTemplates(db,'diettemplates',{id:admin,role:'admin'},new URLSearchParams({summary:'true',search:key,limit:'10000'}));expect(result.templates).toHaveLength(1);expect(result.templates[0].createdBy).toMatchObject({firstName:'Unassigned'});expect(result.templates[0].meals).toBeUndefined();
  await db.collection('diettemplates').doc(key).delete();
 });

});
it('recipe fingerprint preserves instruction order',()=>{const base={name:'Dish',ingredients:[{name:'Rice',quantity:1,unit:'cup'}],instructions:['Wash','Cook']};expect(getStrictRecipeFingerprint(base)).not.toBe(getStrictRecipeFingerprint({...base,instructions:['Cook','Wash']}));});
