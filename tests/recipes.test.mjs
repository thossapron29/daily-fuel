import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
async function load(name) {
  const source = await readFile(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8');
  const {outputText} = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}});
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const {foodCatalog} = await load('foods');
const {foodFromLabel, ingredientNutrition, recipeNutrition, buildRecipe, portionNutrition, validateRecipeLog, buildIngredientMeal} = await load('recipes');
const food = id => foodCatalog.find(item=>item.id===`usda-${id}`);
const rows = [{id:'beef',food:food(174030),grams:125},{id:'rice',food:food(168878),grams:150},{id:'oil',food:food(171413),grams:5}];
const draft = {name:'Beef rice',servings:2,yield_grams:600,ingredient_items:rows};
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('grams scale source nutrients, preserving source calories instead of rebuilding them',()=>{
  assert.deepEqual(ingredientNutrition(rows[0]),{calories:220,protein:25,carbs:0,fat:12.5});
  close(ingredientNutrition(rows[2]).calories,44.2); // USDA 884 kcal/100 g, not 900.
  const totals=recipeNutrition(rows);
  close(totals.calories,459.2);close(totals.protein,29.035);close(totals.carbs,42.255);close(totals.fat,17.92);
});
test('raw and cooked selections use different source records rather than a display tag',()=>{
  assert.equal(ingredientNutrition({...rows[0],food:food(174031)}).calories,271.25);
  assert.equal(ingredientNutrition({...rows[1],food:food(169756)}).calories,547.5);
  assert.notEqual(food(169756).source_id,food(168878).source_id);
});
test('saved recipes contain independent source snapshots and do not infer cooked yield',()=>{
  const saved=buildRecipe(draft,'recipe');
  assert.equal(saved.yield_grams,600);assert.equal(saved.ingredient_items[0].food.source_id,'174030');
  assert.notEqual(saved.ingredient_items[0].food,rows[0].food);
  assert.equal(buildRecipe({...draft,yield_grams:null},'recipe').yield_grams,null);
  assert.match(saved.ingredients,/125 g/);
});
test('two people can log partial and different portions without consuming the full batch',()=>{
  const recipe=buildRecipe(draft,'recipe');
  assert.deepEqual(portionNutrition(recipe,150,'grams'),{calories:114.8,protein:7.26,carbs:10.56,fat:4.48});
  assert.deepEqual(portionNutrition(recipe,300,'grams'),{calories:229.6,protein:14.52,carbs:21.13,fat:8.96});
  assert.deepEqual(portionNutrition(recipe,.5,'servings'),portionNutrition(recipe,150,'grams'));
  assert.deepEqual(portionNutrition(recipe,1,'servings'),portionNutrition(recipe,300,'grams'));
});
test('legacy recipes still log by servings, while gram portions require a measured yield',()=>{
  const legacy={id:'old',name:'Old recipe',ingredients:'Beef',servings:2,calories:800,protein:40,carbs:60,fat:30};
  assert.deepEqual(portionNutrition(legacy,1,'servings'),{calories:400,protein:20,carbs:30,fat:15});
  assert.throws(()=>portionNutrition(legacy,150,'grams'));
});
test('zero-calorie seasoning remains valid and row validation rejects invalid quantities',()=>{
  assert.equal(ingredientNutrition({id:'salt',food:food(173468),grams:2}).calories,0);
  for(const grams of [0,-1,NaN,Infinity,Number.MAX_VALUE])assert.throws(()=>ingredientNutrition({...rows[0],grams}));
  assert.throws(()=>ingredientNutrition({...rows[0],food:{...rows[0].food,state:'unknown'}}));
  assert.throws(()=>buildRecipe({...draft,ingredient_items:[]},'x'));
  for(const servings of [0,-1,NaN])assert.throws(()=>buildRecipe({...draft,servings},'x'));
  assert.throws(()=>buildRecipe({...draft,yield_grams:0},'x'));
  assert.throws(()=>portionNutrition(buildRecipe(draft,'x'),0,'grams'));
  assert.throws(()=>portionNutrition(buildRecipe(draft,'x'),1,'invalid'));
});
test('portion logs validate date, meal, profile ownership and duplicate profiles',()=>{
  const log={date:'2026-10-23',meal:'Lunch',unit:'grams',portions:[{profile_id:'new',amount:150},{profile_id:'ben',amount:300}]};
  assert.doesNotThrow(()=>validateRecipeLog(log,['new','ben']));
  for(const patch of [{date:'2026-02-30'},{meal:'unknown'},{unit:'cups'},{portions:[]},{portions:[{profile_id:'stranger',amount:1}]},{portions:[{profile_id:'new',amount:-1}]},{portions:[{profile_id:'new',amount:1},{profile_id:'new',amount:2}]}])assert.throws(()=>validateRecipeLog({...log,...patch},['new','ben']));
});
test('brand-label serving sizes normalize to 100 g without assuming the label is per 100 g',()=>{
  const label={name:'Sauce',state:'as_sold',basis:15,calories:10,protein:1,carbs:2,fat:.2};
  const food=foodFromLabel(label,'label-sauce');
  const values=ingredientNutrition({id:'sauce',food,grams:30});
  close(values.calories,20);close(values.protein,2);close(values.carbs,4);close(values.fat,.4);
  assert.equal(food.source,'ฉลากสินค้า / กรอกเอง');
  assert.throws(()=>foodFromLabel({...label,basis:0},'bad'));
  assert.throws(()=>foodFromLabel({...label,calories:-1},'bad'));
});

