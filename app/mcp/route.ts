import {handleMcp} from '../../lib/mcp';
import {noStore} from '../../lib/gpt-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){return handleMcp(request)}
// Stateless Streamable HTTP: no unsolicited stream or server-side session.
export function GET(){return new Response(null,{status:405,headers:{...noStore,Allow:'POST'}})}
export function DELETE(){return new Response(null,{status:405,headers:{...noStore,Allow:'POST'}})}
