import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleUrl} from './ts-module.mjs';
const {householdDay}=await import(await moduleUrl('../lib/household-dashboard.ts'));
const profiles=[{id:'new',name:'นิว',sex:'female',age:30,weight:60,height:165,activity:1.2,body_fat:null,goal:'lose',adjustment:-300,macro_plan:'moderate'},{id:'ben',name:'เบ้น',sex:'male',age:30,weight:70,height:175,activity:1.375,body_fat:null,goal:'maintain',adjustment:0,macro_plan:'higher'}];
const meal=(id,profile_id,patch={})=>({id,profile_id,date:'2026-11-02',meal:'Lunch',name:id,calories:500,protein:30,carbs:50,fat:20,...patch});
test('household dashboard separates both profiles and selected dates against individual targets',()=>{
 const result=householdDay(profiles,[meal('new','new'),meal('ben','ben',{calories:800}),meal('yesterday','ben',{date:'2026-11-01',calories:900}),meal('other','other',{calories:3000})],'2026-11-02');
 assert.deepEqual(result.map(p=>[p.profile.id,p.entries.length,p.totals.calories]),[['new',1,500],['ben',1,800]]);
 assert.notEqual(result[0].goal,result[1].goal);assert.notEqual(result[0].macros.carbs,result[1].macros.carbs);
});
test('coverage counts explicit zero as known and unknowns as missing independently per nutrient and person',()=>{
 const [newPerson,ben]=householdDay(profiles,[meal('zero','new',{sodium_mg:0,total_sugar_g:8,free_sugar_g:0,nutrition_source:'label'}),meal('unknown','new',{sodium_mg:null,total_sugar_g:10,nutrition_source:'chatgpt_estimate'}),meal('ben','ben',{sodium_mg:2100,total_sugar_g:10,free_sugar_g:5,nutrition_source:'provided'})],'2026-11-02');
 assert.deepEqual(newPerson.coverage.map(f=>[f.key,f.value,f.known,f.count,f.complete,f.estimated]),[['sodium_mg',0,1,2,false,0],['total_sugar_g',18,2,2,true,1],['free_sugar_g',0,1,2,false,0]]);
 assert.deepEqual(newPerson.missing,[{id:'unknown',name:'unknown',fields:['โซเดียม','น้ำตาลอิสระ']}]);
 assert.deepEqual(newPerson.sources,{label:1,estimate:1,provided:0,manual:0});
 assert.ok(ben.coverage.every(f=>f.complete));assert.equal(ben.coverage[0].value,2100);
});
test('empty days are not marked complete and source labels do not manufacture nutrient values',()=>{
 const [empty,legacy]=householdDay(profiles,[meal('legacy','ben')],'2026-11-02');
 assert.equal(empty.entries.length,0);assert.ok(empty.coverage.every(f=>f.value===null&&!f.complete&&f.count===0));
 assert.equal(legacy.sources.manual,1);assert.ok(legacy.coverage.every(f=>f.value===null&&!f.complete));assert.equal(legacy.missing.length,1);
});
