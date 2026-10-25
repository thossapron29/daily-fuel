'use client';
import {useEffect,useState} from 'react';
import {Bot,Check,Users} from 'lucide-react';
import {FuelSignIn,GptFrame,useFuelAccount} from '../../gpt/account';
import {APP_ORIGIN} from '../../../lib/gpt-api';

type Authorization={client_id:string;redirect_uri:string;state:string;scope:string;challenge:string|null;resource:string|null};
export default function Consent({authorization}:{authorization:Authorization}){
 const {db,session,ready}=useFuelAccount();
 const [person,setPerson]=useState(''),[pair,setPair]=useState(false),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[available,setAvailable]=useState(false);
 useEffect(()=>{
  let cancelled=false;
  if(db&&session)(async()=>{
   try{
    const {data,error}=await db.rpc('gpt_bridge',{action:'connections',payload:{}});
    if(cancelled)return;
    const own=data?.clients?.find((c:{client_id:string})=>c.client_id===authorization.client_id);
    setAvailable(!error&&!!own);
    if(error||!own)setError('บัญชีนี้ยังไม่ได้เชื่อมกับ GPT ตัวนี้ กรุณาใช้บัญชี Daily Fuel ของนิวหรือเบ้นที่เชื่อมกันไว้');
    else{setError('');setPerson(own.person||'');setPair(own.active&&own.allow_partner)}
   }catch{if(!cancelled){setAvailable(false);setError('โหลดการเชื่อมต่อไม่ได้ กรุณาลองใหม่')}}
  })();
  return()=>{cancelled=true};
 },[db,session?.user.id,authorization.client_id]);

 function deny(){const url=new URL(authorization.redirect_uri);url.searchParams.set('error','access_denied');url.searchParams.set('iss',APP_ORIGIN);url.searchParams.set('state',authorization.state);window.location.assign(url.href)}
 return <GptFrame>{!ready?<p role="status">กำลังโหลดบัญชี…</p>:!session?<FuelSignIn db={db}/>:<section className="panel gpt-consent"><span className="small-icon cream"><Bot size={25}/></span><span className="eyebrow">CONNECT DAILY FUEL</span><h1>เชื่อม Plugin ให้ช่วยจดมื้อดี ๆ</h1><p>กำลังเชื่อม <b>Daily Fuel Plugin</b> กับบัญชี <b>{session.user.email}</b></p><ul className="gpt-permissions"><li><Check size={17}/> ดูรายชื่อผู้รับที่อนุญาต</li><li><Check size={17}/> เตรียมโภชนาการให้ตรวจก่อนบันทึก</li><li><Check size={17}/> เพิ่มมื้อเมื่อคุณกดยืนยันรายการบน Daily Fuel</li></ul>
 <form onSubmit={async event=>{event.preventDefault();if(!db||busy||!accepted||!available||!person)return;setBusy(true);setError('');try{const {data,error}=await db.rpc('gpt_bridge',{action:'authorize',payload:{client_id:authorization.client_id,redirect_uri:authorization.redirect_uri,scope:authorization.scope,challenge:authorization.challenge,resource:authorization.resource,person,allow_partner:pair}});if(error)throw error;const url=new URL(data.redirect_uri);if(url.href!==authorization.redirect_uri)throw new Error('Callback mismatch');url.searchParams.set('code',data.code);url.searchParams.set('iss',APP_ORIGIN);url.searchParams.set('state',authorization.state);window.location.assign(url.href)}catch{setError('อนุญาตไม่สำเร็จ ตรวจว่าบัญชีนี้เลือกชื่อตัวเอง และอีกบัญชีเลือกคนละชื่อ แล้วลองใหม่');setBusy(false)}}}>
 <fieldset disabled={busy}><label>บัญชีนี้เป็นของใคร?<select required value={person} onChange={event=>setPerson(event.target.value)}><option value="">เลือกตัวเอง</option><option value="new">นิว</option><option value="ben">เบ้น</option></select></label><label className="gpt-consent-check"><input type="checkbox" checked={pair} onChange={event=>setPair(event.target.checked)}/><span><b><Users size={15}/> อนุญาตบันทึกมื้อให้กัน</b><small>ให้บัญชีคู่ที่เชื่อมไว้เพิ่มมื้อให้บัญชีนี้ด้วย ทั้งสองคนต้องเปิดสิทธิ์นี้ จึงบันทึกพร้อมกันจากแชตเดียวได้</small></span></label><label className="gpt-consent-check gpt-required-consent"><input type="checkbox" required checked={accepted} onChange={event=>setAccepted(event.target.checked)}/><span>ให้ Daily Fuel Plugin เพิ่มมื้ออาหารตามสิทธิ์ข้างต้น เมื่อฉันยืนยันรายการบน Daily Fuel</span></label><button className="primary" disabled={busy||!accepted||!available||!person}>{busy?'กำลังเชื่อม…':'อนุญาตและกลับไป ChatGPT'}</button><button className="secondary" type="button" onClick={deny}>ยังไม่เชื่อมตอนนี้</button></fieldset></form>{error&&<p className="alert" role="alert">{error}</p>}<p className="field-help">เปลี่ยนหรือยกเลิกสิทธิ์ได้ที่หน้า <a href="/gpt">Daily Fuel Plugin</a></p><button className="textbutton" onClick={()=>db?.auth.signOut()}>เปลี่ยนบัญชี</button></section>}</GptFrame>;
}
