/** Server-only protocol component. Not wired to a browser route or global fetch.
 * A future authenticated callback must consume durable state before invoking it.
 * Never pass request JSON as this module's arguments. No retries or persistence.
 */
import {INSTAGRAM_SCOPES,INSTAGRAM_API_VERSION} from './contract.mjs';
const verifiedResults=new WeakSet();
export const isVerifiedInstagramResult=value=>verifiedResults.has(value);
export class InstagramOAuthError extends Error {constructor(code){super('Instagram account verification failed.');this.code=code;}}
const fail=code=>{throw new InstagramOAuthError(code);};
const secret=value=>typeof value==='string'&&value.length>0&&value.length<=16384&&!/[\s\x00-\x1f\x7f]/u.test(value);
const id=value=>typeof value==='string'&&/^[1-9][0-9]{0,30}$/.test(value);
function fields(value,names){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==names.length||!names.every(name=>Object.hasOwn(value,name)))fail('INVALID_RESPONSE');}
function row(value,names){fields(value,['data']);if(!Array.isArray(value.data)||value.data.length!==1)fail('INVALID_RESPONSE');fields(value.data[0],names);return value.data[0];}
function configuration(input){
 fields(input,['appId','redirectUri','expectedAccountId','apiVersion']);
 if(!id(input.appId)||!id(input.expectedAccountId)||input.apiVersion!==INSTAGRAM_API_VERSION)fail('INVALID_CONFIGURATION');
 let uri;try{uri=new URL(input.redirectUri);}catch{fail('INVALID_CONFIGURATION');}
 if(uri.protocol!=='https:'||uri.href!==input.redirectUri||uri.username||uri.password||uri.port||uri.search||uri.hash||!uri.hostname.includes('.')||uri.hostname.endsWith('.local')||uri.hostname.endsWith('.localhost')||/^[\d.]+$/.test(uri.hostname)||uri.hostname.startsWith('['))fail('INVALID_CONFIGURATION');
 return Object.freeze({...input});
}
/** Explicit injected transport, with fixed provider hosts and response budgets.
 * The returned credential is deliberately non-enumerable to reduce accidental DTO
 * serialization. This is not a vault and must not be treated as a connection.
 */
export function createInstagramCodeVerifier({configuration:input,clientSecret,transport,clock=Date.now,timeoutMs=10000}={}){
 const config=configuration(input);
 if(!secret(clientSecret)||typeof transport!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)fail('INVALID_CONFIGURATION');
 return Object.freeze({async verifyCode(code){
  if(!secret(code)||code.length>4096)fail('INVALID_CODE');
  const controller=new AbortController();let timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new InstagramOAuthError('EXCHANGE_OUTCOME_UNKNOWN'));},timeoutMs);});
  async function request(url,init){
   if(controller.signal.aborted)fail('EXCHANGE_OUTCOME_UNKNOWN');
   const req=new Request(url,{...init,signal:controller.signal,redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
   const response=await transport(req);
   if(controller.signal.aborted)fail('EXCHANGE_OUTCOME_UNKNOWN');
   if(!(response instanceof Response)||response.redirected||response.url&&response.url!==url||!response.ok)fail('EXCHANGE_OUTCOME_UNKNOWN');
   if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))fail('INVALID_RESPONSE');
   const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>65536))fail('INVALID_RESPONSE');
   const reader=response.body?.getReader();if(!reader)fail('INVALID_RESPONSE');let size=0;const chunks=[];
   const cancel=()=>{reader.cancel().catch(()=>{});};controller.signal.addEventListener('abort',cancel,{once:true});
   try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>65536)fail('INVALID_RESPONSE');chunks.push(part.value);}}finally{controller.signal.removeEventListener('abort',cancel);reader.cancel().catch(()=>{});reader.releaseLock();}
   if(controller.signal.aborted)fail('EXCHANGE_OUTCOME_UNKNOWN');
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('INVALID_RESPONSE');}
  }
  async function exchange(){
   const form=new FormData();for(const [name,value] of Object.entries({client_id:config.appId,client_secret:clientSecret,grant_type:'authorization_code',redirect_uri:config.redirectUri,code}))form.set(name,value);
   const token=row(await request('https://api.instagram.com/oauth/access_token',{method:'POST',body:form}),['access_token','user_id','permissions']);
   if(!secret(token.access_token)||!id(token.user_id)||token.user_id!==config.expectedAccountId||typeof token.permissions!=='string'||token.permissions.length>2048)fail('ACCOUNT_OR_GRANT_MISMATCH');
   const scopes=token.permissions.split(',').map(s=>s.trim());if(scopes.length!==INSTAGRAM_SCOPES.length||new Set(scopes).size!==scopes.length||INSTAGRAM_SCOPES.some(s=>!scopes.includes(s)))fail('SCOPE_MISMATCH');
   // Fixed graph host and version; credentials never go into a URL.
   const identity=row(await request(`https://graph.instagram.com/${config.apiVersion}/me?fields=user_id%2Cusername`,{method:'GET',headers:{Authorization:`Bearer ${token.access_token}`}}),['user_id','username']);
   if(identity.user_id!==config.expectedAccountId||typeof identity.username!=='string'||! /^[A-Za-z0-9._]{1,30}$/.test(identity.username))fail('ACCOUNT_OR_GRANT_MISMATCH');
   if(controller.signal.aborted)fail('EXCHANGE_OUTCOME_UNKNOWN');
   const now=clock();if(!Number.isSafeInteger(now)||now<0)fail('INVALID_CLOCK');
   // No inferred expiry or connection state from the short-token response.
   const result={status:'identity_verified_not_stored',accountId:identity.user_id,username:identity.username,scopes:[...INSTAGRAM_SCOPES],verifiedAtMs:now,connected:false,canPublish:false};
   Object.defineProperty(result,'accessToken',{value:token.access_token,enumerable:false});verifiedResults.add(result);return Object.freeze(result);
  }
  try{return await Promise.race([exchange(),deadline]);}catch(error){controller.abort();if(error instanceof InstagramOAuthError)throw error;fail('EXCHANGE_OUTCOME_UNKNOWN');}finally{clearTimeout(timer);}
 }});
}
