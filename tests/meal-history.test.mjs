import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../lib/meal-history.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}});
const {mealSuggestions,applyMealSuggestion}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const meal=(id,patch={})=>({id,profile_id:'new',date:'2026-10-23',meal:'Lunch',name:'ข้าวลาบหมู',calories:550,protein:30.5,carbs:60,fat:20,...patch});
const people=['new','ben'];

test('history spans dates, defaults to the active person, and both-person results put that person first',()=>{
  const entries=[meal('n'),meal('b',{profile_id:'ben',date:'2026-10-25',calories:650}),meal('other',{profile_id:'stranger'})];
  assert.deepEqual(mealSuggestions(entries,'new',people,'').map(x=>x.profile_id),['new']);
  assert.deepEqual(mealSuggestions(entries,'new',people,'',true).map(x=>x.profile_id),['new','ben']);
  assert.deepEqual(mealSuggestions(entries,'ben',people,'',true).map(x=>x.profile_id),['ben','new']);
  assert.equal(mealSuggestions(entries,'new',people,'ลาบ')[0].date,'2026-10-23');
});
test('only exact per-person name/nutrition duplicates collapse; different portions retain their values',()=>{
  const entries=[meal('old'),meal('latest',{date:'2026-10-24',name:' ข้าวลาบหมู '}),meal('smaller',{calories:450,carbs:35}),meal('ben',{profile_id:'ben'})];
  const suggestions=mealSuggestions(entries,'new',people,'',true);
  assert.equal(suggestions.length,3);assert.equal(suggestions[0].date,'2026-10-24');
  assert.deepEqual(suggestions.map(x=>x.calories),[550,450,550]);
  assert.equal(suggestions[1].carbs,35);
});
test('search normalizes case, spacing and Unicode; recent results are capped at five per person',()=>{
  const entries=Array.from({length:8},(_,i)=>meal(String(i),{name:`Meal ${i}`,date:`2026-10-${String(18+i).padStart(2,'0')}`}));
  const result=mealSuggestions(entries,'new',people,'  ＭＥＡＬ   ');
  assert.deepEqual(result.map(x=>x.name),['Meal 7','Meal 6','Meal 5','Meal 4','Meal 3']);
  assert.deepEqual(mealSuggestions(entries,'new',people,'not found'),[]);
  assert.deepEqual(mealSuggestions([],'new',people,''),[]);
});
test('missing/invalid nutrients are excluded, explicit zeros survive and selection remains an editable new draft',()=>{
  const good=meal('good',{calories:0,protein:0,carbs:0,fat:0});
  const entries=[good,...[null,NaN,Infinity,-1].map((value,i)=>meal(String(i),{protein:value}))];
  const original=structuredClone(good);
  const suggestions=mealSuggestions(entries,'new',people,'');assert.equal(suggestions.length,1);
  const draft={name:'',meal:'Dinner',calories:'',protein:'',carbs:'',fat:''};
  const filled=applyMealSuggestion(draft,suggestions[0]);
  assert.deepEqual(filled,{name:'ข้าวลาบหมู',meal:'Dinner',calories:'0',protein:'0',carbs:'0',fat:'0'});
  filled.calories='150.5';filled.name='มื้อที่ปรับแล้ว';
  assert.deepEqual(good,original);assert.equal(draft.name,'');
  assert.deepEqual(Object.keys(filled).sort(),['calories','carbs','fat','meal','name','protein']);
});
