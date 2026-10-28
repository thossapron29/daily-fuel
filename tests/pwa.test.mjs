import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('service worker caches only offline page, never meal or API data',async()=>{
 const handlers={};const cached=[];let networkFailure=false;
 const context={self:{addEventListener:(name,handler)=>{handlers[name]=handler},clients:{claim:async()=>{}}},caches:{open:async()=>({add:async path=>cached.push(path)}),keys:async()=>[],match:async path=>path==='/offline.html'?'offline':null},fetch:async()=>{if(networkFailure)throw Error('offline');return 'online'},Response:{error:()=>null}};
 vm.runInNewContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),context);
 let installed;handlers.install({waitUntil:p=>{installed=p}});await installed;assert.deepEqual(cached,['/offline.html']);
 let response;handlers.fetch({request:{method:'GET',mode:'navigate'},respondWith:p=>{response=p}});assert.equal(await response,'online');
 networkFailure=true;handlers.fetch({request:{method:'GET',mode:'navigate'},respondWith:p=>{response=p}});assert.equal(await response,'offline');
 let intercepted=false;handlers.fetch({request:{method:'GET',mode:'cors'},respondWith:()=>{intercepted=true}});handlers.fetch({request:{method:'POST',mode:'navigate'},respondWith:()=>{intercepted=true}});assert.equal(intercepted,false);
});
