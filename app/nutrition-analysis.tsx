'use client';

import {useEffect,useId,useRef,useState} from 'react';
import {ArrowRight,Check,Leaf,MessageCircle,RefreshCw,Sparkles} from 'lucide-react';
import {analysisTopics,type AnalysisRequest,type AnalysisResult,type AnalysisTopic} from '../lib/nutrition-analysis';
import {nutritionNumber} from '../lib/nutrition-insights';

type Props={title?:string;name:string;date:string;mealCount:number;cloud:boolean;onAnalyze:(args:AnalysisRequest,signal:AbortSignal)=>Promise<AnalysisResult>;person:'new'|'ben'};
export default function NutritionAnalysis({title='มองภาพรวมไปด้วยกัน',name,date,mealCount,cloud,onAnalyze,person}:Props){
 const titleId=useId();
 const [results,setResults]=useState<Partial<Record<AnalysisTopic,AnalysisResult>>>({});
 const [selected,setSelected]=useState<AnalysisTopic>('overview');
 const [busy,setBusy]=useState<AnalysisTopic|null>(null);
 const [error,setError]=useState('');
 const [failedTopic,setFailedTopic]=useState<AnalysisTopic>('overview');
 const controller=useRef<AbortController|null>(null);
 const heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 const result=results[selected];
 const dateText=new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'long',year:'numeric',calendar:'gregory'}).format(new Date(date+'T12:00:00'));
 async function analyze(topic:AnalysisTopic){
  if(busy)return;
  setError('');
  if(results[topic]){setSelected(topic);return}
  const abort=new AbortController();controller.current=abort;setBusy(topic);
  try{
   const value=await onAnalyze({date,person,topic},abort.signal);
   if(abort.signal.aborted)return;
   setResults(previous=>({...previous,[topic]:value}));setSelected(topic);
   requestAnimationFrame(()=>heading.current?.focus({preventScroll:true}));
  }catch(error){if(!abort.signal.aborted){setFailedTopic(topic);setError(error instanceof Error?error.message:'วิเคราะห์ไม่สำเร็จ ลองอีกครั้งได้ครับ')}}
  finally{if(!abort.signal.aborted)setBusy(null)}
 }
 const unavailable=!cloud?'เข้าสู่ระบบเพื่อวิเคราะห์มื้อที่บันทึกในบัญชีของคุณ':!mealCount?'ยังไม่มีมื้ออาหารในวันที่เลือก เพิ่มมื้อแล้วกลับมาวิเคราะห์ได้เลย':'';
 return <section className="daily-analysis-card" aria-labelledby={titleId}>
  <div className="reflection-heading">
   <div className="reflection-intro"><span className="eyebrow">A MOMENT TO REFLECT</span><h2 id={titleId}>{title}<span>.</span></h2><p>โภชนาการของ{name} · {dateText}</p></div>
   <span className="reflection-mark" aria-hidden="true"><Sparkles size={25} strokeWidth={1.5}/></span>
  </div>
  {!result&&<div className="reflection-start"><div><h3>ให้มื้อที่บันทึกช่วยบอกทางมื้อถัดไป</h3><p>ดูภาพรวมพลังงานและสารอาหารเทียบกับเป้าหมาย พร้อมไอเดียเล็ก ๆ ที่นำไปใช้ต่อได้</p></div><button type="button" className="primary" disabled={!!busy||!!unavailable} onClick={()=>analyze('overview')}><Sparkles size={17}/>{busy?'กำลังวิเคราะห์…':'วิเคราะห์วันที่เลือก'}{!busy&&<ArrowRight size={17}/>}</button></div>}
  {unavailable&&<p className="reflection-notice">{unavailable}</p>}
  <p className="reflection-status" role="status">{busy?'กำลังอ่านมื้ออาหารและเทียบกับเป้าหมายของคุณ…':result&&!error?'วิเคราะห์เรียบร้อยแล้ว':''}</p>
  {error&&<div className="reflection-error" role="alert"><p>{error}</p><button className="textbutton" type="button" disabled={!!busy} onClick={()=>analyze(failedTopic)}><RefreshCw size={15}/> ลองอีกครั้ง</button></div>}
  {result&&<div className="reflection-result" aria-busy={!!busy}>
   <div className="reflection-summary"><span className="reflection-label"><Check size={14}/> จากมื้อที่บันทึก {result.context.meal_count} รายการ</span><h3 ref={heading} tabIndex={-1}>{selected==='overview'?'ภาพรวมของวันที่เลือก':analysisTopics[selected]}</h3><p>{result.analysis.summary}</p></div>
   <dl className="reflection-metrics">{(['calories','protein','carbs','fat'] as const).map(key=>{const item=result.context.comparison[key];return <div key={key}><dt>{{calories:'พลังงาน',protein:'โปรตีน',carbs:'คาร์บ',fat:'ไขมัน'}[key]}</dt><dd><b>{nutritionNumber(item.consumed)}</b><span> / {nutritionNumber(item.target)} {key==='calories'?'kcal':'g'}</span></dd></div>})}</dl>
   <div className="reflection-observations">{result.analysis.observations.map((item,index)=><article key={index}><span className="reflection-number">0{index+1}</span><div><h4>{item.title}</h4><p>{item.detail}</p></div></article>)}</div>
   <div className="reflection-next"><Leaf size={20}/><div><h4>ลองต่ออีกนิด</h4><p>{result.analysis.next_step}</p></div></div>
   <p className="reflection-data-note">เทียบกับเป้าหมายปัจจุบัน · ข้อมูลเฉพาะมื้อที่บันทึก{result.context.estimated_count>0?` · มีค่าประมาณ ${result.context.estimated_count} รายการ`:''}{!result.context.optional_nutrients.sodium_mg.complete||!result.context.optional_nutrients.free_sugar_g.complete?' · ข้อมูลโซเดียมหรือน้ำตาลอิสระยังไม่ครบทุกมื้อ':''}</p>
   <div className="reflection-followups"><span><MessageCircle size={16}/> ลองดูต่อ</span><div>{(Object.keys(analysisTopics) as AnalysisTopic[]).map(topic=><button key={topic} type="button" className="secondary" aria-pressed={selected===topic} disabled={!!busy} onClick={()=>analyze(topic)}>{busy===topic?'กำลังวิเคราะห์…':analysisTopics[topic]}</button>)}</div></div>
  </div>}
  <p className="reflection-privacy">เมื่อกดวิเคราะห์ มื้ออาหารและเป้าหมายของคนและวันที่เลือกจะส่งให้ OpenAI เพื่อสร้างคำแนะนำทั่วไป ผลจาก AI อาจคลาดเคลื่อนได้</p>
 </section>;
}
