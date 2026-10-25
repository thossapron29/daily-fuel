import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleUrl} from './ts-module.mjs';
const {extraTotals,dailyNutritionNotices,parseExtraNutrition,freshNoticeKeys}=await import(await moduleUrl('../lib/nutrition-insights.ts'));
const {parseMealDraft}=await import(await moduleUrl('../lib/manual-meals.ts'));
const {validateMealBatch}=await import(await moduleUrl('../lib/gpt-api.ts'));
const {applyMealSuggestion,mealSuggestions}=await import(await moduleUrl('../lib/meal-history.ts'));
const base={calories:2063,protein:114,carbs:191,fat:92};
const macroGoals={carbs:180,fat:80};

test('small energy excess and macro plan excess are visible without treating protein as a maximum',()=>{
 const notices=dailyNutritionNotices([{...base,protein:300}],2061,macroGoals);
 assert.deepEqual(notices.map(n=>[n.key,n.value-n.goal,n.level]),[['calories',2,'note'],['carbs',11,'note'],['fat',12,'note']]);
 assert.deepEqual(freshNoticeKeys(notices,new Set(['calories','fat'])),['carbs']);
 assert.deepEqual(dailyNutritionNotices([{calories:2061,protein:300,carbs:180,fat:80}],2061,macroGoals),[]);
});
test('unknown nutrients never become zero or imply the whole day is below a limit',()=>{
 assert.deepEqual(extraTotals([{}, {sodium_mg:null}], 'sodium_mg'),{value:null,known:0,count:2,complete:false});
 assert.deepEqual(extraTotals([{sodium_mg:0},{sodium_mg:null},{sodium_mg:1000}], 'sodium_mg'),{value:1000,known:2,count:3,complete:false});
 assert.equal(extraTotals([{sodium_mg:0}], 'sodium_mg').complete,true);
 const values=[{...base,sodium_mg:2100,total_sugar_g:99}, {...base}];
 const sodium=dailyNutritionNotices(values,10000,{carbs:1000,fat:1000}).find(n=>n.key==='sodium_mg');
 assert.equal(sodium.partial,true);assert.equal(sodium.goal,2000);assert.equal(sodium.level,'warning');
 assert.equal(dailyNutritionNotices(values,10000,{carbs:1000,fat:1000}).some(n=>n.key==='total_sugar_g'),false);
});
test('free sugar allowance uses 10 percent of planned calories, total sugar is separate, and boundary counts as reaching limit',()=>{
 const entries=[{calories:0,protein:0,carbs:0,fat:0,total_sugar_g:70,free_sugar_g:50,sodium_mg:2000}];
 const notices=dailyNutritionNotices(entries,2000,{carbs:200,fat:80});
 assert.deepEqual(notices.map(n=>n.key),['free_sugar_g','sodium_mg']);
 assert.equal(notices[0].goal,50);assert.equal(notices[0].partial,false);
 assert.equal(dailyNutritionNotices([{...entries[0],free_sugar_g:null,sodium_mg:null}],2000,macroGoals).length,0);
});
test('optional inputs preserve unknown, explicit zero and mg units, reject invalid values and inconsistent sugars',()=>{
 assert.deepEqual(parseExtraNutrition({}),{});
 assert.deepEqual(parseExtraNutrition({sodium_mg:null,total_sugar_g:0,free_sugar_g:0}),{sodium_mg:null,total_sugar_g:0,free_sugar_g:0});
 for(const bad of [-1,NaN,Infinity,'20','',100001])assert.throws(()=>parseExtraNutrition({sodium_mg:bad}));
 assert.throws(()=>parseExtraNutrition({total_sugar_g:5,free_sugar_g:6}));
 const draft={name:'Meal',meal:'Lunch',calories:'500',protein:'20',carbs:'50',fat:'20',sodium_mg:'850',total_sugar_g:'',free_sugar_g:'0'};
 assert.equal(parseMealDraft(draft).sodium_mg,850);assert.equal(parseMealDraft(draft).free_sugar_g,0);assert.equal('total_sugar_g' in parseMealDraft(draft),false);
 assert.equal('sodium_mg' in parseMealDraft({...draft,sodium_mg:''}),false);
 assert.throws(()=>parseMealDraft({...draft,sodium_mg:'-1'}));
});
test('API accepts nullable optional nutrition but still rejects guessed ownership and invalid optional quantities',()=>{
 const item={recipient_id:'aaaaaaaa-7200-4200-8200-000000000001',date:'2026-10-25',meal:'Lunch',name:'Meal',...base,sodium_mg:1234.56,total_sugar_g:20,free_sugar_g:0};
 const batch={request_id:'aaaaaaaa-7200-4200-8200-000000000002',entries:[item]};
 assert.equal(validateMealBatch(batch).entries[0].sodium_mg,1234.56);
 assert.equal(validateMealBatch({...batch,entries:[{...item,sodium_mg:null}]}).entries[0].sodium_mg,null);
 for(const patch of [{owner_id:'forged'},{sodium_mg:'2'},{free_sugar_g:21},{sodium_mg:Infinity}])assert.throws(()=>validateMealBatch({...batch,entries:[{...item,...patch}]}));
});
test('reused meals copy detailed nutrition per portion and clear stale values when the next meal lacks them',()=>{
 const draft={name:'old',meal:'Dinner',...Object.fromEntries(['calories','protein','carbs','fat'].map(k=>[k,'0'])),sodium_mg:'999',total_sugar_g:'40',free_sugar_g:'30'};
 const suggestion={name:'New',...base,sodium_mg:1000,total_sugar_g:0};
 const filled=applyMealSuggestion(draft,suggestion);
 assert.equal(filled.sodium_mg,'1000');assert.equal(filled.total_sugar_g,'0');assert.equal(filled.free_sugar_g,'');assert.equal(filled.meal,'Dinner');
 const old=applyMealSuggestion(filled,{name:'Legacy',...base});assert.equal(old.sodium_mg,'');assert.equal(old.total_sugar_g,'');
 const entries=[{id:'1',profile_id:'new',date:'2026-10-25',meal:'Lunch',...suggestion},{id:'2',profile_id:'new',date:'2026-10-25',meal:'Lunch',...suggestion,sodium_mg:800}];
 const choices=mealSuggestions(entries,'new',['new','ben'],'');assert.equal(choices.length,2);assert.equal(choices[0].sodium_mg,800);
});
