import {authorizationMetadata} from '../../../lib/mcp';
export function GET(){return Response.json(authorizationMetadata,{headers:{'Access-Control-Allow-Origin':'*'}})}
