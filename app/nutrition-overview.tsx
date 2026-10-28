'use client';
import {useMemo,useState} from 'react';
import {ArrowRight,ChevronLeft,ChevronRight,Leaf} from 'lucide-react';
import type {Entry,Profile} from '../lib/data';
import {target,macroTargets} from '../lib/nutrition';
import {dailyTotals,dateAt,monthDates,periodSummary,shiftDays,shiftMonth,weekDates,type DayTotal} from '../lib/overview';

const number=(value:number)=>new Intl.NumberFormat('th-TH',{maximumFractionDigits:1}).format(value);
const dateLabel=(date:string,options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('th-TH',{...options,timeZone:'UTC'}).format(dateAt(date));
const weekday=['จ.','อ.','พ.','พฤ.','ศ.','ส.','อา.'];
function Rings({total,goal,proteinGoal}:{total?:DayTotal;goal:number;proteinGoal:number}){
 const energy=total?Math.min(100,total.calories/Math.max(1,goal)*100):0;
 const protein=total?Math.min(100,total.protein/Math.max(1,proteinGoal)*100):0;
 return <svg className="overview-rings" viewBox="0 0 60 60" aria-hidden="true"><circle className="ring-track" cx="30" cy="30" r="25"/>{energy>0&&<circle className="ring-energy" cx="30" cy="30" r="25" pathLength="100" strokeDasharray={`${energy} 100`}/>}<circle className="ring-track inner" cx="30" cy="30" r="17"/>{protein>0&&<circle className="ring-protein" cx="30" cy="30" r="17" pathLength="100" strokeDasharray={`${protein} 100`}/>} {total&&total.calories>goal&&<circle className="ring-over-dot" cx="55" cy="30" r="3"/>}</svg>
}
export default function NutritionOverview({entries,profile,day,setDay,openDay}:{entries:Entry[];profile:Profile;day:string;setDay:(day:string)=>void;openDay:()=>void}){
 const [period,setPeriod]=useState<'week'|'month'>('week');
 const totals=useMemo(()=>dailyTotals(entries,profile.id),[entries,profile.id]);
 const dates=period==='week'?weekDates(day):monthDates(day);
 const summary=periodSummary(dates,totals),selected=totals.get(day),goal=target(profile),proteinGoal=macroTargets(profile).protein;
 const monthOffset=(dateAt(dates[0]).getUTCDay()+6)%7;
 const periodTitle=period==='week'?`${dateLabel(dates[0],{day:'numeric',month:'short'})} – ${dateLabel(dates[6],{day:'numeric',month:'short',year:'numeric'})}`:dateLabel(day,{month:'long',year:'numeric'});
 const selectLabel=(date:string)=>{const value=totals.get(date);return `${dateLabel(date,{day:'numeric',month:'long',year:'numeric'})} ${value?`บันทึก ${value.count} มื้อ พลังงาน ${number(value.calories)} จาก ${number(goal)} กิโลแคลอรี โปรตีน ${number(value.protein)} จาก ${number(proteinGoal)} กรัม${value.calories>goal?' พลังงานสูงกว่าเป้าหมาย':''}`:'ไม่มีข้อมูลที่บันทึก'}`};
 return <div className="overview-layout">
  <section className="overview-main" aria-labelledby="overview-title">
   <div className="overview-top"><div><span className="eyebrow">A LITTLE AT A TIME</span><h2 id="overview-title">Your nourishment, in view.</h2><p>ทุกวันที่บันทึก คืออีกก้าวของการดูแลตัวเอง</p></div><div className="overview-segment" aria-label="ช่วงเวลาสรุป"><button type="button" aria-pressed={period==='week'} onClick={()=>setPeriod('week')}>สัปดาห์</button><button type="button" aria-pressed={period==='month'} onClick={()=>setPeriod('month')}>เดือน</button></div></div>
   <div className="overview-period"><div><span>{period==='week'?'WEEKLY OVERVIEW':'MONTHLY OVERVIEW'}</span><h3>{periodTitle}</h3></div><div className="overview-arrows"><button aria-label={period==='week'?'สัปดาห์ก่อนหน้า':'เดือนก่อนหน้า'} onClick={()=>setDay(period==='week'?shiftDays(day,-7):shiftMonth(day,-1))}><ChevronLeft size={18}/></button><button aria-label={period==='week'?'สัปดาห์ถัดไป':'เดือนถัดไป'} onClick={()=>setDay(period==='week'?shiftDays(day,7):shiftMonth(day,1))}><ChevronRight size={18}/></button></div></div>
   <div className="overview-calendar"><div className="overview-weekdays">{weekday.map(label=><span key={label}>{label}</span>)}</div><div className={`overview-days ${period==='month'?'monthly':'weekly'}`}>{period==='month'&&Array.from({length:monthOffset},(_,i)=><span key={`blank-${i}`}/>)}{dates.map(date=>{const total=totals.get(date);return <button key={date} className={`overview-date ${date===day?'active':''} ${total?'has-data':'no-data'}`} onClick={()=>setDay(date)} aria-label={selectLabel(date)} aria-pressed={date===day}><Rings total={total} goal={goal} proteinGoal={proteinGoal}/><span>{dateAt(date).getUTCDate()}</span>{total&&total.calories>goal&&<span className="overview-over-text">เกินเป้า</span>}</button>})}</div></div>
   <div className="overview-legend"><span><i className="legend-energy"/> พลังงาน</span><span><i className="legend-protein"/> โปรตีน</span><span><i className="legend-empty"/> ไม่มีบันทึก</span><span><i className="legend-over"/> พลังงานเกินเป้า</span></div>
   <p className="overview-footnote">วงแสดงยอดที่บันทึกเทียบเป้าหมายปัจจุบัน · วงไม่เต็มอาจหมายถึงบันทึกยังไม่ครบ</p>
  </section>
  <aside className="overview-side"><section className="overview-summary"><span className="eyebrow">THE BIGGER PICTURE</span><h3>ค่อยๆ ดูแล ไปด้วยกัน</h3><p>ภาพรวม{period==='week'?'สัปดาห์':'เดือน'}นี้ของ{profile.name}</p><div className="overview-stat"><span>วันที่มีบันทึก</span><strong>{summary.days}<small> / {dates.length} วัน</small></strong></div><div className="overview-stat"><span>พลังงานเฉลี่ย</span><strong>{summary.calories===null?'—':number(summary.calories)}<small> kcal / วัน</small></strong></div><div className="overview-stat"><span>โปรตีนเฉลี่ย</span><strong>{summary.protein===null?'—':number(summary.protein)}<small> g / วัน</small></strong></div><p className="overview-summary-note"><Leaf size={15}/> ค่าเฉลี่ยคิดเฉพาะวันที่มีบันทึก และอาจไม่ครบทุกมื้อ</p></section>
   <section className="overview-selected"><span className="eyebrow">A CLOSER LOOK</span><h3>{dateLabel(day,{day:'numeric',month:'long',year:'numeric'})}</h3>{selected?<><p>{selected.count} รายการที่บันทึก</p><div className="overview-selected-numbers"><div><span>พลังงาน</span><b>{number(selected.calories)} <small>/ {number(goal)} kcal</small></b>{selected.calories>goal&&<em>สูงกว่าเป้า {number(selected.calories-goal)} kcal</em>}</div><div><span>โปรตีน</span><b>{number(selected.protein)} <small>/ {number(proteinGoal)} g</small></b></div></div></>:<p>ยังไม่มีข้อมูลมื้ออาหารที่บันทึกในวันนี้</p>}<button onClick={openDay}>ดูรายละเอียดวันที่เลือก <ArrowRight size={16}/></button></section>
  </aside>
 </div>
}
