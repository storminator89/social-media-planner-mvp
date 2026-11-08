import {createHTTP,createDeadline} from '../oauth/x/http.mjs';

const ORIGIN='https://kanoa.de';
const METADATA='/.well-known/oauth-authorization-server';
const METHODS=Object.freeze({
 [METADATA]:'GET',
 '/api/v1/apps':'POST',
 '/oauth/token':'POST',
 '/oauth/revoke':'POST',
 '/api/v1/accounts/verify_credentials':'GET'
});
const MAX_FORM_BYTES=16384;
const reject=()=>{throw new Error('KANOA_TRANSPORT_REJECTED');};

/** Server-only adapter for createHTTP/createMastodonFlow, never an HTTP proxy.
 * The caller's shared 15s deadline covers upload, fetch and response streaming;
 * createHTTP enforces a 64KiB decoded JSON limit and rejects all redirects.
 * This fixed public third-party destination does not imply DNS pinning or a
 * private-address guarantee. A documented negative cf.cacheTtlByStatus requests
 * no caching where the platform honors cf options; Dispatch may ignore them.
 * Request headers also request no caching, not a verified platform bypass.
 * No compatibility flag is assumed or configured. The caller must omit the
 * unsupported Request.cache initializer and use manual redirect handling.
 * The shared response gate rejects every redirect before consuming JSON.
 */
export function createKanoaSitesTransport({fetchImpl=request=>globalThis.fetch(request)}={}){
 if(typeof fetchImpl!=='function')reject();
 return async request=>{
  if(!(request instanceof Request))reject();
  const url=new URL(request.url),method=METHODS[url.pathname];
  if(!Object.hasOwn(METHODS,url.pathname)||request.url!==ORIGIN+url.pathname||request.method!==method)reject();
  if(request.signal.aborted)reject();
  // Construct a fresh request, never forward Dispatch identity, cookies, origin,
  // tracing headers or any other inbound headers to the external provider.
  const headers=new Headers({Accept:'application/json','Cache-Control':'no-store, no-cache',Pragma:'no-cache'});
  let body;
  if(method==='POST'){
   if(!/^application\/x-www-form-urlencoded(?:;charset=UTF-8)?$/i.test(request.headers.get('Content-Type')||''))reject();
   const reader=request.body?.getReader();if(!reader)reject();
   const cancel=()=>{try{Promise.resolve(reader.cancel()).catch(()=>{});}catch{}};
   request.signal.addEventListener('abort',cancel,{once:true});
   const parts=[];let size=0;
   try{while(true){if(request.signal.aborted)reject();const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_FORM_BYTES)reject();parts.push(part.value);}}
   catch(error){cancel();throw error;}
   finally{request.signal.removeEventListener('abort',cancel);reader.releaseLock();}
   body=new Uint8Array(size);let at=0;for(const part of parts){body.set(part,at);at+=part.byteLength;}
   headers.set('Content-Type','application/x-www-form-urlencoded');
  }else if(request.body)reject();
  if(url.pathname==='/api/v1/accounts/verify_credentials'){
   const token=request.headers.get('Authorization');
   if(!/^Bearer [A-Za-z0-9._~+/-]{1,4096}$/.test(token||''))reject();
   headers.set('Authorization',token); // Only the server-owned grant, on this path.
  }else if(request.headers.has('Authorization'))reject();
  if(request.signal.aborted)reject();
  return fetchImpl(new Request(ORIGIN+url.pathname,{method,headers,body,redirect:'manual',credentials:'omit',cf:{cacheTtlByStatus:{'100-599':-1}},referrerPolicy:'no-referrer',signal:request.signal}));
 };
}

/** Read-only probe for a separately reviewed, authorized Sites Worker harness.
 * No URL argument, app registration, identity, credential or storage operation.
 * Only the owner-guarded explicit diagnostic route invokes this probe.
 */
export async function probeKanoaSitesMetadata({fetchImpl}={}){
 const deadline=createDeadline(15000);
 try{
  const result=await createHTTP(createKanoaSitesTransport({fetchImpl}),{requestCache:false,requestRedirect:'manual'})(ORIGIN+METADATA,{method:'GET'},deadline),metadata=result.body;
  if(result.status<200||result.status>=300||![ORIGIN,ORIGIN+'/'].includes(metadata.issuer)||
     metadata.authorization_endpoint!==ORIGIN+'/oauth/authorize'||metadata.token_endpoint!==ORIGIN+'/oauth/token'||
     metadata.app_registration_endpoint!==ORIGIN+'/api/v1/apps'||
     !Array.isArray(metadata.scopes_supported)||!metadata.scopes_supported.every(v=>typeof v==='string')||!metadata.scopes_supported.includes('profile')||
     !Array.isArray(metadata.code_challenge_methods_supported)||!metadata.code_challenge_methods_supported.every(v=>typeof v==='string')||!metadata.code_challenge_methods_supported.includes('S256'))throw new Error('KANOA_METADATA_UNCONFIRMED');
  deadline.check();return result;
 }
 finally{deadline.close();}
}
