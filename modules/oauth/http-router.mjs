import {readLinkedInRuntimeConfiguration} from './runtime-config.mjs';
import {parseLinkedInCallback,LINKEDIN_CALLBACK_PATH,LINKEDIN_REQUIRED_SCOPES} from './linkedin-contract.mjs';
import {createLinkedInConfidentialWebFlow} from './linkedin-web-transport.mjs';
import {createTokenCipherFromRuntime} from '../providers/token-cipher.mjs';
import {CredentialStore} from '../providers/credential-store.mjs';
import {LINKEDIN_START_PATH,LINKEDIN_DISCONNECT_PATH,OAUTH_HTTP_HEADERS,OAuthHttpError,trustedRequestOwner,assertSameOriginPost,boundedJSON,randomBrowserBinding,hashOAuthState,browserBindingCookie,readBrowserBinding,linkedInAuthorizationURL,callbackRedirect} from './http-primitives.mjs';

export const LINKEDIN_READINESS_PATH='/api/providers/linkedin/oauth/readiness';
const routePaths=new Set([LINKEDIN_START_PATH,LINKEDIN_CALLBACK_PATH,LINKEDIN_DISCONNECT_PATH,LINKEDIN_READINESS_PATH]);
const closed=Object.freeze({initiation:false,callback:false,tokenExchange:false,accountVerification:false,publishing:false});
const unconfigured=Object.freeze(['OAUTH_NOT_CONFIGURED','SITE_CALLBACK_IDENTITY_UNVERIFIED','REGISTERED_APP_CONFIGURATION_REQUIRED','AUTHORIZATION_RESPONSE_PROTECTION_UNVERIFIED','SECURE_TOKEN_LIFECYCLE_UNAVAILABLE','ACCOUNT_TARGET_UNCONFIRMED','PUBLISHING_DISABLED']);
function requestBudget(milliseconds){
 const expires=performance.now()+milliseconds;
 function check(){if(performance.now()>=expires)throw new OAuthHttpError(504,'OAUTH_OUTCOME_UNKNOWN');}
 return{async run(operation){check();let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new OAuthHttpError(504,'OAUTH_OUTCOME_UNKNOWN')),Math.max(1,expires-performance.now()));});try{const result=await Promise.race([Promise.resolve().then(()=>{check();return operation();}),timeout]);check();return result;}finally{clearTimeout(timer);}}};
}
function json(value,status=200,extra={}){return new Response(JSON.stringify(value),{status,headers:{...OAUTH_HTTP_HEADERS,'Content-Type':'application/json; charset=utf-8',...extra}});}
function failure(status=503,code='OAUTH_UNAVAILABLE'){return json({error:{code,message:'Die Kontoverbindung ist nicht verfügbar. Bitte den Status erneut prüfen.'}},status);}
function sameAttempt(binding,owner,hash,config){return binding&&binding.ownerId===owner&&binding.siteId===config.siteId&&binding.configFingerprint===config.configFingerprint&&binding.contextFingerprint===config.contextFingerprint&&binding.stateHash===hash;}
function strictFields(body,keys){return Object.keys(body).length===keys.length&&keys.every(key=>Object.hasOwn(body,key));}
function closedReadiness(){return{schemaVersion:1,provider:'linkedin',stage:'not_configured',capabilities:closed,targetConfirmed:false,requiredScopes:LINKEDIN_REQUIRED_SCOPES,blockerCodes:unconfigured,authorizationUrl:null,connection:null,canDisconnect:false};}
function metadataDTO(meta){
 const stages={not_connected:'ready',identity_verified:'linked',expired:'expired',disconnected:'disconnected'};const stage=stages[meta?.state];
 if(!stage||meta.provider!=='linkedin'||meta.canPublish!==false||meta.canRefresh!==false)throw new Error('Invalid internal connection metadata');
 const hasConnection=stage!=='ready';if(hasConnection&&(typeof meta.connectionId!=='string'||!meta.connectionId||!Number.isSafeInteger(meta.revision)||meta.revision<0||!(meta.expiresAtMs===null||Number.isSafeInteger(meta.expiresAtMs)&&meta.expiresAtMs>=0)))throw new Error('Invalid internal connection metadata');
 return{schemaVersion:1,provider:'linkedin',stage,capabilities:{initiation:stage==='ready',callback:true,tokenExchange:true,accountVerification:true,publishing:false},targetConfirmed:true,requiredScopes:LINKEDIN_REQUIRED_SCOPES,blockerCodes:stage==='expired'?['CONNECTION_EXPIRED','RECONNECT_UNAVAILABLE','PUBLISHING_DISABLED']:stage==='disconnected'?['CONNECTION_REMOVED','RECONNECT_UNAVAILABLE','PUBLISHING_DISABLED']:['PUBLISHING_DISABLED'],authorizationUrl:null,connection:hasConnection?{id:meta.connectionId,revision:meta.revision,status:stage,expiresAtMs:meta.expiresAtMs}:null,canDisconnect:stage==='linked'||stage==='expired'};
}

