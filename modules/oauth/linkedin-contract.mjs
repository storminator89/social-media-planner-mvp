/** Offline server contract only. No URL redirect, fetch, secret access or token exchange. */
export const LINKEDIN_REQUIRED_SCOPES=Object.freeze(['openid','profile','w_member_social']);
export const LINKEDIN_WEB_FLOW_VERSION='linkedin-web-preparation-v1';
export const LINKEDIN_CALLBACK_PATH='/api/providers/linkedin/oauth/callback';
export const LINKEDIN_AUTHORIZATION_ENDPOINT='https://www.linkedin.com/oauth/v2/authorization';
export const LINKEDIN_TOKEN_ENDPOINT='https://www.linkedin.com/oauth/v2/accessToken';
export const LINKEDIN_DISCOVERY_ISSUER='https://www.linkedin.com/oauth';
export const LINKEDIN_OAUTH_CAPABILITIES=Object.freeze({initiation:false,callback:false,tokenExchange:false,accountVerification:false,publishing:false});
export class OAuthContractError extends Error{constructor(code,message){super(message);this.code=code;}}
const validatedConfigurations=new WeakSet();
function invalid(code='INVALID_OAUTH_CONFIGURATION'){throw new OAuthContractError(code,'Der OAuth-Vorbereitungsvertrag wurde nicht erfüllt.');}
function wellFormed(value){if(typeof value!=='string')return false;for(let i=0;i<value.length;i++){const n=value.charCodeAt(i);if(n>=0xd800&&n<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}else if(n>=0xdc00&&n<=0xdfff)return false;}return true;}
function configurationSnapshot(input){
  const keys=['siteId','siteOrigin','clientId','redirectUri','accountType','appConfigVersion'];
  if(!input||typeof input!=='object'||Object.getPrototypeOf(input)!==Object.prototype)invalid();
  const descriptors=Object.getOwnPropertyDescriptors(input);
  if(Reflect.ownKeys(descriptors).length!==keys.length)invalid();
  const snapshot={};
  for(const key of keys){const d=descriptors[key];if(!d||!Object.hasOwn(d,'value')||!d.enumerable||typeof d.value!=='string')invalid();snapshot[key]=d.value;}
  return Object.freeze(snapshot);
}
async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(n=>n.toString(16).padStart(2,'0')).join('');}
function validOwner(owner){return typeof owner==='string'&&owner.length>0&&owner.length<=256&&owner.trim()===owner&&!/[\u0000-\u001f\u007f]/.test(owner);}

/** This validates server-owned syntax, NOT Site ownership, app approval or OAuth readiness. */
export async function createLinkedInOfflineConfiguration(source){
  // Snapshot primitives synchronously before any await; never re-read mutable input.
  const input=configurationSnapshot(source);
  if(!validOwner(input.siteId)||!wellFormed(input.siteId)||input.accountType!=='personal'||input.appConfigVersion!=='v1')invalid();
  if(typeof input.clientId!=='string'||!/^[A-Za-z0-9_-]{3,128}$/.test(input.clientId))invalid();
  let origin;try{origin=new URL(input.siteOrigin);}catch{invalid();}
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.port||origin.search||origin.hash||input.siteOrigin!==origin.origin)invalid();
  if(input.redirectUri!==origin.origin+LINKEDIN_CALLBACK_PATH)invalid();
  const scopeFingerprint=await hash(JSON.stringify(LINKEDIN_REQUIRED_SCOPES));
  const configFields={provider:'linkedin',flowVersion:LINKEDIN_WEB_FLOW_VERSION,siteId:input.siteId,siteOrigin:input.siteOrigin,clientId:input.clientId,redirectUri:input.redirectUri,scopeFingerprint};
  const context={action:'connect_new',targetConnectionId:null,appConfigVersion:input.appConfigVersion};
  const config=Object.freeze({...configFields,scopeFingerprint,configFingerprint:await hash(JSON.stringify(configFields)),contextFingerprint:await hash(JSON.stringify(context)),context:Object.freeze(context),capabilities:LINKEDIN_OAUTH_CAPABILITIES});validatedConfigurations.add(config);return config;
}
export function assertLinkedInOfflineConfiguration(config){if(!config||!validatedConfigurations.has(config))invalid('INVALID_CALLBACK_CONFIGURATION');}
/** Generates no credential/grant; intended only for offline integration until flow approval. */
export async function createOfflineNonce(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);const nonce=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');return Object.freeze({nonce,nonceFingerprint:await hash(nonce)});}

/** Server-internal result may contain the callback code/state. Never send or log it. */
export function parseLinkedInCallback(config,rawUrl){
  if(!config||!validatedConfigurations.has(config)||config.flowVersion!==LINKEDIN_WEB_FLOW_VERSION||typeof config.redirectUri!=='string')invalid('INVALID_CALLBACK_CONFIGURATION');
  if(typeof rawUrl!=='string'||!rawUrl.startsWith(config.redirectUri+'?')||rawUrl.length>8192||/[\u0000-\u001f\u007f]/.test(rawUrl)||!wellFormed(rawUrl)||/%(?![0-9a-fA-F]{2})/.test(rawUrl))invalid('INVALID_CALLBACK');
  let url;try{url=new URL(rawUrl);decodeURIComponent(url.search.replaceAll('+',' '));}catch{invalid('INVALID_CALLBACK');}
  if(url.origin+url.pathname!==config.redirectUri||url.hash||url.username||url.password)invalid('INVALID_CALLBACK');
  const allowed=new Set(['state','code','error','error_description']);
  for(const key of url.searchParams.keys())if(!allowed.has(key)||url.searchParams.getAll(key).length!==1)invalid('INVALID_CALLBACK');
  const state=url.searchParams.get('state');
  if(!state||!/^[A-Za-z0-9_-]{43}$/.test(state))invalid('INVALID_CALLBACK');
  const code=url.searchParams.get('code'),error=url.searchParams.get('error'),description=url.searchParams.get('error_description');
  if((code===null)===(error===null)||description!==null&&error===null)invalid('INVALID_CALLBACK');
  if(code!==null){if(code.length<1||code.length>4096||!/^[\x21-\x7e]+$/.test(code))invalid('INVALID_CALLBACK');return Object.freeze({kind:'code',state,authorizationCode:code});}
  if(!error||error.length>128||!/^[a-zA-Z0-9_-]+$/.test(error)||description!==null&&(description.length>1024||!wellFormed(description)||/[\u0000-\u001f\u007f]/.test(description)))invalid('INVALID_CALLBACK');
  // Provider text is never included in normal results or error messages.
  return Object.freeze({kind:'denied',state});
}

