import {actionToken} from '../../../../lib/gpt-api';
import {bridge,errorResponse,noStore,throttle} from '../../../../lib/gpt-server';
export const runtime='nodejs';
export async function GET(request:Request){
 try{throttle(request);const result=await bridge('targets',{access_token:actionToken(request)});
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const date=['year','month','day'].map(key=>parts.find(part=>part.type===key)?.value).join('-');
  return Response.json({...result,today:date,timezone:'Asia/Bangkok'},{headers:noStore});
 }catch(error){return errorResponse(error)}
}
