import {moduleUrl} from './ts-module.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const encode=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
async function compile(path){return ts.transpileModule(await readFile(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText}
const apiURL=await moduleUrl('../lib/gpt-api.ts');
const serverURL=encode((await compile('../lib/gpt-server.ts')).replace("'./gpt-api'",JSON.stringify(apiURL)));
const {authorizationParams,validCallback,validateMealBatch,callbackFromInput}=await import(apiURL);
const {gptOpenApi}=await import(encode((await compile('../lib/gpt-openapi.ts')).replace("'./gpt-api'",JSON.stringify(apiURL))));
const client='aaaaaaaa-7070-4070-8070-000000000001',a='bbbbbbbb-7070-4070-8070-000000000001',b='bbbbbbbb-7070-4070-8070-000000000002',draft='cccccccc-7070-4070-8070-000000000001';
const callback='https://chatgpt.com/aip/g-test7070/oauth/callback';
const entry=id=>({recipient_id:id,date:'2026-10-25',meal:'Breakfast',name:' Rice ',calories:450.25,protein:30.125,carbs:50,fat:0});
const batch={request_id:client,entries:[entry(a),{...entry(b),calories:650,carbs:80}]};

test('OAuth accepts only exact GPT callbacks, one state, the supported scope, and valid optional S256',()=>{
 const params=()=>new URLSearchParams({client_id:client,redirect_uri:callback,state:'csrf-fixture',response_type:'code',scope:'meals.write'});
 assert.equal(authorizationParams(params()).redirect_uri,callback);
 assert.equal(callbackFromInput('g-test7070'),callback);
 assert.equal(callbackFromInput('https://chatgpt.com/g/g-test7070-daily-fuel'),callback);
 assert.equal(callbackFromInput('https://evil.example/g/g-test7070'),null);
 for(const url of ['https://chatgpt.com.evil/aip/g-x/oauth/callback','https://evil.example/callback',callback+'?x=1',callback+'#x',callback+'\n','http://chatgpt.com/aip/g-x/oauth/callback'])assert.equal(validCallback(url),false);
 for(const [key,value] of [['state',''],['scope','admin'],['response_type','token'],['client_id','not-a-uuid']]){const p=params();p.set(key,value);assert.throws(()=>authorizationParams(p))}
 const duplicate=params();duplicate.append('state','other');assert.throws(()=>authorizationParams(duplicate));
 const pkce=params();pkce.set('code_challenge','a'.repeat(43));assert.throws(()=>authorizationParams(pkce));pkce.set('code_challenge_method','S256');assert.equal(authorizationParams(pkce).challenge,'a'.repeat(43));
});
test('pair nutrition is independent, complete, dated, bounded, and normalized without accepting owner fields',()=>{
 const parsed=validateMealBatch(batch);assert.equal(parsed.entries[0].protein,30.125);assert.equal(parsed.entries[0].name,'Rice');assert.equal(parsed.entries[0].fat,0);assert.equal(parsed.entries[1].calories,650);assert.equal(parsed.entries[0].nutrition_source,'chatgpt_estimate');
 assert.throws(()=>validateMealBatch({...batch,entries:[entry(a),entry(a)]}));
 for(const patch of [{date:'2026-02-30'},{date:'25/10/2026'},{meal:'Other'},{protein:null},{carbs:''},{fat:-1},{calories:Infinity},{calories:100001},{name:''},{owner_id:client},{nutrition_source:'verified'}])assert.throws(()=>validateMealBatch({...batch,entries:[{...entry(a),...patch}]}));
 assert.throws(()=>validateMealBatch({...batch,entries:[]}));assert.throws(()=>validateMealBatch({...batch,owner_id:client}));
 assert.equal(batch.entries[0].name,' Rice ');
});
test('Action schema requires platform confirmation only for immutable draft commit, and uses one OAuth domain',()=>{
 assert.equal(gptOpenApi.paths['/api/gpt/meal-drafts/{draft_id}/confirm'].post['x-openai-isConsequential'],true);
 assert.equal(gptOpenApi.paths['/api/gpt/meal-drafts'].post['x-openai-isConsequential'],false);
 const flow=gptOpenApi.components.securitySchemes.dailyFuel.flows.authorizationCode;
 assert.equal(new URL(flow.authorizationUrl).origin,gptOpenApi.servers[0].url);assert.equal(new URL(flow.tokenUrl).origin,gptOpenApi.servers[0].url);
 assert.deepEqual(Object.keys(flow.scopes),['meals.write']);assert.equal(Object.keys(gptOpenApi.paths).length,3);
});
async function route(path){const source=(await compile(path)).replace(/'\.\.\/(?:\.\.\/)*lib\/gpt-api'/g,JSON.stringify(apiURL)).replace(/'\.\.\/(?:\.\.\/)*lib\/gpt-server'/g,JSON.stringify(serverURL));return import(encode(source))}
test('HTTP routes reject bare sessions, preserve immutable commit IDs, and surface durable RPC conflicts/consent failures',async()=>{
 const before={fetch:globalThis.fetch,url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY};
 try{
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='fixture-publishable-key';
  const calls=[];globalThis.fetch=async(url,options)=>{const rpc=JSON.parse(options.body);calls.push(rpc);assert.equal(new Headers(options.headers).get('Authorization'),null);return Response.json(rpc.action==='targets'?{recipients:[]}:{draft_id:draft,status:rpc.action==='confirm'?'recorded':'awaiting_confirmation'})};
  const recipients=(await route('../app/api/gpt/recipients/route.ts')).GET;
  const prepare=(await route('../app/api/gpt/meal-drafts/route.ts')).POST;
  const confirm=(await route('../app/api/gpt/meal-drafts/[draft_id]/confirm/route.ts')).POST;
  const token='df_a_'+'a'.repeat(64),headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json','x-forwarded-for':'fixture-gpt-routes'};
  assert.equal((await recipients(new Request('https://fixture/api/gpt/recipients'))).status,401);
  assert.equal((await recipients(new Request('https://fixture/api/gpt/recipients',{headers:{Authorization:'Bearer regular-supabase-jwt'}}))).status,401);assert.equal(calls.length,0);
  const r=await recipients(new Request('https://fixture/api/gpt/recipients',{headers}));assert.equal(r.status,200);assert.equal((await recipients(new Request('https://fixture/api/gpt/recipients',{headers:{...headers,Authorization:`bearer ${token}`}}))).status,200);const recipientData=await r.json();assert.equal(recipientData.timezone,'Asia/Bangkok');assert.match(recipientData.today,/^\d{4}-\d{2}-\d{2}$/);assert.match(r.headers.get('Cache-Control'),/no-store/);
  assert.equal((await prepare(new Request('https://fixture/api/gpt/meal-drafts',{method:'POST',headers,body:JSON.stringify(batch)}))).status,200);assert.equal(calls.at(-1).action,'prepare');
  assert.equal((await confirm(new Request('https://fixture/confirm',{method:'POST',headers,body:JSON.stringify({owner_id:'forged',calories:99999})}),{params:Promise.resolve({draft_id:draft})})).status,200);
  assert.deepEqual(calls.at(-1).payload,{access_token:token,draft_id:draft});
  globalThis.fetch=async()=>Response.json({code:'23505',message:'detail must not leak'},{status:409});
  assert.equal((await prepare(new Request('https://fixture/prepare',{method:'POST',headers,body:JSON.stringify(batch)}))).status,409);
  globalThis.fetch=async()=>Response.json({code:'42501',message:'detail must not leak'},{status:403});
  const denied=await confirm(new Request('https://fixture/confirm',{method:'POST',headers}),{params:Promise.resolve({draft_id:draft})});assert.equal(denied.status,403);assert.doesNotMatch(await denied.text(),/detail must not leak/);
 }finally{globalThis.fetch=before.fetch;for(const [key,value] of Object.entries({NEXT_PUBLIC_SUPABASE_URL:before.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:before.key})){if(value===undefined)delete process.env[key];else process.env[key]=value}}
});
test('OAuth token endpoint supports Basic/form, rejects credential conflicts and keeps tokens out of caches',async()=>{
 const before={fetch:globalThis.fetch,url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY};
 try{
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='fixture-public';
  let exchanges=0;globalThis.fetch=async(url,options)=>{const value=JSON.parse(options.body);assert.equal(value.action,'exchange');assert.equal(value.payload.client_id,client);assert.equal(value.payload.client_secret,'fixture-secret');exchanges++;return Response.json({access_token:'fixture-access',token_type:'bearer',expires_in:3600})};
  const token=(await route('../app/oauth/token/route.ts')).POST;
  const body=new URLSearchParams({grant_type:'authorization_code',code:'fixture-code',redirect_uri:callback});
  const basic='Basic '+Buffer.from(client+':fixture-secret').toString('base64');
  const response=await token(new Request('https://fixture/oauth/token',{method:'POST',headers:{Authorization:basic,'Content-Type':'application/x-www-form-urlencoded','x-forwarded-for':'fixture-oauth'},body}));assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/no-store/);assert.equal(exchanges,1);
  const conflict=new URLSearchParams(body);conflict.set('client_id',a);
  assert.equal((await token(new Request('https://fixture/oauth/token',{method:'POST',headers:{Authorization:basic},body:conflict}))).status,401);assert.equal(exchanges,1);
  globalThis.fetch=async()=>Response.json({error:'invalid_grant'});
  assert.equal((await token(new Request('https://fixture/oauth/token',{method:'POST',body:new URLSearchParams({client_id:client,client_secret:'fixture-secret',grant_type:'refresh_token',refresh_token:'fixture-refresh'})}))).status,400);
 }finally{globalThis.fetch=before.fetch;for(const [key,value] of Object.entries({NEXT_PUBLIC_SUPABASE_URL:before.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:before.key})){if(value===undefined)delete process.env[key];else process.env[key]=value}}
});
