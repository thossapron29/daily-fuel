'use client';
import {useEffect,useRef,useState} from 'react';
import {BellRing,ArrowUpRight,Info,ChevronDown,X,Droplets,Candy} from 'lucide-react';
import type {Entry} from '../lib/data';
import {dailyNutritionNotices,freshNoticeKeys,extraTotals,extraNutrientFields,known,nutritionNumber as n,type ExtraNutrition} from '../lib/nutrition-insights';

export function NutritionAlerts({entries,goal,macros,scope,name,onDiary}:{entries:Entry[];goal:number;macros:{carbs:number;fat:number};scope:string;name:string;onDiary:()=>void}){
 const notices=dailyNutritionNotices(entries,goal,macros);
 const signature=notices.map(item=>item.key).join(',');
 const [toast,setToast]=useState(false);
 const memory=useRef(new Map<string,Set<string>>());
 const previousEffect=useRef<string|null>(null);
 const hasLimit=notices.some(item=>item.kind==='limit');
 useEffect(()=>{
  const effectKey=`${scope}|${signature}`;
  if(previousEffect.current===effectKey)return;
  previousEffect.current=effectKey;
  setToast(false);
  const storageKey=`dailyfuel:notice:${scope}`;
  let seen=memory.current.get(scope)||new Set<string>();
  try{const saved=JSON.parse(sessionStorage.getItem(storageKey)||'[]');if(Array.isArray(saved))seen=new Set(saved.filter(value=>typeof value==='string'))}catch{}
  const keys=signature.split(',').filter(Boolean);
  if(freshNoticeKeys(notices,seen).length)setToast(true);
  keys.forEach(key=>seen.add(key));memory.current.set(scope,seen);
  try{sessionStorage.setItem(storageKey,JSON.stringify([...seen]))}catch{}
 },[scope,signature]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(false),5000);return()=>clearTimeout(timer)},[toast]);
 if(!notices.length)return null;
 const title=hasLimit?'มีสารอาหารที่แตะเกณฑ์วันนี้':'วันนี้มีบางอย่างสูงกว่าแผน';
 const tip=hasLimit?(notices.some(item=>item.key==='sodium_mg')?'มื้อถัดไปลองแยกน้ำจิ้มและชิมก่อนเติมเครื่องปรุง':'มื้อถัดไปลองเลือกเครื่องดื่มไม่หวาน และเช็กน้ำตาลในซอส'):'เก็บไว้ช่วยเลือกปริมาณมื้อถัดไป วันนี้ยังดูแลตัวเองต่อได้';
 return <><section className={`nutrition-alert-strip ${hasLimit?'limit':'plan'}`} aria-labelledby="nutrition-alert-title"><span className="nutrition-alert-icon"><BellRing size={22}/></span><div className="nutrition-alert-copy"><span className="eyebrow">A SMALL CHECK-IN · {name}</span><h2 id="nutrition-alert-title">{title}</h2><div className="nutrition-alert-chips">{notices.map(item=><span key={item.key}><ArrowUpRight size={14}/>{item.label} {item.value>item.goal?`+${n(item.value-item.goal)} ${item.unit}`:'ถึงเกณฑ์'}{item.partial?' · ข้อมูลบางส่วน':''}</span>)}</div><p>{tip}</p></div><button className="secondary" onClick={onDiary}>ดูมื้อที่บันทึก <ArrowUpRight size={15}/></button></section>
 {toast&&<aside className={`nutrition-toast ${hasLimit?'limit':''}`} role={hasLimit?'alert':'status'} aria-atomic="true"><BellRing size={23}/><div><b>{name} · {title}</b><p>{notices.slice(0,3).map(item=>`${item.label} ${item.value>item.goal?`+${n(item.value-item.goal)} ${item.unit}`:'ถึงเกณฑ์'}`).join(' · ')}</p><small>ดูรายละเอียดได้ในแถบสรุปวันนี้</small></div><button className="icon-button" aria-label="ปิดการแจ้งเตือนโภชนาการ" onClick={()=>setToast(false)}><X size={18}/></button></aside>}
 </>;
}

