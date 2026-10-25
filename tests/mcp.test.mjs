import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const encode=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
async function compile(path){return ts.transpileModule(await readFile(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText}
const apiURL=encode(await compile('../lib/gpt-api.ts'));
const serverURL=encode((await compile('../lib/gpt-server.ts')).replace("'./gpt-api'",JSON.stringify(apiURL)));
const schemaURL=encode((await compile('../lib/gpt-openapi.ts')).replace("'./gpt-api'",JSON.stringify(apiURL)));
const mcpSource=(await compile('../lib/mcp.ts')).replace("'./gpt-api'",JSON.stringify(apiURL)).replace("'./gpt-server'",JSON.stringify(serverURL)).replace("'./gpt-openapi'",JSON.stringify(schemaURL));
const mcp=await import(encode(mcpSource));
const {authorizationParams,MCP_RESOURCE,MCP_CALLBACK}=await import(apiURL);
const {handleMcp,mcpTools,resourceMetadata,authorizationMetadata}=mcp;
const token='df_a_'+'b'.repeat(64),uuid='aaaaaaaa-7110-4110-8110-000000000001';
function request(message,extra={}){return new Request(MCP_RESOURCE,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',...extra},body:JSON.stringify(message)})}

test('MCP discovery provides consistent issuer/resource, S256 and explicit static client auth without open registration',()=>{
 assert.equal(resourceMetadata.resource,MCP_RESOURCE);assert.equal(resourceMetadata.authorization_servers[0],authorizationMetadata.issuer);
 assert.deepEqual(authorizationMetadata.code_challenge_methods_supported,['S256']);
 assert.equal(authorizationMetadata.authorization_response_iss_parameter_supported,true);
 assert.equal(authorizationMetadata.registration_endpoint,undefined);
 const params=new URLSearchParams({client_id:uuid,redirect_uri:MCP_CALLBACK,response_type:'code',state:'fixture-state',scope:'meals.write'});
 assert.throws(()=>authorizationParams(params));params.set('resource',MCP_RESOURCE);assert.throws(()=>authorizationParams(params));params.set('code_challenge','a'.repeat(43));params.set('code_challenge_method','S256');
 assert.equal(authorizationParams(params).resource,MCP_RESOURCE);params.set('resource','https://evil.example/mcp');assert.throws(()=>authorizationParams(params));
});
test('stateless MCP initializes, lists tools publicly, acknowledges notifications and rejects malformed/origin requests',async()=>{
 const initialized=await handleMcp(request({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}}));
 assert.equal((await initialized.json()).result.protocolVersion,'2025-11-25');
 const tools=await (await handleMcp(request({jsonrpc:'2.0',id:2,method:'tools/list'}))).json();assert.equal(tools.result.tools.length,3);
 assert.equal((await handleMcp(request({jsonrpc:'2.0',method:'notifications/initialized'}))).status,202);
 assert.equal((await handleMcp(request([{jsonrpc:'2.0',id:1,method:'ping'}]))).status,400);
 assert.equal((await handleMcp(request({jsonrpc:'2.0',id:3,method:'ping'},{Origin:'https://evil.example'}))).status,403);
 assert.equal((await handleMcp(request({jsonrpc:'2.0',id:4,method:'ping'},{'mcp-protocol-version':'unknown'}))).status,400);
 const sse=await handleMcp(request({jsonrpc:'2.0',id:5,method:'ping'},{Accept:'text/event-stream'}));assert.match(sse.headers.get('Content-Type'),/text\/event-stream/);assert.match(await sse.text(),/^event: message/);
});
test('tools advertise OAuth; receipt tool is read-only and cannot approve a meal',async()=>{
 assert.deepEqual(mcpTools.map(t=>t.name),['getMealRecipients','prepareMealBatch','getMealBatchStatus']);
 assert.equal(mcpTools[2].annotations.readOnlyHint,true);assert.equal(mcpTools[1].annotations.readOnlyHint,false);
 for(const tool of mcpTools)assert.deepEqual(tool.securitySchemes,[{type:'oauth2',scopes:['meals.write']}]);
 const response=await handleMcp(request({jsonrpc:'2.0',id:6,method:'tools/call',params:{name:'getMealRecipients',arguments:{}}}));
 assert.equal(response.status,401);assert.match(response.headers.get('WWW-Authenticate'),/resource_metadata=/);
 const body=await response.json();assert.equal(body.result.isError,true);assert.ok(body.result._meta['mcp/www_authenticate'][0].includes('error_description='));
});
test('MCP calls the existing gateway with server-bound audience and returns web review rather than a model-controlled write',async()=>{
 const before={fetch:globalThis.fetch,url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY};
 try{
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='fixture';
  const calls=[];globalThis.fetch=async(url,options)=>{const value=JSON.parse(options.body);calls.push(value);assert.equal(value.payload.resource,MCP_RESOURCE);return Response.json(value.action==='targets'?{recipients:[]}:{draft_id:uuid,status:value.action==='prepare'?'awaiting_confirmation':'awaiting_user_confirmation',entries:[]})};
  const auth={Authorization:`Bearer ${token}`};
  const call=async(name,args)=> (await handleMcp(request({jsonrpc:'2.0',id:7,method:'tools/call',params:{name,arguments:args}},auth))).json();
  const recipients=await call('getMealRecipients',{});assert.equal(recipients.result.structuredContent.timezone,'Asia/Bangkok');
  const prepared=await call('prepareMealBatch',{request_id:uuid,entries:[{recipient_id:uuid,date:'2026-10-25',meal:'Lunch',name:'Fixture',calories:450,protein:30,carbs:45,fat:16}]});
  assert.equal(prepared.result.structuredContent.status,'awaiting_user_confirmation');assert.match(prepared.result.structuredContent.confirmation_url,/\/gpt\/review\//);
  await call('getMealBatchStatus',{draft_id:uuid});assert.equal(calls.at(-1).action,'confirm');assert.deepEqual(Object.keys(calls.at(-1).payload).sort(),['access_token','draft_id','resource']);
  const count=calls.length;assert.equal((await call('getMealBatchStatus',{draft_id:uuid,approved:true})).result.isError,true);assert.equal(calls.length,count);
  globalThis.fetch=async()=>Response.json({code:'28000'},{status:401});assert.equal((await handleMcp(request({jsonrpc:'2.0',id:8,method:'tools/call',params:{name:'getMealRecipients'}},auth))).status,401);
 }finally{globalThis.fetch=before.fetch;for(const [key,value] of Object.entries({NEXT_PUBLIC_SUPABASE_URL:before.url,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:before.key})){if(value===undefined)delete process.env[key];else process.env[key]=value}}
});
