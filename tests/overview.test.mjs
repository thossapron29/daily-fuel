import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moduleUrl} from './ts-module.mjs';
const {weekDates,monthDates,shiftMonth,dailyTotals,periodSummary}=await import(await moduleUrl('../lib/overview.ts'));
test('calendar weeks and months cross year and leap day correctly',()=>{
 assert.deepEqual(weekDates('2027-01-01'),['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
 assert.equal(monthDates('2028-02-02').at(-1),'2028-02-29');
 assert.equal(shiftMonth('2026-01-31',-1),'2025-12-01');
});
test('summary excludes missing days and the other profile, but includes explicit zero',()=>{
 const entries=[{profile_id:'new',date:'2026-10-01',calories:0,protein:0,carbs:0,fat:0},{profile_id:'new',date:'2026-10-02',calories:500,protein:30,carbs:50,fat:10},{profile_id:'ben',date:'2026-10-02',calories:900,protein:70,carbs:0,fat:0}];
 const totals=dailyTotals(entries,'new');
 assert.deepEqual(periodSummary(['2026-10-01','2026-10-02','2026-10-03'],totals),{days:2,calories:250,protein:15});
 assert.deepEqual(periodSummary(['2026-10-03'],totals),{days:0,calories:null,protein:null});
});