export default function DailyExtras({entries,goal}:{entries:Entry[];goal:number}){
 const fields=[{key:'sodium_mg',label:'โซเดียม',unit:'mg',limit:2000,icon:Droplets},{key:'free_sugar_g',label:'น้ำตาลอิสระ',unit:'g',limit:goal*.1/4,icon:Candy},{key:'total_sugar_g',label:'น้ำตาลรวม',unit:'g',limit:null,icon:Candy}] as const;
 return <section className="daily-extras panel" aria-labelledby="daily-extras-title"><div className="section-heading"><div><span className="eyebrow">THE LITTLE THINGS ADD UP</span><h3 id="daily-extras-title">รู้เพิ่มอีกนิด ดูแลได้ตรงขึ้น</h3><p>น้ำตาลและโซเดียมของส่วนที่กินจริง</p></div><span className="pill"><Info size={14}/> เท่าที่มีข้อมูล</span></div><div className="daily-extras-grid">{fields.map(({key,label,unit,limit,icon:Icon})=>{
  const total=extraTotals(entries,key),value=total.value;
  const over=limit!==null&&value!==null&&value>=limit;
  const near=limit!==null&&value!==null&&!over&&value>=limit*.8;
  return <article key={key} className={`extra-nutrient ${over?'over':near?'near':''}`}><div className="extra-nutrient-title"><span><Icon size={17}/>{label}</span><span className="extra-status">{over?'แตะ / เกินเกณฑ์':near?'ใกล้เกณฑ์':value===null?'ยังไม่มีข้อมูล':total.complete?(limit?'ต่ำกว่าเกณฑ์':'บันทึกครบ'):'บันทึกบางส่วน'}</span></div><div className="extra-nutrient-value"><b>{value===null?'—':n(value)}</b><span>{unit}{limit!==null&&<> / {n(limit)} {unit}</>}</span></div>{limit!==null&&<div className="extra-track" role="progressbar" aria-label={`${label}เท่าที่บันทึก`} aria-valuemin={0} aria-valuemax={Math.max(limit,value||0)} aria-valuenow={value??undefined} aria-valuetext={value===null?'ยังไม่มีข้อมูล':`${n(value)} จาก ${n(limit)} ${unit}${!total.complete?' ข้อมูลยังไม่ครบ':''}`}><span style={{width:value===null?'0%':`${Math.min(100,value/limit*100)}%`}}/></div>}<p className="extra-coverage">{value===null?'ไม่ได้กรอก ≠ 0':`มีข้อมูล ${total.known}/${total.count} รายการ${!total.complete?' · ยังรวมไม่ครบ':''}`}</p><p className="extra-context">{entries.some(entry=>known(entry[key])&&entry.nutrition_source==='chatgpt_estimate')&&<><span>มีค่าประมาณจาก ChatGPT</span><br/></>}{key==='sodium_mg'?'เกณฑ์วางแผนผู้ใหญ่: ต่ำกว่า 2,000 mg/วัน':key==='free_sugar_g'?'เกณฑ์วางแผน: ต่ำกว่า 10% ของเป้าพลังงาน':'รวมทั้งน้ำตาลตามธรรมชาติ · ไม่เทียบกับเกณฑ์น้ำตาลอิสระ'}</p></article>;
 })}</div><details className="nutrition-reference"><summary>เข้าใจตัวเลขและค่าประมาณ <ChevronDown size={15}/></summary><p>น้ำตาลอิสระคือน้ำตาลเติม รวมถึงในน้ำผึ้ง น้ำเชื่อม และน้ำผลไม้ ไม่รวมน้ำตาลในผลไม้ทั้งชิ้นหรือนม ค่าเผื่อคำนวณจากเป้าพลังงานของโปรไฟล์เพื่อช่วยวางแผน ตามแนวทาง WHO ที่แนะนำให้ต่ำกว่า 10% ของพลังงานต่อวัน</p><p>ChatGPT ประมาณให้ได้ โดยเฉพาะเมื่อทราบยี่ห้อ ปริมาณซอสและเครื่องปรุง หากมีฉลากให้ใช้ฉลากก่อน มื้อที่ไม่ทราบค่าจะเว้นว่าง และยอดบางส่วนยังบอกไม่ได้ว่าทั้งวันต่ำกว่าเกณฑ์ หากมีเกณฑ์เฉพาะจากผู้ดูแลสุขภาพให้ยึดเกณฑ์นั้น</p><a href="https://www.who.int/news-room/fact-sheets/detail/healthy-diet" target="_blank" rel="noreferrer">อ้างอิงเกณฑ์ WHO <ArrowUpRight size={13}/></a></details></section>;
}

export function ExtraNutritionSummary({meal}:{meal:ExtraNutrition}){
 const hasValues=extraNutrientFields.some(({key})=>known(meal[key]));
 return <details className="entry-extra-nutrition" open={hasValues||undefined}><summary>น้ำตาล / โซเดียม{!hasValues?' · ยังไม่มีข้อมูล':''}</summary><dl>{extraNutrientFields.map(({key,label,unit})=><div key={key}><dt>{label}</dt><dd>{known(meal[key])?`${n(meal[key])} ${unit}`:'ไม่ทราบ'}</dd></div>)}</dl></details>;
}
