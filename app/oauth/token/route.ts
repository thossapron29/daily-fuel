import {ApiError} from '../../../lib/gpt-api';
import {bridge,errorResponse,noStore,throttle} from '../../../lib/gpt-server';
export const runtime='nodejs';
export async function POST(request:Request){
 try{
  throttle(request);
  const text=await request.text();if(Buffer.byteLength(text)>6000)throw new ApiError(413,'invalid_request','Request too large');
  const form=request.headers.get('content-type')?.includes('application/json')?new URLSearchParams(JSON.parse(text)):new URLSearchParams(text);
  for(const key of form.keys())if(form.getAll(key).length!==1)throw new ApiError(400,'invalid_request','Duplicate parameter');
  let client_id=form.get('client_id')||'',client_secret=form.get('client_secret')||'';
  const auth=request.headers.get('authorization');
  if(auth){
   const basic=auth.match(/^Basic ([A-Za-z0-9+/]+={0,2})$/i);if(!basic)throw new ApiError(401,'invalid_client','Invalid client authentication');
   const decoded=Buffer.from(basic[1],'base64').toString('utf8'),separator=decoded.indexOf(':');
   if(separator<1)throw new ApiError(401,'invalid_client','Invalid client authentication');
   const id=decoded.slice(0,separator),secret=decoded.slice(separator+1);
   if((client_id&&client_id!==id)||(client_secret&&client_secret!==secret))throw new ApiError(401,'invalid_client','Conflicting client authentication');
   client_id=id;client_secret=secret;
  }
  const result=await bridge('exchange',{client_id,client_secret,grant_type:form.get('grant_type'),code:form.get('code'),redirect_uri:form.get('redirect_uri'),refresh_token:form.get('refresh_token'),code_verifier:form.get('code_verifier')});
  return Response.json(result,{status:result.error?(result.error==='invalid_client'?401:400):200,headers:{...noStore,...(result.error==='invalid_client'?{'WWW-Authenticate':'Basic realm="Daily Fuel GPT"'}:{})}});
 }catch(error){const response=errorResponse(error instanceof SyntaxError?new ApiError(400,'invalid_request','Malformed token request'):error);if(response.status===401)response.headers.set('WWW-Authenticate','Basic realm="Daily Fuel GPT"');return response}
}
