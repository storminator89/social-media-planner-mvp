import {createXOAuthConfiguration,parseCallback,hash,opaque} from './contract.mjs';
import {createXOAuthLifecycle} from './lifecycle.mjs';
import {XOAuthStore,createXCipher} from './store.mjs';
import {trustedRequestOwner,boundedJSON,OAUTH_HTTP_HEADERS} from '../http-primitives.mjs';
export const X_CALLBACK_PATH='/api/providers/x/oauth/callback';
const paths=new Set(['/api/providers/x/oauth/readiness','/api/providers/x/oauth/start',X_CALLBACK_PATH,'/api/providers/x/refresh','/api/providers/x/disconnect']);
const headers={...OAUTH_HTTP_HEADERS,'Content-Type':'application/json; charset=utf-8'};
const json=(v,status=200,extra={})=>new Response(JSON.stringify(v),{status,headers:{...headers,...extra}});
const failure=(code='X_OAUTH_UNAVAILABLE',status=503)=>json({error:{code,message:'Die X-Verbindung ist nicht verfügbar. Status prüfen; nicht automatisch wiederholen.'}},status);
const closed=()=>json({schemaVersion:1,provider:'x',stage:'not_configured',connected:false,canPublish:false,canStart:false,canRefresh:false,canDisconnect:false,connection:null,blockerCodes:['X_RUNTIME_AND_AUTHORIZATION_REQUIRED','X_COST_APPROVAL_REQUIRED','PUBLISHING_DISABLED']});
function cookieName(h){return '__Host-takt-x-'+h;}
function cookie(h,value){return`${cookieName(h)}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${value?300:0}`;}
function readCookie(request,h){const source=request.headers.get('Cookie');if(!source||source.length>16384)return null;const values=source.split(';').map(x=>x.trim()).filter(x=>x.startsWith(cookieName(h)+'=')).map(x=>x.slice(cookieName(h).length+1));return values.length===1&&/^[A-Za-z0-9_-]{43}$/.test(values[0])?values[0]:null;}
function redirect(config,outcome,h){return new Response(null,{status:303,headers:{...OAUTH_HTTP_HEADERS,Location:config.siteOrigin+'/?x='+outcome+'#connections',...(h?{'Set-Cookie':cookie(h,'')}:{})}});}
export async function readXRuntime(env){
 if(env.TAKT_X_ENABLED!=='true')return null;
 const source=env.TAKT_X_CONFIGURATION,secret=env.TAKT_X_CLIENT_SECRET,keyring=env.TAKT_X_KEYRING_JSON;
 if(typeof source!=='string'||source.length>8192||typeof secret!=='string'||!secret||secret.length>4096||!/^[\x21-\x7e]+$/.test(secret)||typeof keyring!=='string')return null;
 try{return{configuration:await createXOAuthConfiguration(JSON.parse(source)),clientSecret:secret,cipher:await createXCipher(keyring)};}catch{return null;}
}
/** authorizeAction is an audited server policy, never a flag or browser payload.
 * It must check current grant/storage/cost permissions at every requested action.
 * No policy is composed by default. Real provider requests require explicit setup. */
