import {authorizationParams,ApiError} from '../../../lib/gpt-api';
import {bridge} from '../../../lib/gpt-server';
import Consent from './consent';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 try{const input=await searchParams,params=new URLSearchParams();for(const [key,value] of Object.entries(input)){if(Array.isArray(value))value.forEach(v=>params.append(key,v));else if(value!==undefined)params.set(key,value)}
  const authorization=authorizationParams(params);await bridge('metadata',{client_id:authorization.client_id,redirect_uri:authorization.redirect_uri});return <Consent authorization={authorization}/>;
 }catch(error){return <main className="gpt-page"><section className="panel gpt-consent"><h1>ยังเชื่อม GPT ไม่ได้</h1><p>{error instanceof ApiError?error.message:'ตรวจสอบลิงก์เชื่อมบัญชีแล้วลองใหม่'}</p><a className="secondary" href="/gpt">กลับไปตั้งค่า Daily Fuel GPT</a></section></main>}
}
