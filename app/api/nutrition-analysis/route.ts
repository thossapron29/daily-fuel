import {createHash} from 'node:crypto';
import {analysisInstructions,analysisSchema,analysisTopics,buildAnalysisContext,parseAnalysisOutput,parseAnalysisRequest,type AnalysisMeal,type AnalysisResult} from '../../../lib/nutrition-analysis';
import {validateNutritionProfile,type Profile} from '../../../lib/nutrition';

export const runtime='nodejs';
export const maxDuration=60;
// Bounded, short-lived process caches. No nutrition or model output is persisted.
const cache=new Map<string,{expires:number;result:AnalysisResult}>();
const recent=new Map<string,number[]>();
const active=new Set<string>();
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});

export async function POST(request:Request){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
 if(!token)return reply({error:'กรุณาเข้าสู่ระบบก่อนวิเคราะห์'},401);
 if(!url||!key)return reply({error:'ยังไม่ได้ตั้งค่าบัญชีสำหรับวิเคราะห์'},503);
 let args;
 try{const body=await request.text();if(body.length>512)throw new Error('คำขอยาวเกินไป');args=parseAnalysisRequest(JSON.parse(body))}catch{return reply({error:'ตรวจสอบวันที่ โปรไฟล์ และหัวข้อที่เลือก'},400)}
 const headers={apikey:key,Authorization:`Bearer ${token}`};
 const base=url.replace(/\/$/,'');
 let owner:string;
 try{
  const auth=await fetch(`${base}/auth/v1/user`,{headers,cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(auth.status===401||auth.status===403)return reply({error:'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'},401);
  if(!auth.ok)throw new Error('auth');
  const user=await auth.json();if(typeof user?.id!=='string'||!user.id)return reply({error:'กรุณาเข้าสู่ระบบใหม่'},401);
  owner=user.id;
 }catch{return reply({error:'ตรวจสอบบัญชีไม่ได้ กรุณาลองอีกครั้ง'},503)}
 if(!process.env.OPENAI_API_KEY?.trim())return reply({error:'ยังไม่ได้เปิดใช้งาน AI ของ Daily Fuel กรุณาตั้งค่า OpenAI API key ที่เซิร์ฟเวอร์',code:'ai_not_configured'},503);
 if(active.has(owner))return reply({error:'กำลังวิเคราะห์อยู่ รอผลสักครู่แล้วลองใหม่'},429);
 active.add(owner);
 try{
  // Read with the caller's JWT and explicit owner filters; RLS remains in force.
  const profileParams=new URLSearchParams({select:'id,slot,name,sex,age,weight,height,activity,body_fat,goal,adjustment,macro_plan',owner_id:`eq.${owner}`,slot:`eq.${args.person}`,limit:'1'});
  const profileResponse=await fetch(`${base}/rest/v1/profiles?${profileParams}`,{headers,cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!profileResponse.ok)return reply({error:'โหลดโปรไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง'},503);
  const profiles=await profileResponse.json();
  if(!Array.isArray(profiles)||profiles.length!==1)return reply({error:'ไม่พบโปรไฟล์ในบัญชีนี้'},404);
  const profile={...profiles[0],id:args.person} as Profile;
  if(Object.keys(validateNutritionProfile(profile)).length)return reply({error:'กรุณาตรวจข้อมูลและเป้าหมายใน Settings ก่อนวิเคราะห์'},422);
  const mealParams=new URLSearchParams({select:'meal,name,calories,protein,carbs,fat,sodium_mg,total_sugar_g,free_sugar_g,nutrition_source',owner_id:`eq.${owner}`,profile_id:`eq.${profiles[0].id}`,date:`eq.${args.date}`,order:'id',limit:'201'});
  const mealResponse=await fetch(`${base}/rest/v1/entries?${mealParams}`,{headers,cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!mealResponse.ok)return reply({error:'โหลดมื้ออาหารไม่สำเร็จ กรุณาลองอีกครั้ง'},503);
  const entries=await mealResponse.json() as AnalysisMeal[];
  if(!Array.isArray(entries)||entries.length>200)return reply({error:'มื้ออาหารในวันนี้มากเกินกว่าจะวิเคราะห์ได้ครบ'},422);
  if(!entries.length)return reply({error:'เพิ่มมื้ออาหารในวันที่เลือกก่อน แล้วกลับมาวิเคราะห์ได้เลย',code:'no_meals'},422);
  const context=buildAnalysisContext(profile,args,entries);
  const now=Date.now();
  for(const [id,item] of cache)if(item.expires<=now)cache.delete(id);
  for(const [id,times] of recent)if(!times.some(time=>now-time<86400000))recent.delete(id);
  const cacheKey=createHash('sha256').update(JSON.stringify([owner,args,context])).digest('hex');
  const cached=cache.get(cacheKey);if(cached)return reply(cached.result);
  const times=(recent.get(owner)||[]).filter(time=>now-time<86400000);
  if(times.filter(time=>now-time<60000).length>=6||times.length>=60)return reply({error:'วิเคราะห์ครบจำนวนในช่วงนี้แล้ว ลองใหม่ภายหลัง'},429);
  // Best-effort per-process limits; configure a project budget/rate limit too.
  if(recent.size>=1000&&!recent.has(owner))return reply({error:'ระบบวิเคราะห์กำลังมีผู้ใช้งานมาก กรุณาลองภายหลัง'},503);
  recent.set(owner,[...times,now]);
  const result=await fetch('https://api.openai.com/v1/responses',{
   method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY.trim()}`,'Content-Type':'application/json'},cache:'no-store',signal:AbortSignal.timeout(45000),
   body:JSON.stringify({model:process.env.OPENAI_NUTRITION_MODEL?.trim()||'gpt-5.4-mini',store:false,max_output_tokens:2400,instructions:analysisInstructions,input:JSON.stringify({question:analysisTopics[args.topic],nutrition:context}),text:{format:{type:'json_schema',name:'daily_fuel_nutrition_reflection',strict:true,schema:analysisSchema}}})
  });
  if(!result.ok)return reply({error:result.status===429?'AI ยังไม่พร้อมรับคำขอเพิ่มเติม กรุณาลองภายหลัง':'เชื่อมต่อ AI ไม่สำเร็จ กรุณาลองอีกครั้ง'},result.status===429?429:502);
  let analysis;try{analysis=parseAnalysisOutput(await result.json())}catch(error){return reply({error:error instanceof Error?error.message:'อ่านผลวิเคราะห์ไม่ได้'},502)}
  const response:AnalysisResult={topic:args.topic,analysis,context,generated_at:new Date().toISOString()};
  if(cache.size>=200)cache.delete(cache.keys().next().value!);
  cache.set(cacheKey,{expires:now+300000,result:response});
  return reply(response);
 }catch{return reply({error:'วิเคราะห์ไม่สำเร็จหรือใช้เวลานานเกินไป กรุณาลองอีกครั้ง'},502)}
 finally{active.delete(owner)}
}
