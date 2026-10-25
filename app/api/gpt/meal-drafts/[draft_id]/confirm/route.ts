import {ApiError,UUID,actionToken} from '../../../../../../lib/gpt-api';
import {bridge,errorResponse,noStore,throttle} from '../../../../../../lib/gpt-server';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{draft_id:string}>}){
 try{throttle(request);const access_token=actionToken(request),{draft_id}=await params;
  if(!UUID.test(draft_id))throw new ApiError(400,'invalid_request','Invalid draft ID');
  return Response.json(await bridge('confirm',{access_token,draft_id}),{headers:noStore});
 }catch(error){return errorResponse(error)}
}
