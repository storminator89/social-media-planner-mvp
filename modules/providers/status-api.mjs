import {ProviderRepository,PROVIDER_CAPABILITIES} from './repository.mjs';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'oai-authenticated-user-id'};
const failure=(status,code,message)=>new Response(JSON.stringify({error:{code,message}}),{status,headers});
/** Read-only DTO, no mutation methods or provider transports exposed. */
export async function handleProviderStatus(request,env){
  if(new URL(request.url).pathname!=='/api/providers/status')return null;
  const owner=request.headers.get('oai-authenticated-user-id');
  if(!owner||!owner.trim()||owner.length>256)return failure(401,'SIGN_IN_REQUIRED','Bitte mit ChatGPT anmelden.');
  if(request.method!=='GET')return failure(405,'METHOD_NOT_ALLOWED','Nur lesender Zugriff ist verfügbar.');
  if(request.headers.get('Sec-Fetch-Site')==='cross-site'||(request.headers.has('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin))return failure(403,'CROSS_ORIGIN_REQUEST','Diese Anfrage ist nicht erlaubt.');
  try{
    const providers=await new ProviderRepository(env.DB).listConnectionSummaries(owner);
    return new Response(JSON.stringify({schemaVersion:1,providers,capabilities:PROVIDER_CAPABILITIES}),{headers});
  }catch{return failure(503,'PROVIDER_STATUS_UNAVAILABLE','Der Verbindungsstatus ist nicht verfügbar.');}
}
