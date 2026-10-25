import {extraNutrientFields,parseExtraNutrition} from './nutrition-insights';
export const APP_ORIGIN='https://daily-fuel-inky.vercel.app';
export const MCP_RESOURCE=APP_ORIGIN+'/mcp';
export const MCP_CALLBACK='https://chatgpt.com/connector_platform_oauth_redirect';
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class ApiError extends Error {constructor(public status:number,public code:string,message:string){super(message)}}
function invalid(message:string):never{throw new ApiError(400,'invalid_request',message)}
const object=(value:unknown):Record<string,unknown>=>{
 if(!value||typeof value!=='object'||Array.isArray(value))invalid('Expected an object');
 return value as Record<string,unknown>;
};
export function validCallback(value:string){
 return (/^https:\/\/(chatgpt\.com|chat\.openai\.com)\/aip\/g-[A-Za-z0-9-]+\/oauth\/callback$/.test(value)||isMcpCallback(value))&&!/[\s\x00-\x1f\x7f]/.test(value);
}
export function isMcpCallback(value:string){return value===MCP_CALLBACK||/^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(value)}
export function callbackFromInput(value:string){
 const text=value.trim();
 if(validCallback(text))return text;
 if(/^g-[A-Za-z0-9]+$/.test(text))return `https://chatgpt.com/aip/${text}/oauth/callback`;
 const match=text.match(/^https:\/\/chatgpt\.com\/g\/(g-[A-Za-z0-9]+)(?:-[A-Za-z0-9_-]+)?\/?$/);
 return match?`https://chatgpt.com/aip/${match[1]}/oauth/callback`:null;
}
export function authorizationParams(params:URLSearchParams){
 for(const key of params.keys())if(params.getAll(key).length!==1)invalid('Duplicate OAuth parameter');
 const client_id=params.get('client_id')||'',redirect_uri=params.get('redirect_uri')||'',state=params.get('state')||'';
 if(!UUID.test(client_id)||!validCallback(redirect_uri)||!state||state.length>2048)invalid('Invalid client, callback or state');
 if(params.get('response_type')!=='code'||params.get('scope')!=='meals.write')invalid('Use response_type=code and scope=meals.write');
 const challenge=params.get('code_challenge'),method=params.get('code_challenge_method');
 if((challenge||method)&&(!challenge||!/^[A-Za-z0-9_-]{43}$/.test(challenge)||method!=='S256'))invalid('Only S256 PKCE is supported');
 const resource=params.get('resource');
 if(isMcpCallback(redirect_uri)&&(!challenge||resource!==MCP_RESOURCE))invalid('MCP requires S256 PKCE and the Daily Fuel MCP resource');
 if(!isMcpCallback(redirect_uri)&&resource!==null)invalid('Resource is only supported by Plugin connections');
 return {client_id,redirect_uri,state,scope:'meals.write',challenge:challenge||null,resource};
}
export function validateMealBatch(body:unknown){
 const value=object(body);
 if(Object.keys(value).some(key=>!['request_id','entries'].includes(key)))invalid('Unexpected request field');
 if(typeof value.request_id!=='string'||!UUID.test(value.request_id))invalid('request_id must be a UUID; reuse it for retries');
 if(!Array.isArray(value.entries)||value.entries.length<1||value.entries.length>2)invalid('Provide one or two entries');
 const recipients=new Set<string>();
 const entries=value.entries.map(raw=>{
  const entry=object(raw);
  if(Object.keys(entry).some(key=>!['recipient_id','date','meal','name','calories','protein','carbs','fat','nutrition_source',...extraNutrientFields.map(field=>field.key)].includes(key)))invalid('Unexpected meal field');
  if(typeof entry.recipient_id!=='string'||!UUID.test(entry.recipient_id)||recipients.has(entry.recipient_id.toLowerCase()))invalid('Use one entry per authorized recipient');
  recipients.add(entry.recipient_id.toLowerCase());
  if(typeof entry.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)||!Number.isFinite(Date.parse(entry.date+'T00:00:00Z'))||new Date(entry.date+'T00:00:00Z').toISOString().slice(0,10)!==entry.date)invalid('Use a real date in YYYY-MM-DD format');
  if(typeof entry.meal!=='string'||!['Breakfast','Lunch','Dinner','Snack'].includes(entry.meal))invalid('Invalid meal');
  if(typeof entry.name!=='string'||!entry.name.trim()||entry.name.trim().length>200||/[\x00-\x1f\x7f]/.test(entry.name))invalid('Food name must contain 1–200 characters');
  const source=entry.nutrition_source??'chatgpt_estimate';
  if(typeof source!=='string'||!['chatgpt_estimate','label','provided'].includes(source))invalid('Invalid nutrition source');
  const nutrients={} as Record<'calories'|'protein'|'carbs'|'fat',number>;
  for(const key of ['calories','protein','carbs','fat'] as const){const n=entry[key];if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>100000)invalid('All four nutrients must be finite nonnegative numbers');nutrients[key]=n}
  let extra;try{extra=parseExtraNutrition(entry)}catch(error){invalid(error instanceof Error?error.message:'Invalid optional nutrient')}
  return {...extra,recipient_id:entry.recipient_id.toLowerCase(),date:entry.date,meal:entry.meal,name:entry.name.trim(),...nutrients,nutrition_source:source};
 });
 return {request_id:value.request_id.toLowerCase(),entries};
}
export function actionToken(request:Request){
 const token=request.headers.get('authorization')?.match(/^Bearer (df_a_[0-9a-f]{64})$/i)?.[1];
 if(!token)throw new ApiError(401,'unauthorized','Connect your Daily Fuel account first');
 return token;
}