/** Only native server env, Dispatch owner and an explicitly composed provider
 * transport are accepted. This is account linking, never a replacement Site login. */
export async function handleLinkedInOAuth(request,env={}, {transport,clock=Date.now,requestTimeoutMs=15000}={}){
 const url=new URL(request.url);if(!routePaths.has(url.pathname))return null;
 const isCallback=url.pathname===LINKEDIN_CALLBACK_PATH&&request.method==='GET';
 if(url.pathname===LINKEDIN_READINESS_PATH&&request.method!=='GET')return failure(405,'METHOD_NOT_ALLOWED');
 if(!Number.isSafeInteger(requestTimeoutMs)||requestTimeoutMs<1||requestTimeoutMs>30000)return failure();const budget=requestBudget(requestTimeoutMs);
 let settings;try{settings=await budget.run(()=>readLinkedInRuntimeConfiguration(env));}catch{return failure();}
 // No transport, secret, key or deployment assertion can be inferred from a request.
 if(!settings.ready||typeof transport!=='function'){
  if(isCallback&&request.headers.get('Sec-Fetch-Site')==='cross-site')return failure(403,'OAUTH_DISABLED');
  try{trustedRequestOwner(request);}catch{return failure(401,'SIGN_IN_REQUIRED');}
  if(url.pathname===LINKEDIN_READINESS_PATH&&request.method==='GET')return json(closedReadiness());
  return failure(503,'OAUTH_NOT_CONFIGURED');
 }
 const config=settings.configuration;
 // Configuration pins the externally registered Site origin, not request Host/Origin.
 if(url.origin!==config.siteOrigin)return failure(403,'SITE_ORIGIN_MISMATCH');
 let stateHash=null,owner;
 if(isCallback){
  // Parse without side effects so a known per-attempt cookie can be cleared on failure.
  try{const parsed=parseLinkedInCallback(config,request.url);stateHash=await hashOAuthState(parsed.state);}catch{return callbackRedirect(config,'failed');}
  const origin=request.headers.get('Origin');if(origin&&origin!==config.siteOrigin&&origin!=='https://www.linkedin.com')return callbackRedirect(config,'failed',stateHash);
  try{owner=trustedRequestOwner(request);}catch{return callbackRedirect(config,'failed',stateHash);}
 }else{
  try{owner=trustedRequestOwner(request);}catch{return failure(401,'SIGN_IN_REQUIRED');}
  if(request.headers.get('Sec-Fetch-Site')==='cross-site'||request.headers.has('Origin')&&request.headers.get('Origin')!==config.siteOrigin)return failure(403,'CROSS_ORIGIN_REQUEST');
 }
 let vault;
 try{const cipher=await budget.run(()=>createTokenCipherFromRuntime({TAKT_TOKEN_KEYRING_JSON:settings.keyringSource}));vault=new CredentialStore(env.DB,{siteId:config.siteId,provider:'linkedin',configFingerprint:config.configFingerprint,contextFingerprint:config.contextFingerprint,cipher,clock});}
 catch{return isCallback?callbackRedirect(config,'unconfirmed',stateHash):failure(503,'TOKEN_STORE_UNAVAILABLE');}
 const createFlow=beforeExchange=>createLinkedInConfidentialWebFlow(env.DB,config,{clientSecret:settings.clientSecret,transport,operatingContract:settings.operatingContract,beforeExchange,clock});
 try{
  if(url.pathname===LINKEDIN_READINESS_PATH){if(request.method!=='GET')return failure(405,'METHOD_NOT_ALLOWED');return json(metadataDTO(await budget.run(()=>vault.getMetadata(owner))));}
  if(url.pathname===LINKEDIN_START_PATH){
   assertSameOriginPost(request,config);const body=await budget.run(()=>boundedJSON(request));if(!strictFields(body,['accountType'])||body.accountType!=='personal')return failure(400,'INVALID_REQUEST');
   const before=await budget.run(()=>vault.getMetadata(owner));if(before.state!=='not_connected')return failure(409,'RECONNECT_UNAVAILABLE');
   const flow=createFlow(async()=>false),binding=randomBrowserBinding(),attempt=await budget.run(()=>flow.begin(owner,binding)),hash=await hashOAuthState(attempt.state);
   // If this fails, the unexposed state simply expires. Never send an OAuth URL first.
   await budget.run(()=>vault.createInstallTicket(owner,{stateHash:hash,expiresAtMs:attempt.expiresAtMs}));
   return json({authorizationUrl:linkedInAuthorizationURL(config,attempt),expiresAtMs:attempt.expiresAtMs},200,{'Set-Cookie':browserBindingCookie(hash,binding)});
  }
  if(isCallback){
   const binding=readBrowserBinding(request,stateHash);if(!binding)return callbackRedirect(config,'failed',stateHash);
   let ticket=null;
   const flow=createFlow(async binding=>{if(!sameAttempt(binding,owner,stateHash,config))return false;ticket=await budget.run(()=>vault.getInstallTicket(owner,stateHash));return true;});
   const verified=await budget.run(()=>flow.completeCallback({trustedOwner:owner,callbackUrl:request.url,browserBinding:binding}));
   if(verified.status==='provider_denied')return callbackRedirect(config,'cancelled',stateHash);
   if(verified.status!=='identity_verified'||!ticket||!sameAttempt(verified.attemptBinding,owner,stateHash,config))return callbackRedirect(config,verified.status?.includes('unknown')?'unconfirmed':'failed',stateHash);
   // This is the sole token intake: a result returned by the closed, validating flow.
   // No token/grant/subject/connection fields from Browser JSON ever reach the store.
   const meta=await budget.run(()=>vault.commitGrant(owner,{ticket,attemptBinding:verified.attemptBinding,grant:{accessToken:verified.accessToken,tokenType:'Bearer',subject:verified.identity.subject,scopes:[...verified.grantedScopes],expiresAtMs:verified.expiresAtMs}}));
   if(meta.state!=='identity_verified')return callbackRedirect(config,'unconfirmed',stateHash);
   return callbackRedirect(config,'linked',stateHash);
  }
  if(url.pathname===LINKEDIN_DISCONNECT_PATH){
   assertSameOriginPost(request,config);const body=await budget.run(()=>boundedJSON(request));if(!strictFields(body,['connectionId','expectedRevision'])||typeof body.connectionId!=='string'||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)return failure(400,'INVALID_REQUEST');
   const meta=await budget.run(()=>vault.getMetadata(owner));if(!['identity_verified','expired'].includes(meta.state)||meta.connectionId!==body.connectionId||meta.revision!==body.expectedRevision)return failure(409,'CREDENTIAL_REVISION_CONFLICT');
   await budget.run(()=>vault.disconnect(owner,body.connectionId,body.expectedRevision));
   return new Response(null,{status:204,headers:OAUTH_HTTP_HEADERS});
  }
  return failure(405,'METHOD_NOT_ALLOWED');
 }catch(error){
  if(isCallback)return callbackRedirect(config,'unconfirmed',stateHash);
  if(error instanceof OAuthHttpError)return failure(error.status,error.code);
  // Do not expose SQL, crypto, provider or runtime-secret exception messages.
  if(error?.status===409)return failure(409,'CONNECTION_STATE_CHANGED');
  return failure(503,'OAUTH_UNAVAILABLE');
 }
}
