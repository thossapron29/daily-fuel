'use client';
import {useEffect,useState} from 'react';
import type {Session,SupabaseClient} from '@supabase/supabase-js';
import {Flame,ArrowLeft,LockKeyhole} from 'lucide-react';
import {getSupabase} from '../../lib/data';

export function useFuelAccount(){
 const [db,setDb]=useState<SupabaseClient|null>(null),[session,setSession]=useState<Session|null>(null),[ready,setReady]=useState(false);
 useEffect(()=>{
  const client=getSupabase();setDb(client);if(!client){setReady(true);return}
  const {data:{subscription}}=client.auth.onAuthStateChange((_,value)=>{setSession(value);setReady(true)});
  return()=>subscription.unsubscribe();
 },[]);
 return {db,session,ready};
}
export function GptFrame({children}:{children:React.ReactNode}){
 return <main className="gpt-page"><header className="gpt-header"><a href="/" className="brand"><span className="brand-mark"><Flame size={23}/></span>daily<span>fuel</span><i>.</i></a><a href="/" className="textbutton"><ArrowLeft size={15}/> กลับ Daily Fuel</a></header>{children}</main>;
}
export function FuelSignIn({db}:{db:SupabaseClient|null}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <section className="panel gpt-login"><span className="small-icon cream"><LockKeyhole size={23}/></span><h1>เชื่อมบัญชีของคุณ</h1><p>ใช้บัญชีเดียวกับที่ล็อกอิน Daily Fuel อยู่ เพื่อบันทึกเข้าบัญชีของตัวเอง</p><form onSubmit={async event=>{event.preventDefault();if(!db||busy)return;setBusy(true);setError('');try{const {error}=await db.auth.signInWithPassword({email:email.trim(),password});if(error)setError('เข้าสู่ระบบไม่สำเร็จ ตรวจสอบอีเมล รหัสผ่าน และการยืนยันอีเมล');else setPassword('')}catch{setError('เชื่อมต่อไม่ได้ กรุณาลองอีกครั้ง')}finally{setBusy(false)}}}>
  <label>Email<input required type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)}/></label><label>Password<input required type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)}/></label><button className="primary" disabled={busy||!db}>{busy?'กำลังเข้าสู่ระบบ…':'เข้าสู่ระบบ'}</button>
 </form>{!db&&<p role="alert">ยังเชื่อมต่อบัญชีไม่ได้ กรุณาลองใหม่ภายหลัง</p>}{error&&<p className="alert" role="alert">{error}</p>}</section>;
}
