import {actionToken,validateMealBatch} from '../../../../lib/gpt-api';
import {bridge,errorResponse,jsonBody,noStore,throttle} from '../../../../lib/gpt-server';
export const runtime='nodejs';
export async function POST(request:Request){
 try{throttle(request);const access_token=actionToken(request),batch=validateMealBatch(await jsonBody(request));
  return Response.json(await bridge('prepare',{access_token,...batch}),{headers:noStore});
 }catch(error){return errorResponse(error)}
}
