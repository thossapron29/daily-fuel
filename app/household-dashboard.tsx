'use client';
import {ArrowUpRight,Check,ChevronDown,Info,Leaf,Scale,Utensils} from 'lucide-react';
import type {Entry,Profile} from '../lib/data';
import {goalOption,macroOption} from '../lib/nutrition';
import {householdDay,type HouseholdPerson} from '../lib/household-dashboard';
import {nutritionNumber as n} from '../lib/nutrition-insights';
import type {AnalysisRequest,AnalysisResult} from '../lib/nutrition-analysis';
import NutritionAnalysis from './nutrition-analysis';

type Props={profiles:Profile[];entries:Entry[];date:string;account:string|null;cloud:boolean;weights:{profile_id:string;date:string;weight:number}[];onAnalyze:(args:AnalysisRequest,signal:AbortSignal)=>Promise<AnalysisResult>;openDiary:(person:string)=>void};
const sourceLabels={label:'จากฉลาก',estimate:'ค่าประมาณจาก ChatGPT',provided:'ตัวเลขที่ให้มา',manual:'กรอกเอง'};
const mealLabels:Record<string,string>={Breakfast:'เช้า',Lunch:'กลางวัน',Dinner:'เย็น',Snack:'ของว่าง'};
export default function HouseholdDashboard({profiles,entries,date,account,cloud,weights,onAnalyze,openDiary}:Props){
 const people=householdDay(profiles,entries,date);
 return <div className="dashboard-content household-dashboard">
  <div className="household-grid">{people.map(person=><PersonSnapshot key={person.profile.id} person={person} weights={weights}/>)}</div>
  <section className="household-coverage" aria-labelledby="coverage-title">
   <div className="household-section-heading"><div><span className="eyebrow">A CLEARER LITTLE PICTURE</span><h2 id="coverage-title">ตัวเลขนี้ ครบแค่ไหนแล้ว?</h2><p>ความครบของค่าโภชนาการในรายการที่บันทึก · ไม่ได้ยืนยันว่าบันทึกครบทั้งวัน</p></div><img src="/illustrations/salad-bowl-animated.svg" width="300" height="230" alt=""/></div>
   <div className="household-grid">{people.map(person=><PersonCoverage key={person.profile.id} person={person}/>)}</div>
   <p className="household-footnote"><Info size={15}/> ช่องว่างหมายถึงไม่ทราบ ไม่ใช่ศูนย์ · น้ำตาลรวมกับน้ำตาลอิสระเป็นคนละค่า · ที่มาของตัวเลขไม่ได้ยืนยันความแม่นยำ</p>
  </section>
  <div className="household-grid household-journals">{people.map(({profile,entries:meals})=><section key={profile.id} className="household-journal"><div className="household-journal-heading"><h2><Utensils size={18}/> มื้อของ{profile.name}</h2><button className="textbutton" onClick={()=>openDiary(profile.id)}>ดูรายละเอียด <ArrowUpRight size={15}/></button></div>{meals.length?<ul>{meals.map(meal=><li key={meal.id}><div><b>{meal.name}</b><span>{mealLabels[meal.meal]||meal.meal} · {sourceLabels[meal.nutrition_source==='chatgpt_estimate'?'estimate':meal.nutrition_source||'manual']}</span></div><span>{n(meal.calories)} <small>kcal</small></span></li>)}</ul>:<p className="household-empty">ยังไม่มีมื้อที่บันทึกในวันที่เลือก</p>}</section>)}</div>
  <div className="household-grid household-reflections">{people.map(({profile,entries:meals,goal,macros})=>{
   const snapshot=JSON.stringify([account,profile.id,date,profile.name,profile.goal,profile.macro_plan,goal,macros,meals.map(e=>[e.id,e.meal,e.name,e.calories,e.protein,e.carbs,e.fat,e.sodium_mg,e.total_sugar_g,e.free_sugar_g,e.nutrition_source])]);
   return <NutritionAnalysis key={snapshot} title={`มองภาพรวมของ${profile.name}`} name={profile.name} date={date} person={profile.id as 'new'|'ben'} mealCount={meals.length} cloud={cloud} onAnalyze={onAnalyze}/>;
  })}</div>
 </div>;
}

