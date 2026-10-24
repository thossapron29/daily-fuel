import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const encode=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const compile=async path=>ts.transpileModule(await readFile(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const recipesURL=encode(await compile('../lib/recipes.ts'));
const pantryURL=encode((await compile('../lib/pantry.ts')).replace("'./recipes'",JSON.stringify(recipesURL)));
const {normalizeBarcode,buildPantryItem,pantryToRow,pantryFromRow,draftFromFood,parseBarcodeProduct}=await import(pantryURL);
const {ingredientNutrition,buildRecipe,buildIngredientMeal}=await import(recipesURL);
const code='8850038400080';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const closeValues=(a,b)=>Object.keys(b).forEach(key=>close(a[key],b[key]));
const draft={name:'Sauce',brand:'Fixture',barcode:code,category:'seasoning',state:'as_sold',basis:15,basis_unit:'ml',calories:10,protein:1,carbs:2,fat:.2,source:'Label'};

test('barcode validation preserves leading zeros and canonicalizes UPC/GTIN equivalents',()=>{
 assert.equal(normalizeBarcode('8850 0384-00080'),code);
 assert.equal(normalizeBarcode('036000291452'),'0036000291452');
 assert.equal(normalizeBarcode('00036000291452'),'0036000291452');
 for(const invalid of ['123','8850038400081','https://example.com','885003840008O','-1'])assert.throws(()=>normalizeBarcode(invalid));
});
test('pantry stores label basis and native ml; gram conversion is explicit and legacy grams still work',()=>{
 const saved=buildPantryItem(draft,'pantry-1');
 assert.equal(saved.label_basis,15);assert.equal(saved.basis_unit,'ml');
 const item={id:'row',food:saved,grams:30,unit:'ml'};
 closeValues(ingredientNutrition(item),{calories:20,protein:2,carbs:4,fat:.4});
 assert.throws(()=>ingredientNutrition({...item,unit:'g'}));assert.throws(()=>ingredientNutrition({...item,unit:undefined}));
 closeValues(ingredientNutrition({id:'legacy',grams:30,food:{...saved,basis_unit:undefined}}),{calories:20,protein:2,carbs:4,fat:.4});
 close(draftFromFood(saved).calories,10);assert.equal(draftFromFood(saved).basis,15);
 const fetched=pantryFromRow(pantryToRow(saved));assert.deepEqual(fetched,saved);
 for(const patch of [{name:''},{basis:0},{basis_unit:'cups'},{calories:NaN},{category:'unknown'},{barcode:'123'}])assert.throws(()=>buildPantryItem({...draft,...patch},'x'));
});
test('meals and recipes snapshot ml ingredients independently of later pantry edits',()=>{
 const food=buildPantryItem(draft,'pantry-1');const items=[{id:'row',food,grams:30,unit:'ml'}];
 const meal=buildIngredientMeal({name:'',profile_id:'new',date:'2026-10-24',meal:'Lunch',ingredient_items:items},'meal',['new']);
 const recipe=buildRecipe({name:'Shared',servings:2,yield_grams:null,ingredient_items:items},'recipe');
 food.calories=1000;assert.equal(meal.calories,20);close(recipe.calories,20);assert.match(recipe.ingredients,/30 ml/);assert.equal(meal.ingredient_items[0].unit,'ml');
});
test('v3.6 barcode parser selects one packaging dataset without mixing g/ml or estimated nutrients',()=>{
 const payload={product:{code,product_name:'Sauce',brands:'Brand',nutrition_data_per:'100g',nutrition:{input_sets:[
  {source:'estimate',preparation:'as_sold',per_quantity:100,per_unit:'g',nutrients:{'energy-kcal':{unit:'kcal',value:999}}},
  {source:'packaging',preparation:'as_sold',per:'100g',per_quantity:100,per_unit:'g',nutrients:{'energy-kcal':{unit:'kcal',value:67},proteins:{unit:'g',value:.7}}},
  {source:'packaging',preparation:'as_sold',per:'100ml',per_quantity:100,per_unit:'ml',nutrients:{'energy-kcal':{unit:'kcal',value:67},proteins:{unit:'g',value:.7},carbohydrates:{unit:'g',value:16},fat:{unit:'g',value:0}}}
 ]}}};
 const result=parseBarcodeProduct(payload,code);assert.equal(result.basis_unit,'ml');assert.equal(result.basis,100);assert.deepEqual(result.values,{calories:67,protein:.7,carbs:16,fat:0});
 assert.throws(()=>parseBarcodeProduct({product:{code:'0036000291452'}},code));
 const missing=parseBarcodeProduct({product:{code,nutrition:{input_sets:[{source:'packaging',preparation:'prepared',per_quantity:100,per_unit:'g',nutrients:{}}]}}},code);
 assert.equal(missing.basis_unit,null);assert.equal(missing.values.calories,null);
});
test('missing values stay unknown; valid zero survives, kJ converts, and inequality estimates require review',()=>{
 const result=parseBarcodeProduct({product:{code,nutrition:{input_sets:[{source:'packaging',preparation:'as_sold',per_quantity:15,per_unit:'ml',nutrients:{'energy-kj':{value:41.84,unit:'kJ'},proteins:{value:1,unit:'g',modifier:'<'},carbohydrates:{value:2,unit:'g'},fat:{value:0,unit:'g'}}}]}}},code);
 assert.equal(result.values.calories,10);assert.equal(result.values.protein,null);assert.equal(result.values.fat,0);
 const legacy=parseBarcodeProduct({product:{code,nutrition_data_per:'100ml',nutriments:{'energy-kcal_100g':67,fat_100g:0}}},code);
 assert.equal(legacy.basis_unit,'ml');assert.equal(legacy.values.protein,null);assert.equal(legacy.values.fat,0);
 assert.throws(()=>parseBarcodeProduct({status:0},code));
});

async function route(){return import(encode((await compile('../app/api/barcode/route.ts')).replace("'../../../lib/pantry'",JSON.stringify(pantryURL)).replace("'@supabase/supabase-js'",JSON.stringify(import.meta.resolve('@supabase/supabase-js')))+`\n// unique ${Math.random()}`))}
test('barcode route authenticates production requests and handles invalid input and upstream failures',async()=>{
 const before={url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,legacy:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,mode:process.env.NODE_ENV,fetch:globalThis.fetch};
 try{
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;process.env.NODE_ENV='production';
  let handler=(await route()).POST;
  const request=value=>new Request('http://localhost/api/barcode',{method:'POST',body:JSON.stringify({barcode:value})});
  assert.equal((await handler(request(code))).status,503);
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='fixture-public-key';
  assert.equal((await handler(request(code))).status,401);
  let authReads=0,productReads=0;
  globalThis.fetch=async(url,options)=>{if(String(url).includes('/auth/v1/user')){authReads++;assert.equal(new Headers(options.headers).get('Authorization'),'Bearer fixture-token');return Response.json({id:'fixture-owner',aud:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-10-24T00:00:00Z'})}productReads++;return Response.json({product:{code,nutrition_data_per:'100g',nutriments:{fat_100g:0}}})};
  const authenticated=new Request('http://localhost/api/barcode',{method:'POST',headers:{Authorization:'Bearer fixture-token'},body:JSON.stringify({barcode:code})});
  assert.equal((await handler(authenticated)).status,200);assert.equal(authReads,1);assert.equal(productReads,1);
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;process.env.NODE_ENV='development';
  let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({product:{code,nutrition_data_per:'100g',nutriments:{fat_100g:0}}})};
  assert.equal((await handler(request('bad'))).status,400);assert.equal(calls,0);
  const response=await handler(request(code));assert.equal(response.status,200);assert.equal((await response.json()).product.values.fat,0);
  globalThis.fetch=async()=>new Response('',{status:404});assert.equal((await handler(request(code))).status,404);
  globalThis.fetch=async()=>{throw new Error('timeout')};assert.equal((await handler(request(code))).status,502);
  handler=(await route()).POST;globalThis.fetch=async()=>Response.json({product:{code}});
  for(let i=0;i<8;i++)assert.equal((await handler(request(code))).status,200);
  assert.equal((await handler(request(code))).status,429);
 }finally{for(const [key,value]of Object.entries({NEXT_PUBLIC_SUPABASE_URL:before.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:before.key,NEXT_PUBLIC_SUPABASE_ANON_KEY:before.legacy,NODE_ENV:before.mode})){if(value===undefined)delete process.env[key];else process.env[key]=value}globalThis.fetch=before.fetch}
});