const mealDraft={name:'',profile_id:'new',date:'2026-10-23',meal:'Dinner',ingredient_items:rows};
test('one-off meals use eaten grams directly, round only totals, and need no recipe or yield',()=>{
  const meal=buildIngredientMeal(mealDraft,'meal-1',['new','ben']);
  assert.deepEqual({calories:meal.calories,protein:meal.protein,carbs:meal.carbs,fat:meal.fat},{calories:459.2,protein:29.04,carbs:42.26,fat:17.92});
  assert.equal(meal.profile_id,'new');assert.equal(meal.date,'2026-10-23');assert.equal(meal.meal,'Dinner');
  assert.equal(meal.name,rows.map(item=>item.food.name).join(' + '));
  for(const key of ['recipe_id','servings','yield_grams','portion_amount','portion_unit'])assert.equal(Object.hasOwn(meal,key),false);
  assert.equal(buildIngredientMeal({...mealDraft,name:'  My dinner  '},'meal-2',['new']).name,'My dinner');
});
test('one-off meals retain independent gram, preparation and nutrient source snapshots',()=>{
  const original=structuredClone(mealDraft);const meal=buildIngredientMeal(original,'meal-1',['new']);
  original.ingredient_items[0].grams=999;original.ingredient_items[0].food.calories=999;
  assert.equal(meal.ingredient_items[0].grams,125);assert.equal(meal.ingredient_items[0].food.state,'raw');
  assert.equal(meal.ingredient_items[0].food.source_id,'174030');assert.equal(meal.calories,459.2);
  assert.equal(JSON.parse(JSON.stringify(meal)).ingredient_items[1].food.state,'cooked');
});
test('one-off meals reject empty ingredients, bad grams, unknown people and invalid dates/meals',()=>{
  for(const patch of [{ingredient_items:[]},{profile_id:'unknown'},{date:'2026-02-30'},{meal:'unknown'},
    {ingredient_items:[{...rows[0],grams:0}]},{ingredient_items:[{...rows[0],grams:NaN}]}]) {
    assert.throws(()=>buildIngredientMeal({...mealDraft,...patch},'meal-1',['new','ben']));
  }
});
test('one-off meals include label-based condiments and accept zero-calorie ingredients',()=>{
  const sauce=foodFromLabel({name:'Sauce',state:'as_sold',basis:15,calories:10,protein:1,carbs:2,fat:.2},'label-sauce');
  const meal=buildIngredientMeal({...mealDraft,ingredient_items:[{id:'sauce',food:sauce,grams:30},{id:'salt',food:food(173468),grams:2}]},'meal-1',['new']);
  assert.deepEqual({calories:meal.calories,protein:meal.protein,carbs:meal.carbs,fat:meal.fat},{calories:20,protein:2,carbs:4,fat:.4});
});
