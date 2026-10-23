import {seedRecipeAdminIndex} from '@/lib/db/repository/native-recipe-admin-index';
import {randomBytes} from 'node:crypto';
import {getNativeDatabase} from '@/lib/db/database';
import {saveStaffRecipe,listStaffRecipes,readStaffRecipe} from '@/lib/db/repository/native-staff-recipes';
import {mutateStaffTemplate,readStaffTemplate,listStaffTemplates} from '@/lib/db/repository/native-staff-templates';
import {getStrictRecipeFingerprint} from '@/lib/recipe-quality';
import {matchesFoodSearch,recipeSearchRelevance} from '@/lib/recipe-normalize';
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
 it('matches a synonym food term so yogurt finds recipes stored as curd',async()=>{
  const user=await actor();
  const saved=await saveStaffRecipe(db,user,{...recipe(id()),name:'Raita Bowl',ingredients:[{name:'Curd',quantity:1,unit:'cup'}],instructions:['Mix']});
  const results=await listStaffRecipes(db,user,new URLSearchParams({search:'yogurt',sortBy:'relevance',limit:'50',page:'1',includeTotal:'true',includeInactive:'true'}));
  expect(results.recipes.map(r=>r._id)).toContain(saved._id);
  const miss=await listStaffRecipes(db,user,new URLSearchParams({search:'xylophone',limit:'50',page:'1'}));
  expect(miss.recipes).toHaveLength(0);
 });
 it('ranks named dishes above bare ingredient names and matches words in any order',async()=>{
  // Every affected case comes from the reported dietitian search results.
  expect(matchesFoodSearch('Greek Yogurt Overnight Oats','yogurt')).toBe(true);
  expect(matchesFoodSearch('Curd & Cucumber Salad','yogurt')).toBe(true);
  expect(matchesFoodSearch('Hung Curd Cucumber Salad','curd')).toBe(true);
  expect(matchesFoodSearch('Vegetable Oats Chilla','curd')).toBe(false);
  expect(matchesFoodSearch('Fruit Juice Smoothie','curd')).toBe(false);
  expect(matchesFoodSearch('Curd Rice','curd salad')).toBe(false);
  expect(matchesFoodSearch('Curd & Cucumber Salad','curd salad')).toBe(true);
  expect(matchesFoodSearch('Yogurt Greek Bowl','greek yogurt')).toBe(true);

  const named=recipeSearchRelevance({name:'Greek Yogurt Overnight Oats',description:'Creamy oats'},'yogurt');
  const bare=recipeSearchRelevance({name:'curd'},'yogurt');
  const exactNamed=recipeSearchRelevance({name:'Curd Rice'},'curd');
  const exactBare=recipeSearchRelevance({name:'Curd'},'curd');
  expect(exactNamed).toBeLessThan(exactBare);
  expect(named).toBeLessThanOrEqual(bare);
  expect(recipeSearchRelevance({name:'Chicken Curry'},'curd')).toBe(10);
 });
 it('orders /recipes results by relevance instead of alphabetical',async()=>{
  const user=await actor(),term='zz'+id().slice(0,6);
  const bare=await saveStaffRecipe(db,user,recipe(term));
  const named=await saveStaffRecipe(db,user,recipe(`Greek ${term} Overnight Oats`));
  const ingredientOnly=await saveStaffRecipe(db,user,{...recipe(`Plain Bowl ${id().slice(0,6)}`),ingredients:[{name:term,quantity:1,unit:'cup'}]});
  const result=await listStaffRecipes(db,user,new URLSearchParams({search:term,sortBy:'relevance',limit:'20',page:'1',includeTotal:'true'}));
  const ids=result.recipes.map((r:any)=>r._id);
  // Titles that name the food beat a bare generic title, which in turn beats an ingredient-only hit.
  expect(ids.indexOf(named._id)).toBeLessThan(ids.indexOf(bare._id));
  expect(ids.indexOf(bare._id)).toBeLessThan(ids.indexOf(ingredientOnly._id));
 });
 it('uses stable numeric UUID ordering across page boundaries',async()=>{
  const user=await actor(),term=id(),rows=[];
  for(const uuid of ['100','2','10','abc','12abc','002','-3',' +5']){const key=id();await db.collection('recipes').doc(key).set({...recipe(term+' '+uuid),uuid,createdBy:user,createdAt:new Date(),isActive:true});rows.push({id:key,uuid});}
  const sorted=[...rows].sort((a,b)=>(parseInt(a.uuid,10)||0)-(parseInt(b.uuid,10)||0)||a.id.localeCompare(b.id));
  const first=await listStaffRecipes(db,user,new URLSearchParams({search:term,sortBy:'uuid',page:'1',limit:'3'}));
  const second=await listStaffRecipes(db,user,new URLSearchParams({search:term,sortBy:'uuid',page:'2',limit:'3'}));
  expect(first.recipes.map((r:any)=>r._id)).toEqual(sorted.slice(0,3).map(r=>r.id));expect(second.recipes.map((r:any)=>r._id)).toEqual(sorted.slice(3,6).map(r=>r.id));
 });
 it('pages after filtering so a match beyond the first page is still found',async()=>{
  await seedRecipeAdminIndex(db);
  const user=await actor(),term=id();
  for(let i=0;i<60;i++){const key=id();await db.collection('recipes').doc(key).set({...recipe(`${term} filler ${i}`),uuid:String(i),createdBy:user,createdAt:new Date(),isActive:true});}
  const target=await saveStaffRecipe(db,user,recipe(`${term} target`));
  const exact=await listStaffRecipes(db,user,new URLSearchParams({search:`${term} target`,sortBy:'relevance',limit:'20',page:'1',includeTotal:'true'}));
  expect(exact.recipes.map((r:any)=>r._id)).toEqual([target._id]);
  const expectedUuidOrder=(await db.collection('recipes').select('name','uuid').get()).docs.filter(row=>String(row.get('name')).startsWith(term)).sort((a,b)=>(parseInt(String(a.get('uuid')),10)||0)-(parseInt(String(b.get('uuid')),10)||0)||a.id.localeCompare(b.id)).map(row=>row.id);
  const uuidPages=[];
  for(let page=1;page<=4;page++)uuidPages.push(...(await listStaffRecipes(db,user,new URLSearchParams({search:term,sortBy:'uuid',limit:'20',page:String(page)}))).recipes.map((r:any)=>r._id));
  expect(uuidPages).toEqual(expectedUuidOrder);
  expect(uuidPages).toContain(target._id);
  // Alphabetically the target sorts after all fillers, so it must be reachable on the last page, not dropped.
  const lastPage=await listStaffRecipes(db,user,new URLSearchParams({search:term,sortBy:'name',limit:'20',page:'4',includeTotal:'true'}));
  expect(lastPage.recipes.map((r:any)=>r._id)).toContain(target._id);
  expect((await listStaffRecipes(db,user,new URLSearchParams({search:`${term} target`,limit:'20',includeTotal:'true'}))).pagination.total).toBe(1);
 });
 it('serves staff lists fresh after out-of-band recipe writes',async()=>{
  const user=await actor(),params=new URLSearchParams({summary:'true',includeInactive:'true',includeTotal:'true',sortBy:'uuid',limit:'3'});
  const first=await listStaffRecipes(db,user,params);
  const imported=id();await db.collection('recipes').doc(imported).set({...recipe(id()),uuid:'100000',createdBy:user,createdAt:new Date(),isActive:true});
  expect((await listStaffRecipes(db,user,params)).pagination.total).toBe(first.pagination.total!+1);
  const rows=await listStaffRecipes(db,user,new URLSearchParams({...Object.fromEntries(params),limit:'1000'}));
  expect(rows.recipes.map((r:any)=>r._id)).toContain(imported);
  await db.collection('recipes').doc(imported).delete();
  expect((await listStaffRecipes(db,user,params)).pagination.total).toBe(first.pagination.total);
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
