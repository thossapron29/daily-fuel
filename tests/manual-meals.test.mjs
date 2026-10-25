import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const source=await readFile(new URL('../lib/manual-meals.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}});
const {emptyMealDraft,parseMealDraft}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const meal={name:' ข้าวลาบหมู ',meal:'Lunch',calories:'550',protein:'30.5',carbs:'60',fat:'20'};

test('meal fields begin empty and saving converts editable text to numeric nutrients',()=>{
  assert.deepEqual(emptyMealDraft(),{name:'',meal:'Lunch',calories:'',protein:'',carbs:'',fat:''});
  assert.deepEqual(parseMealDraft(meal),{name:'ข้าวลาบหมู',meal:'Lunch',calories:550,protein:30.5,carbs:60,fat:20});
  assert.equal(parseMealDraft({...meal,protein:'010'}).protein,10);
});
test('cleared nutrients cannot silently become zero, but explicitly entered zero is valid',()=>{
  for(const key of ['calories','protein','carbs','fat']){
    for(const value of ['',' ','-1','NaN','Infinity','1e309','no'])assert.throws(()=>parseMealDraft({...meal,[key]:value}),`${key}: ${value}`);
    assert.equal(parseMealDraft({...meal,[key]:'0'})[key],0);
    assert.equal(parseMealDraft({...meal,[key]:'0.5'})[key],.5);
  }
  assert.throws(()=>parseMealDraft({...meal,name:' '}));
  assert.throws(()=>parseMealDraft({...meal,meal:'Unknown'}));
});