function PersonSnapshot({person,weights}:{person:HouseholdPerson;weights:Props['weights']}){
 const {profile,entries,totals,goal,macros}=person;
 const progress=Math.min(100,Math.max(0,totals.calories/Math.max(1,goal)*100));
 const latest=weights.filter(weight=>weight.profile_id===profile.id).sort((a,b)=>b.date.localeCompare(a.date))[0];
 const plan=macroOption(profile.macro_plan);
 return <section className={`person-snapshot person-${profile.id}`} aria-labelledby={`snapshot-${profile.id}`}>
  <header><div><span className="eyebrow">YOUR DAILY NOURISHMENT</span><h2 id={`snapshot-${profile.id}`}>{profile.name}<span>.</span></h2><p>{goalOption(profile.goal).description} · {plan.label}</p></div><span className="person-meal-count">{entries.length} รายการ</span></header>
  <div className="person-nutrition"><div className="person-energy-ring" role="img" aria-label={`${profile.name} บันทึกพลังงาน ${n(totals.calories)} จากเป้าหมาย ${n(goal)} kcal`}><svg viewBox="0 0 160 160" aria-hidden="true"><circle className="person-ring-track" cx="80" cy="80" r="68"/><circle className="person-ring-value" cx="80" cy="80" r="68" strokeDasharray={`${progress*4.2726} 427.26`}/></svg><div><span>พลังงานที่บันทึก</span><strong>{entries.length?n(totals.calories):'—'}</strong><small>เป้าหมาย {n(goal)} kcal</small></div></div>
   <div className="person-macros">{(['protein','carbs','fat'] as const).map(key=><div key={key} className={`person-macro ${key}`}><div><span>{{protein:'โปรตีน',carbs:'คาร์บ',fat:'ไขมัน'}[key]}</span><b>{entries.length?n(totals[key]):'—'} <small>/ {n(macros[key])} g</small></b></div><div className="person-macro-track" role="progressbar" aria-label={`${profile.name} · ${{protein:'โปรตีน',carbs:'คาร์บ',fat:'ไขมัน'}[key]}`} aria-valuemin={0} aria-valuemax={Math.max(macros[key],totals[key])} aria-valuenow={entries.length?totals[key]:undefined} aria-valuetext={!entries.length?'ยังไม่มีรายการที่บันทึก':`${n(totals[key])} จาก ${n(macros[key])} g`}><span style={{width:`${Math.min(100,totals[key]/Math.max(1,macros[key])*100)}%`}}/></div></div>)}</div>
  </div>
  <div className="person-snapshot-bottom"><span><Leaf size={15}/>{!entries.length?'ยังไม่มีข้อมูลในวันที่เลือก':totals.calories>goal?`สูงกว่าแผน ${n(totals.calories-goal)} kcal`:`ยอดที่บันทึกห่างจากเป้า ${n(goal-totals.calories)} kcal`}</span><span><Scale size={15}/>{n(latest?.weight??profile.weight)} kg <small>{latest?`ล่าสุด ${latest.date}`:'จากโปรไฟล์'}</small></span></div>
 </section>;
}

function PersonCoverage({person}:{person:HouseholdPerson}){
 const {profile,entries,coverage,sources,missing}=person;
 return <article className={`person-coverage person-${profile.id}`} aria-labelledby={`coverage-${profile.id}`}>
  <header><h3 id={`coverage-${profile.id}`}>{profile.name}</h3><span>{entries.length} รายการที่บันทึก</span></header>
  <div className="person-coverage-rows">{coverage.map(field=>{
   const limit=field.key==='sodium_mg'?2000:field.key==='free_sugar_g'?person.goal*.1/4:null;
   const reached=limit!==null&&field.value!==null&&field.value>=limit;
   return <div key={field.key} className={`person-coverage-row ${field.complete?'complete':'partial'}`}><div className="coverage-row-heading"><h4>{field.label}</h4><span className="coverage-state">{field.complete?<><Check size={13}/> ครบทุกรายการ</>:!entries.length?'ยังไม่มีรายการ':field.known?'มีข้อมูลบางส่วน':'ยังไม่มีค่า'}</span></div><div className="coverage-row-values"><p><b>{field.value===null?'—':n(field.value)}</b> <span>{field.unit}{field.value!==null&&!field.complete?' · ยอดเท่าที่ทราบ':''}</span></p><span>มีข้อมูล <b>{field.known}/{field.count}</b> รายการ</span></div><div className="coverage-track" role="progressbar" aria-label={`${profile.name} · ความครบของ${field.label}`} aria-valuemin={0} aria-valuemax={Math.max(1,field.count)} aria-valuenow={field.known} aria-valuetext={`${field.known} จาก ${field.count} รายการ${!entries.length?' ยังไม่มีมื้ออาหาร':''}`}><span style={{width:`${field.count?field.known/field.count*100:0}%`}}/></div><p className="coverage-row-note">{reached?`ยอดที่ทราบแตะเกณฑ์วางแผน ${n(limit!)} ${field.unit}${!field.complete?' แม้ยังมีค่าที่ไม่ทราบ':''}`:field.complete?'ครบเฉพาะรายการที่บันทึกในวันที่เลือก':!entries.length?'เริ่มบันทึกใน ChatGPT แล้วกลับมาดูได้เลย':`ยังไม่ทราบค่าอีก ${field.count-field.known} รายการ`}{field.estimated>0?` · มีค่าประมาณ ${field.estimated} รายการ`:''}</p></div>;
  })}</div>
  <div className="coverage-sources"><span className="eyebrow">ที่มาของตัวเลขอาหาร</span><div>{(Object.keys(sources) as (keyof typeof sources)[]).filter(key=>sources[key]>0).map(key=><span key={key}>{sourceLabels[key]} <b>{sources[key]}</b></span>)}{!entries.length&&<span>ยังไม่มีข้อมูล</span>}</div></div>
  {missing.length>0&&<details className="coverage-missing"><summary>ดูรายการที่ยังขาดข้อมูล ({missing.length}) <ChevronDown size={15}/></summary><ul>{missing.map(meal=><li key={meal.id}><b>{meal.name}</b><span>ยังไม่มี: {meal.fields.join(' · ')}</span></li>)}</ul></details>}
 </article>;
}
