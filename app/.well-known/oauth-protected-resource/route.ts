import {resourceMetadata} from '../../../lib/mcp';
export function GET(){return Response.json(resourceMetadata,{headers:{'Access-Control-Allow-Origin':'*'}})}
