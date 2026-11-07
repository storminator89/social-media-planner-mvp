const configurations = new WeakSet();
export const X_ENDPOINTS = Object.freeze({authorize:'https://x.com/i/oauth2/authorize',token:'https://api.x.com/2/oauth2/token',identity:'https://api.x.com/2/users/me',revoke:'https://api.x.com/2/oauth2/revoke'});
export const X_SCOPES = Object.freeze(['tweet.read','tweet.write','users.read']);
export class XOAuthError extends Error { constructor(code) { super(code); this.code=code; } }
export const fail = code => { throw new XOAuthError(code); };
export const own=(obj,key)=>Object.hasOwn(obj,key);
export function snapshot(input,keys,code='INVALID_INPUT') {
  if(!input||Object.getPrototypeOf(input)!==Object.prototype)fail(code);
  const descriptors=Object.getOwnPropertyDescriptors(input);
  if(Reflect.ownKeys(descriptors).length!==keys.length)fail(code);
  const result={};for(const key of keys){const d=descriptors[key];if(!d||!own(d,'value')||!d.enumerable)fail(code);result[key]=d.value;}return result;
}
export function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export function opaque(bytes=32){return url64(crypto.getRandomValues(new Uint8Array(bytes)));}
export function url64(bytes){let value='';for(const byte of bytes)value+=String.fromCharCode(byte);return btoa(value).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function challenge(verifier){return url64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));}
export const fingerprint=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export const textId=value=>typeof value==='string'&&value.length>0&&value.length<=256&&value.trim()===value&&value.isWellFormed()&&!/[\u0000-\u001f\u007f]/.test(value);
export const xId=value=>typeof value==='string'&&/^[1-9][0-9]{0,18}$/.test(value);
export const localId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
export const binding=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
export const verifier=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{86}$/.test(value);
export const token=value=>typeof value==='string'&&value.length<=8192&&/^[A-Za-z0-9\-._~+/]+=*$/.test(value);
export function now(clock){let value;try{value=clock();}catch{fail('CLOCK_INVALID');}if(!Number.isSafeInteger(value)||value<0||value>Number.MAX_SAFE_INTEGER-31536000000)fail('CLOCK_INVALID');return value;}
export function assertConfiguration(config){if(!configurations.has(config))fail('INVALID_SERVER_CONFIGURATION');return config;}
export async function createXOAuthConfiguration(input){
  const value=snapshot(input,['siteId','siteOrigin','clientId','redirectUri','appConfigVersion','offlineAccess'],'INVALID_SERVER_CONFIGURATION');
  if(!textId(value.siteId)||!textId(value.appConfigVersion)||typeof value.clientId!=='string'||!/^[A-Za-z0-9_-]{8,256}$/.test(value.clientId)||typeof value.offlineAccess!=='boolean')fail('INVALID_SERVER_CONFIGURATION');
  let origin;try{origin=new URL(value.siteOrigin);}catch{fail('INVALID_SERVER_CONFIGURATION');}
  if(origin.protocol!=='https:'||origin.origin!==value.siteOrigin||origin.username||origin.password||origin.port||!origin.hostname.includes('.')||/^[\d.]+$/.test(origin.hostname)||/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(origin.hostname)||value.redirectUri!==`${value.siteOrigin}/api/providers/x/oauth/callback`)fail('INVALID_SERVER_CONFIGURATION');
  const scopes=Object.freeze([...X_SCOPES,...(value.offlineAccess?['offline.access']:[])]);
  const config={...value,provider:'x',flowVersion:'x-confidential-pkce-v1',scopes};
  config.configFingerprint=await hash(JSON.stringify(config));
  freeze(config);configurations.add(config);return config;
}
export async function ownerContext(config,ownerId){assertConfiguration(config);if(!textId(ownerId))fail('OWNER_REQUIRED');const context={provider:'x',siteId:config.siteId,ownerId,clientId:config.clientId,configFingerprint:config.configFingerprint};context.contextFingerprint=await hash(JSON.stringify(context));return freeze(context);}
export function parseCallback(config,value){
  assertConfiguration(config);
  if(typeof value!=='string'||value.length>8192||/[\u0000-\u0020\u007f#]/.test(value))fail('INVALID_CALLBACK');
  const at=value.indexOf('?');if(at<0||value.slice(0,at)!==config.redirectUri)fail('INVALID_CALLBACK');
  let url;try{url=new URL(value);}catch{fail('INVALID_CALLBACK');}
  if(url.href!==value||url.hash||url.username||url.password)fail('INVALID_CALLBACK');
  const allowed=['state','code','error','error_description'];
  if([...url.searchParams.keys()].some(key=>!allowed.includes(key))||allowed.some(key=>url.searchParams.getAll(key).length>1))fail('INVALID_CALLBACK');
  const state=url.searchParams.get('state'),code=url.searchParams.get('code'),error=url.searchParams.get('error');
  if(!binding(state)||!!code===!!error||(code!==null&&!/^[\x21-\x7e]{1,4096}$/.test(code))||(error!==null&&!/^[A-Za-z_]{1,128}$/.test(error)))fail('INVALID_CALLBACK');
  return Object.freeze({state,code,error:!!error});
}
export function scopesFromResponse(value,config){
  if(typeof value!=='string'||value.length>512||!/^[a-z.]+(?: [a-z.]+)*$/.test(value))fail('SCOPES_INVALID');
  const actual=value.split(' ');if(new Set(actual).size!==actual.length||actual.length!==config.scopes.length||actual.some(scope=>!config.scopes.includes(scope)))fail('SCOPES_INVALID');
  return config.scopes;
}
export function tokenResponse(body,config,startedAt,previousRefresh=null){
  if(!body||own(body,'error')||own(body,'errors')||!token(body.access_token)||typeof body.token_type!=='string'||body.token_type.toLowerCase()!=='bearer'||!Number.isSafeInteger(body.expires_in)||body.expires_in<1||body.expires_in>31536000)fail('TOKEN_RESPONSE_INVALID');
  const scopes=scopesFromResponse(body.scope,config);
  let refreshToken=null;
  if(config.offlineAccess){refreshToken=own(body,'refresh_token')?body.refresh_token:previousRefresh;if(!token(refreshToken))fail('REFRESH_TOKEN_INVALID');}
  else if(own(body,'refresh_token'))fail('UNREQUESTED_REFRESH_TOKEN');
  return freeze({accessToken:body.access_token,refreshToken,tokenType:'Bearer',scopes,expiresAtMs:startedAt+body.expires_in*1000});
}
