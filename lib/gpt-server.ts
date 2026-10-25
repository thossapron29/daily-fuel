import {ApiError} from './gpt-api';

export const noStore={'Cache-Control':'no-store','Pragma':'no-cache','Referrer-Policy':'no-referrer'};
export async function bridge(action:string,payload:Record<string,unknown>){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new ApiError(503,'unavailable','Daily Fuel is not configured');
 let response:Response;
 try{response=await fetch(`${url.replace(/\/$/,'')}/rest/v1/rpc/gpt_bridge`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({action,payload}),cache:'no-store',signal:AbortSignal.timeout(12000)})}
 catch{throw new ApiError(503,'unavailable','Connection unavailable; retry with the same request or draft ID')}
 const data=await response.json();
 if(!response.ok){
  const mapping:Record<string,[number,string,string]>={
   '28000':[401,'unauthorized','Connection expired or revoked; reconnect Daily Fuel'],
   '42501':[403,'forbidden','The recipient has not authorized this action, or permission changed'],
   '23505':[409,'idempotency_conflict','This request ID was already used with different meal data'],
   'P0002':[404,'not_found','Draft not found for this connection'],
   '22023':[400,'invalid_request',data.message||'Invalid request'],
   '22P02':[400,'invalid_request','Invalid identifier or value'],
   '22007':[400,'invalid_request','Invalid date'], '22008':[400,'invalid_request','Invalid date'],
  };
  const [status,code,message]=mapping[data.code]||[503,'unavailable','Daily Fuel could not complete this operation; retry with the same ID'];
  throw new ApiError(status,code,message);
 }
 return data;
}
export async function jsonBody(request:Request,max=16000){
 const text=await request.text();if(Buffer.byteLength(text,'utf8')>max)throw new ApiError(413,'invalid_request','Request is too large');
 try{return JSON.parse(text)}catch{throw new ApiError(400,'invalid_request','Expected JSON')}
}
export function errorResponse(error:unknown){
 const e=error instanceof ApiError?error:new ApiError(503,'unavailable','Daily Fuel could not complete this operation');
 return Response.json({error:e.code,message:e.message},{status:e.status,headers:{...noStore,...(e.status===401?{'WWW-Authenticate':'Bearer realm="Daily Fuel"'}:{})}});
}
// Best-effort instance-local throttle; authentication and durable idempotency live in Postgres.
const recent=new Map<string,number[]>();
export function throttle(request:Request){
 const now=Date.now(),ip=request.headers.get('x-forwarded-for')?.split(',')[0].trim()||'unknown';
 for(const [key,times] of recent)if(!times.some(t=>now-t<60000))recent.delete(key);
 const times=(recent.get(ip)||[]).filter(t=>now-t<60000);
 if(times.length>=60)throw new ApiError(429,'rate_limited','Try again in a minute');
 recent.set(ip,[...times,now]);
}
