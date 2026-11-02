import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moduleUrl} from './ts-module.mjs';
const {tabFromPath,tabPaths,validSelectedDay}=await import(await moduleUrl('../lib/tab-paths.ts'));
test('each visible tab maps to a unique direct path',()=>{for(const [name,path] of Object.entries(tabPaths))assert.equal(tabFromPath(path),name);assert.equal(tabFromPath('/overview/'),'Overview');assert.equal(tabFromPath('/unknown'),'Dashboard')});
test('restored dates must be real calendar dates',()=>{assert.equal(validSelectedDay('2028-02-29'),true);assert.equal(validSelectedDay('2026-02-29'),false);assert.equal(validSelectedDay('2026-15-01'),false);assert.equal(validSelectedDay('anything'),false)});
