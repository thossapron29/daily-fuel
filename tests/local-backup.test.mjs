import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../lib/local-backup.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}});
const {parseLocalBackup}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const profile=id=>({id,name:id,sex:'female',age:30,weight:60,height:160,activity:1.2,body_fat:null,goal:'maintain',adjustment:0,dbid:'old-project-id',owner_id:'old-account'});
test('old browser data is normalized without modifying the original snapshot',()=>{
  const raw=JSON.stringify({profiles:[profile('new'),profile('ben')],entries:[{id:'entry',profile_id:'new',calories:300}],recipes:[],weights:[]});
  const backup=parseLocalBackup(raw);
  assert.equal(backup.profiles[0].macro_plan,'moderate');
  assert.equal(backup.profiles[0].dbid,undefined);assert.equal(backup.profiles[0].owner_id,undefined);
  assert.equal(backup.entries[0].calories,300);assert.equal(JSON.parse(raw).profiles[0].dbid,'old-project-id');
});
test('missing optional collections become empty arrays',()=>{
  const backup=parseLocalBackup(JSON.stringify({profiles:[profile('new'),profile('ben')]}));
  assert.deepEqual(backup.entries,[]);assert.deepEqual(backup.recipes,[]);assert.deepEqual(backup.weights,[]);
});
test('invalid snapshots fail explicitly while absent backups are harmless',()=>{
  assert.equal(parseLocalBackup(null),null);assert.equal(parseLocalBackup(JSON.stringify({profiles:[]})),null);
  for(const value of ['bad','null','{}',JSON.stringify({profiles:[profile('new'),profile('new')]}),JSON.stringify({profiles:[profile('new')]}),JSON.stringify({profiles:[profile('new'),profile('ben')],recipes:{}})])assert.throws(()=>parseLocalBackup(value));
});
