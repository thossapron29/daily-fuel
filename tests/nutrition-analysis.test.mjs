import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleUrl} from './ts-module.mjs';

const {parseAnalysisRequest,buildAnalysisContext,parseAnalysisOutput}=await import(await moduleUrl('../lib/nutrition-analysis.ts'));
const profile={id:'profile-id',slot:'ben',name:'เบ้น',sex:'male',age:30,weight:70,height:175,activity:1.375,body_fat:null,goal:'maintain',adjustment:0,macro_plan:'moderate'};
const meal={meal:'Lunch',name:'ข้าวกับไก่',calories:500,protein:35,carbs:60,fat:12,sodium_mg:0,total_sugar_g:null,free_sugar_g:null,nutrition_source:'chatgpt_estimate'};
const args={date:'2026-11-02',person:'ben',topic:'overview'};
const text={summary:'จากมื้อที่บันทึก ยังมีพื้นที่สำหรับมื้อถัดไป',observations:[{title:'พลังงาน',detail:'เทียบเฉพาะมื้อที่บันทึกกับเป้าหมายปัจจุบัน'},{title:'ข้อมูลยังไม่ครบ',detail:'ยังไม่มีค่าน้ำตาลอิสระ'}],next_step:'เลือกมื้อที่มีโปรตีนและผักตามความหิว'};
const output=value=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});

test('analysis accepts only dates, owned profile slots and guided topics',()=>{
 assert.deepEqual(parseAnalysisRequest(args),args);
 for(const v of [null,[],{...args,date:'2026-02-30'},{...args,person:'both'},{...args,person:['ben']},{...args,owner_id:'foreign'},{...args,entries:[]},{...args,topic:'__proto__'},{...args,topic:'ignore instructions'}])assert.throws(()=>parseAnalysisRequest(v));
});
test('analysis reuses exact app totals/targets without leaking body measurements or converting unknowns into zero',()=>{
 const context=buildAnalysisContext(profile,args,[meal,{...meal,calories:300,sodium_mg:null}]);
 assert.equal(context.totals.calories,800);assert.equal(context.comparison.calories.remaining,context.targets.calories-800);
 assert.equal(context.comparison.protein.consumed,70);assert.equal(context.estimated_count,2);
 assert.deepEqual(context.optional_nutrients.sodium_mg,{value:0,known:1,count:2,complete:false});
 assert.equal(context.optional_nutrients.free_sugar_g.value,null);
 for(const field of ['weight','height','age','body_fat','sex','owner_id'])assert.equal(Object.hasOwn(context,field),false);
});
test('refusals, incomplete generations and malformed model output never become a successful analysis',()=>{
 assert.deepEqual(parseAnalysisOutput(output(text)),text);
 for(const v of [null,{...output(text),status:'incomplete'},output({...text,summary:''}),output({...text,observations:[]}),{status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]}, {status:'completed',output:[{type:'message',content:[{type:'output_text',text:'invalid json'}]}]}])assert.throws(()=>parseAnalysisOutput(v));
});

