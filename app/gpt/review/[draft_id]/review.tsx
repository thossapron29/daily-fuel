'use client';
import {useCallback,useEffect,useState} from 'react';
import {Check,ClipboardCheck,RefreshCw} from 'lucide-react';
import {ExtraNutritionSummary} from '../../../nutrition-awareness';
import type {ExtraNutrition} from '../../../../lib/nutrition-insights';
import {FuelSignIn,GptFrame,useFuelAccount} from '../../account';
type Meal=ExtraNutrition&{recipient_name:string;person:string;date:string;meal:string;name:string;calories:number;protein:number;carbs:number;fat:number;nutrition_source:string};
type Draft={draft_id:string;status:string;replayed?:boolean;entries:Meal[]};
const number=(n:number)=>n.toLocaleString('th-TH',{maximumFractionDigits:2});
export default function MealReview({draftId}:{draftId:string}){
 const {db,session,ready}=useFuelAccount();
 const [draft,setDraft]=useState<Draft|null>(null),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=useCallback(async()=>{if(!db||!session)return;setLoading(true);setError('');try{const {data,error}=await db.rpc('gpt_bridge',{action:'review_mcp_draft',payload:{draft_id:draftId}});if(error)throw error;setDraft(data)}catch{setError('ยังเปิดรายการไม่ได้ โปรดใช้บัญชี Daily Fuel เดียวกับที่เชื่อม Plugin แล้วลองอีกครั้ง')}finally{setLoading(false)}},[db,session?.user.id,draftId]);
 useEffect(()=>{setDraft(null);load()},[load]);
 const recorded=draft?.status==='recorded',expired=draft?.status==='expired';
 return <GptFrame>{!ready?<p role="status">กำลังโหลดบัญชี…</p>:!session?<FuelSignIn db={db}/>:<>
  <section className="gpt-hero"><div><span className="eyebrow">ONE REVIEW, TWO HAPPY PLATES</span><h1>{recorded?'บันทึกมื้อแล้ว':'ตรวจมื้อก่อนบันทึก'}<span>.</span></h1><p>{recorded?'ยอดถูกเพิ่มแยกตามโปรไฟล์ของแต่ละคนแล้ว':'ตรวจชื่อคน วันที่ และโภชนาการให้ตรงกับส่วนที่กินจริง'}</p><span className="gpt-account-label">บัญชีที่ใช้ยืนยัน: {session.user.email}</span></div><span className="gpt-hero-icon"><ClipboardCheck size={43}/></span></section>
  {loading&&<p role="status">กำลังโหลดรายการ…</p>}
  {draft&&<><div className="gpt-review-grid">{draft.entries.map((meal,index)=><section key={index} className="panel gpt-review-card"><span className="pill">{meal.recipient_name}</span><h2>{meal.name}</h2><p>{meal.date} · {meal.meal}</p><div className="gpt-review-energy"><b>{number(meal.calories)}</b><span>kcal</span></div><div className="gpt-review-macros">{(['protein','carbs','fat'] as const).map((key,i)=><div key={key}><span>{['โปรตีน','คาร์บ','ไขมัน'][i]}</span><b>{number(meal[key])}<small> g</small></b></div>)}</div><ExtraNutritionSummary meal={meal}/><p className="field-help">{meal.nutrition_source==='chatgpt_estimate'?'ประมาณจาก ChatGPT':meal.nutrition_source==='label'?'ข้อมูลจากฉลาก':'ตัวเลขที่ให้มา'}</p></section>)}</div>
   <section className="panel gpt-review-action">{recorded?<><span className="small-icon sage"><Check size={24}/></span><h2>{draft.replayed?'รายการนี้บันทึกไว้แล้ว':'เรียบร้อยแล้ว'}</h2><p>กลับไปแชตเดิม แล้วบอก Plugin ว่า “ยืนยันแล้ว” เพื่อตรวจใบรับ การเปิดหรือยืนยันรายการเดิมซ้ำจะไม่เพิ่มมื้อซ้ำ</p><a href="/" className="secondary">กลับ Daily Fuel</a></>:expired?<><h2>รายการหมดอายุแล้ว</h2><p>กลับไปให้ Plugin เตรียมรายการใหม่ แล้วตรวจและยืนยันอีกครั้ง</p></>:<><p>กดครั้งเดียวบันทึก{draft.entries.length===2?'ให้ทั้งสองคนพร้อมกัน':'มื้อนี้'} ถ้าสิทธิ์ของผู้รับไม่ครบ จะไม่บันทึกครึ่งเดียว</p><button className="primary" disabled={busy} onClick={async()=>{if(!db||busy)return;setBusy(true);setError('');try{const {data,error}=await db.rpc('gpt_bridge',{action:'approve_mcp_draft',payload:{draft_id:draftId}});if(error)throw error;setDraft(data)}catch(error){const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';setError(code==='42501'?'สิทธิ์ของผู้รับเปลี่ยนไป โปรดกลับไปตรวจการอนุญาตและเตรียมรายการใหม่':'ยังตรวจผลไม่ได้ ลองกดยืนยันรายการเดิมอีกครั้ง ระบบจะไม่เพิ่มมื้อซ้ำ')}finally{setBusy(false)}}}><Check size={18}/>{busy?'กำลังบันทึก…':draft.entries.length===2?'ยืนยันบันทึกทั้ง 2 คน':'ยืนยันบันทึกมื้อนี้'}</button><p className="field-help">ถ้าต้องแก้ข้อมูล กลับไปให้ Plugin เตรียมรายการใหม่ก่อนยืนยัน</p></>}</section>
  </>}
  {error&&<p className="alert" role="alert">{error}</p>}<div className="gpt-review-footer"><button className="textbutton" disabled={loading||busy} onClick={load}><RefreshCw size={14}/> ตรวจรายการอีกครั้ง</button><button className="textbutton" disabled={busy} onClick={()=>db?.auth.signOut()}>เปลี่ยนบัญชี</button></div>
 </>}</GptFrame>;
}