export async function handleXOAuth(request,env={}, {transport,authorizeAction,clock=Date.now}={}){
 const url=new URL(request.url);if(!paths.has(url.pathname))return null;
 const callback=url.pathname===X_CALLBACK_PATH,readiness=url.pathname.endsWith('/readiness');
 if(request.method!==(callback||readiness?'GET':'POST'))return failure('METHOD_NOT_ALLOWED',405);
 let owner;try{owner=trustedRequestOwner(request);}catch{return failure('SIGN_IN_REQUIRED',401);}
 if(!callback&&(request.headers.get('Sec-Fetch-Site')==='cross-site'||request.headers.has('Origin')&&request.headers.get('Origin')!==url.origin))return failure('CROSS_ORIGIN_REQUEST',403);
 const runtime=await readXRuntime(env);
 if(!runtime||typeof transport!=='function'||typeof authorizeAction!=='function')return readiness?closed():failure('X_NOT_CONFIGURED');
 const config=runtime.configuration;if(url.origin!==config.siteOrigin)return failure('SITE_ORIGIN_MISMATCH',403);
 let stateHash=null;
 try{
  const store=new XOAuthStore(env.DB,{configuration:config,cipher:runtime.cipher});
  if(readiness){if(url.search)return failure('INVALID_REQUEST',400);const m=await store.getMetadata(owner,clock());return json({schemaVersion:1,provider:'x',stage:m.state,connected:m.connected,canPublish:false,canStart:m.state==='not_connected',canRefresh:config.offlineAccess&&['linked','expired'].includes(m.state),canDisconnect:['linked','expired','outcome_unknown'].includes(m.state),connection:m.connectionId?{id:m.connectionId,revision:m.revision,expiresAtMs:m.expiresAtMs}:null,blockerCodes:['PUBLISHING_DISABLED']});}
  const flow=createXOAuthLifecycle({enabled:true,configuration:config,clientSecret:runtime.clientSecret,store,transport,authorizeAction,clock});
  if(callback){const parsed=parseCallback(config,request.url);stateHash=await hash(parsed.state);const origin=request.headers.get('Origin');if(origin&&origin!==config.siteOrigin&&origin!=='https://x.com')return redirect(config,'failed',stateHash);const binding=readCookie(request,stateHash);if(!binding)return redirect(config,'failed',stateHash);const result=await flow.completeCallback({ownerId:owner,browserBinding:binding,callbackUrl:request.url});if(result.state==='authorization_declined')return redirect(config,'cancelled',stateHash);if(result.state!=='credentials_committed')return redirect(config,'unconfirmed',stateHash);const m=await store.getMetadata(owner,clock());return redirect(config,m.connected&&m.connectionId===result.connectionId&&m.revision===result.revision?'linked':'unconfirmed',stateHash);}
  if(url.search||url.hash||request.headers.get('Origin')!==config.siteOrigin||request.headers.get('X-Planner-Request')!=='1')return failure('CROSS_ORIGIN_REQUEST',403);
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type')??''))return failure('JSON_REQUIRED',415);
  const body=await boundedJSON(request);
  if(url.pathname.endsWith('/start')){if(Object.keys(body).length)return failure('INVALID_REQUEST',400);const binding=opaque(),result=await flow.begin({ownerId:owner,browserBinding:binding});if(result.state!=='authorization_prepared')return failure();const h=await hash(new URL(result.authorizationUrl).searchParams.get('state'));return json({authorizationUrl:result.authorizationUrl,expiresAtMs:result.expiresAtMs},200,{'Set-Cookie':cookie(h,binding)});}
  if(Object.keys(body).sort().join(',')!=='connectionId,expectedRevision'||typeof body.connectionId!=='string'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1)return failure('INVALID_REQUEST',400);
  const input={ownerId:owner,...body};
  if(url.pathname.endsWith('/disconnect')){const result=await flow.disconnectOnce({...input,revokeProviderAccess:false});return result.state==='locally_disconnected'?json(result):failure();}
  const result=await flow.refreshOnce(input);if(result.state!=='credentials_committed')return failure();const m=await store.getMetadata(owner,clock());if(!m.connected||m.revision!==result.revision||m.connectionId!==result.connectionId)return failure();return json({state:'linked',connected:true,canPublish:false,connection:{id:m.connectionId,revision:m.revision,expiresAtMs:m.expiresAtMs}});
 }catch(error){if(callback)return redirect(config,'unconfirmed',stateHash);return failure(error?.code==='SIGN_IN_REQUIRED'?'SIGN_IN_REQUIRED':'X_OAUTH_UNAVAILABLE',error?.status===401?401:503);}
}