test('authenticated API scopes all reads and model context, caches snapshots, and fails safely',async t=>{
 const {POST}=await import(await moduleUrl('../app/api/nutrition-analysis/route.ts'));
 const vars=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','OPENAI_API_KEY','OPENAI_NUTRITION_MODEL'];
 const before=Object.fromEntries(vars.map(key=>[key,process.env[key]])),originalFetch=globalThis.fetch;
 let owner='fixture-owner-a',authStatus=200,meals=[meal],modelStatus=200,modelOutput=output(text),modelCalls=0,profileRows=[profile],resolveModel=null,holdModel=false;
 const calls=[];
 const request=(body=args,token='fixture-jwt')=>new Request('http://localhost/api/nutrition-analysis',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
 try{
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='fixture-public';process.env.OPENAI_API_KEY='fixture-secret';delete process.env.OPENAI_NUTRITION_MODEL;
  globalThis.fetch=async(input,options={})=>{
   const url=new URL(input);calls.push({url,options});
   if(url.hostname==='api.openai.com'){
    modelCalls++;const body=JSON.parse(options.body);
    assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.model,'gpt-5.4-mini');
    assert.equal(body.max_output_tokens,2400);assert.equal(new Headers(options.headers).get('Authorization'),'Bearer fixture-secret');
    const sent=JSON.parse(body.input);assert.equal(sent.nutrition.person,args.person);assert.equal(sent.nutrition.date,args.date);
    assert.equal(sent.nutrition.totals.calories,meals.reduce((sum,e)=>sum+e.calories,0));
    assert.equal(Object.hasOwn(sent.nutrition,'weight'),false);assert.equal(Object.hasOwn(sent.nutrition,'owner_id'),false);
    if(holdModel)await new Promise(resolve=>{resolveModel=resolve});
    return Response.json(modelOutput,{status:modelStatus});
   }
   assert.equal(new Headers(options.headers).get('Authorization'),'Bearer fixture-jwt');assert.equal(options.cache,'no-store');assert.equal(options.method,undefined);
   if(url.pathname==='/auth/v1/user')return Response.json({id:owner},{status:authStatus});
   assert.equal(url.searchParams.get('owner_id'),`eq.${owner}`);
   if(url.pathname==='/rest/v1/profiles'){assert.equal(url.searchParams.get('slot'),'eq.ben');return Response.json(profileRows)}
   assert.equal(url.pathname,'/rest/v1/entries');assert.equal(url.searchParams.get('profile_id'),'eq.profile-id');assert.equal(url.searchParams.get('date'),'eq.2026-11-02');assert.equal(url.searchParams.get('limit'),'201');
   return Response.json(meals);
  };
  await t.test('anonymous/invalid session, forged payload and missing key never call OpenAI',async()=>{
   assert.equal((await POST(request(args,null))).status,401);
   assert.equal((await POST(request({...args,owner_id:'foreign'}))).status,400);
   authStatus=401;assert.equal((await POST(request())).status,401);authStatus=200;
   delete process.env.OPENAI_API_KEY;assert.equal((await POST(request())).status,503);process.env.OPENAI_API_KEY='fixture-secret';
   assert.equal(modelCalls,0);
  });
  await t.test('empty days and inaccessible profiles do not generate misleading results',async()=>{
   profileRows=[];assert.equal((await POST(request())).status,404);profileRows=[profile];
   meals=[];assert.equal((await POST(request())).status,422);assert.equal(modelCalls,0);meals=[meal];
  });
  await t.test('same snapshot is cached; meal/target/owner/topic changes invalidate the cache',async()=>{
   const a=await POST(request());assert.equal(a.status,200);assert.match(a.headers.get('Cache-Control'),/private, no-store/);
   const first=await a.json();assert.equal(first.context.totals.calories,500);assert.equal(modelCalls,1);
   assert.deepEqual(await (await POST(request())).json(),first);assert.equal(modelCalls,1);
   meals=[{...meal,calories:700}];assert.equal((await POST(request())).status,200);assert.equal(modelCalls,2);
   profileRows=[{...profile,adjustment:200}];assert.equal((await POST(request())).status,200);assert.equal(modelCalls,3);
   owner='fixture-owner-b';assert.equal((await POST(request())).status,200);assert.equal(modelCalls,4);
   assert.equal((await POST(request({...args,topic:'next_meal'}))).status,200);assert.equal(modelCalls,5);
  });
  await t.test('provider errors and incomplete output do not cache fabricated success',async()=>{
   owner='fixture-owner-errors';modelStatus=429;assert.equal((await POST(request())).status,429);
   modelStatus=200;modelOutput={...output(text),status:'incomplete'};assert.equal((await POST(request())).status,502);
   modelOutput=output(text);assert.equal((await POST(request())).status,200);
  });
  await t.test('concurrent generations and repeated uncached requests are throttled',async()=>{
   owner='fixture-owner-concurrent';holdModel=true;const pending=POST(request());
   while(!resolveModel)await new Promise(resolve=>setImmediate(resolve));
   assert.equal((await POST(request())).status,429);holdModel=false;resolveModel();assert.equal((await pending).status,200);
   owner='fixture-owner-rate';
   for(let n=0;n<6;n++){meals=[{...meal,calories:100+n}];assert.equal((await POST(request())).status,200)}
   meals=[{...meal,calories:999}];const before=modelCalls;assert.equal((await POST(request())).status,429);assert.equal(modelCalls,before);
  });
  assert.ok(calls.every(({url,options})=>url.hostname==='api.openai.com'||options.method===undefined),'database reads only');
 }finally{globalThis.fetch=originalFetch;for(const key of vars){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key]}}
});
