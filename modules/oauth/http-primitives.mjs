import {LINKEDIN_REQUIRED_SCOPES,LINKEDIN_AUTHORIZATION_ENDPOINT,assertLinkedInOfflineConfiguration} from './linkedin-contract.mjs';

export const LINKEDIN_START_PATH='/api/providers/linkedin/oauth/start';
export const LINKEDIN_DISCONNECT_PATH='/api/providers/linkedin/disconnect';
export const OAUTH_HTTP_HEADERS=Object.freeze({'Cache-Control':'private, no-store','Pragma':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Vary':'oai-authenticated-user-id','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"});
export class OAuthHttpError extends Error{constructor(status,code){super('Die Kontoverbindung konnte nicht sicher verarbeitet werden.');this.status=status;this.code=code;}}
function fail(status,code){throw new OAuthHttpError(status,code);}
export function trustedRequestOwner(request){const owner=request.headers.get('oai-authenticated-user-id');if(typeof owner!=='string'||!owner||owner.length>256||owner.trim()!==owner||!owner.isWellFormed()||/[\u0000-\u001f\u007f]/.test(owner))fail(401,'SIGN_IN_REQUIRED');return owner;}
export function assertSameOriginPost(request,config){
 assertLinkedInOfflineConfiguration(config);const url=new URL(request.url);
 if(request.method!=='POST')fail(405,'METHOD_NOT_ALLOWED');
 if(url.origin!==config.siteOrigin||url.search||url.hash||request.headers.get('Origin')!==config.siteOrigin||request.headers.get('X-Planner-Request')!=='1'||request.headers.get('Sec-Fetch-Site')==='cross-site')fail(403,'CROSS_ORIGIN_REQUEST');
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type')??''))fail(415,'JSON_REQUIRED');
}
export async function boundedJSON(request,maxBytes=512,timeoutMs=1000){
 const length=request.headers.get('Content-Length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>maxBytes))fail(413,'REQUEST_TOO_LARGE');
 const reader=request.body?.getReader();if(!reader)fail(400,'INVALID_REQUEST');let bytes=0,parts=[],timer;const expires=performance.now()+timeoutMs;
 const checkDeadline=()=>{if(performance.now()>=expires)fail(408,'REQUEST_TIMEOUT');};
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new OAuthHttpError(408,'REQUEST_TIMEOUT')),timeoutMs);});
 try{while(true){checkDeadline();const {value,done}=await Promise.race([reader.read(),timeout]);checkDeadline();if(done)break;if(!(value instanceof Uint8Array))fail(400,'INVALID_REQUEST');bytes+=value.byteLength;if(bytes>maxBytes)fail(413,'REQUEST_TOO_LARGE');parts.push(new Uint8Array(value));}}
 catch(error){void reader.cancel().catch(()=>{});if(error instanceof OAuthHttpError)throw error;fail(400,'INVALID_REQUEST');}
 finally{clearTimeout(timer);}
 const data=new Uint8Array(bytes);let offset=0;for(const part of parts){data.set(part,offset);offset+=part.byteLength;}
 checkDeadline();let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}catch{fail(400,'INVALID_REQUEST');}checkDeadline();if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'INVALID_REQUEST');return value;
}
export function randomBrowserBinding(){const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export async function hashOAuthState(state){if(typeof state!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(state))fail(400,'INVALID_REQUEST');return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(state)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
function cookieName(stateHash){if(typeof stateHash!=='string'||!/^[a-f0-9]{64}$/.test(stateHash))fail(400,'INVALID_REQUEST');return '__Host-takt-li-'+stateHash;}
export function browserBindingCookie(stateHash,binding){if(typeof binding!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(binding))fail(400,'INVALID_REQUEST');return `${cookieName(stateHash)}=${binding}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=300`;}
export function clearBrowserBindingCookie(stateHash){return `${cookieName(stateHash)}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;}
export function readBrowserBinding(request,stateHash){
 const expected=cookieName(stateHash),source=request.headers.get('Cookie');if(!source||source.length>16384)return null;
 const matches=[];for(const part of source.split(';')){const equal=part.indexOf('=');if(equal<0)continue;if(part.slice(0,equal).trim()===expected)matches.push(part.slice(equal+1).trim());}
 return matches.length===1&&/^[A-Za-z0-9_-]{43}$/.test(matches[0])?matches[0]:null;
}
export function linkedInAuthorizationURL(config,{state,nonce}={}){
 assertLinkedInOfflineConfiguration(config);for(const value of [state,nonce])if(typeof value!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value))fail(400,'INVALID_REQUEST');
 const url=new URL(LINKEDIN_AUTHORIZATION_ENDPOINT);url.searchParams.set('response_type','code');url.searchParams.set('client_id',config.clientId);url.searchParams.set('redirect_uri',config.redirectUri);url.searchParams.set('scope',LINKEDIN_REQUIRED_SCOPES.join(' '));url.searchParams.set('state',state);url.searchParams.set('nonce',nonce);return url.href;
}
export function callbackRedirect(config,outcome,stateHash=null){assertLinkedInOfflineConfiguration(config);if(!['linked','cancelled','failed','unconfirmed'].includes(outcome))fail(400,'INVALID_REQUEST');const headers=new Headers(OAUTH_HTTP_HEADERS);headers.set('Location',config.siteOrigin+'/?linkedin='+outcome+'#connections');if(stateHash)headers.set('Set-Cookie',clearBrowserBindingCookie(stateHash));return new Response(null,{status:303,headers});}
