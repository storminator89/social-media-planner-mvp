// Separate publishing authorization. Runtime requires an explicit feature gate.
import {MastodonPreflightError} from './diagnostics.mjs';
import {createHTTP,createDeadline} from '../oauth/x/http.mjs';
import {randomBrowserBinding as random,hashOAuthState as hash} from '../oauth/http-primitives.mjs';
export const INSTANCE='https://kanoa.de';
export const CALLBACK='/api/providers/mastodon/publishing/oauth/callback';
export const SCOPE='profile write:statuses';
const paths=new Set(['/.well-known/oauth-authorization-server','/api/v1/apps','/oauth/token','/oauth/revoke','/api/v1/accounts/verify_credentials']);
const secret=v=>typeof v==='string'&&/^[A-Za-z0-9._~+/-]{1,4096}$/.test(v);
const requireValue=(v,code)=>{if(!v)throw new Error(code);};
export function configuration(source){
 requireValue(source&&Object.keys(source).sort().join(',')==='instance,siteId,siteOrigin','CONFIGURATION_REQUIRED');
 const u=new URL(source.siteOrigin);requireValue(u.protocol==='https:'&&u.origin===source.siteOrigin&&!u.username&&!u.password,'SITE_ORIGIN_INVALID');
 requireValue(source.instance===INSTANCE&&/^[A-Za-z0-9_-]{1,100}$/.test(source.siteId),'INSTANCE_NOT_APPROVED');
 return Object.freeze({...source,callback:source.siteOrigin+CALLBACK,scope:SCOPE});
}
export async function pkce(verifier){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
/** Inject an audited server-only transport for this fixed public provider.
 * URLs are fixed; metadata never controls destinations. No global fetch fallback.
 * authorizeAction verifies current, action-time approval for persistent credentials.
 */
export function createMastodonPublishingFlow({config,store,transport,authorizeAction,clock=Date.now,httpOptions,offlineFixture=false,runtimeEnabled=false}){
 requireValue((offlineFixture===true||runtimeEnabled===true)&&store?.context?.purpose==='publishing'&&store.context.scope===SCOPE,'PUBLISHING_DISABLED');
 requireValue(config?.scope===SCOPE&&config.siteId===store.context.siteId&&config.instance===INSTANCE&&store.context.instance===INSTANCE&&config.callback===store.context.callback,'PUBLISHING_CONFIGURATION_MISMATCH');
 requireValue(typeof authorizeAction==='function','AUTHORIZATION_REQUIRED');const http=createHTTP(transport,httpOptions);
 const permit=async(action,deadline,expiresAtMs)=>requireValue(await deadline.run(Promise.resolve().then(()=>{deadline.check();if(expiresAtMs!==undefined)requireValue(expiresAtMs>clock(),'ATTEMPT_EXPIRED');return authorizeAction({action,ownerId:store.context.ownerId,instance:INSTANCE,scope:SCOPE,redirectUri:config.callback},{signal:deadline.signal});}))===true,'ACTION_NOT_APPROVED');
 async function call(path,init,deadline){requireValue(paths.has(path),'ENDPOINT_REJECTED');const r=await http(INSTANCE+path,init,deadline,{allowEmpty:path==='/oauth/revoke'});requireValue(r.status>=200&&r.status<300,'PROVIDER_REJECTED');return r.body;}
 const post=(data)=>({method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data)});
 return {
 async begin(binding){requireValue(/^[A-Za-z0-9_-]{43}$/.test(binding),'BINDING_INVALID');const d=createDeadline(15000);let stage='storage_read',reservationStarted=false;try{
  const previous=await d.run(store.read());requireValue(!previous||['revoked','recovered'].includes(previous.value.phase),'ATTEMPT_ALREADY_EXISTS');
  stage='authorization';await permit('register_separate_publishing_application_and_start',d);
  stage='metadata';
  const metadata=await call('/.well-known/oauth-authorization-server',{method:'GET'},d);
  requireValue([INSTANCE,INSTANCE+'/'].includes(metadata.issuer)&&metadata.authorization_endpoint===INSTANCE+'/oauth/authorize'&&metadata.token_endpoint===INSTANCE+'/oauth/token'&&metadata.app_registration_endpoint===INSTANCE+'/api/v1/apps'&&Array.isArray(metadata.scopes_supported)&&metadata.scopes_supported.every(v=>typeof v==='string')&&SCOPE.split(' ').every(scope=>metadata.scopes_supported.includes(scope))&&Array.isArray(metadata.code_challenge_methods_supported)&&metadata.code_challenge_methods_supported.every(v=>typeof v==='string')&&metadata.code_challenge_methods_supported.includes('S256'),'REQUIRED_CAPABILITY_UNAVAILABLE');
  // Durable reservation before registration: timeout/crash/concurrent clicks never auto-register twice.
  reservationStarted=true;
  let row=await d.run(store.write(previous,{phase:'registration_outcome_unknown',createdAtMs:clock()}));
  const app=await call('/api/v1/apps',post({client_name:'Takt separate publishing test',redirect_uris:config.callback,scopes:SCOPE,website:config.siteOrigin}),d);
  requireValue(secret(app.client_id)&&secret(app.client_secret)&&Array.isArray(app.scopes)&&app.scopes.join(' ')===SCOPE&&Array.isArray(app.redirect_uris)&&app.redirect_uris.length===1&&app.redirect_uris[0]===config.callback&&(app.client_secret_expires_at===0||Number.isSafeInteger(app.client_secret_expires_at)&&app.client_secret_expires_at*1000>clock()+300000),'APPLICATION_RESPONSE_INVALID');
  const state=random(),verifier=random(),expiresAtMs=clock()+300000;
  row=await d.run(store.write(row,{phase:'pending',clientId:app.client_id,clientSecret:app.client_secret,stateHash:await hash(state),bindingHash:await hash(binding),verifier,expiresAtMs}));
  const url=new URL(INSTANCE+'/oauth/authorize');for(const [k,v]of Object.entries({response_type:'code',client_id:app.client_id,redirect_uri:config.callback,scope:SCOPE,state,code_challenge:await pkce(verifier),code_challenge_method:'S256',force_login:'true'}))url.searchParams.set(k,v);
  d.check();return{authorizationUrl:url.href,expiresAtMs};
 }catch(error){if(!reservationStarted)throw new MastodonPreflightError(stage,error);throw error;}finally{d.close();}},
 async revoke(){const d=createDeadline(15000);try{let row=await d.run(store.read());requireValue(['linked','verification_pending'].includes(row?.value.phase),'NO_REVOCABLE_GRANT');await permit('revoke_publishing',d);const v=row.value;row=await d.run(store.write(row,{...v,phase:'revocation_pending'}));await call('/oauth/revoke',post({client_id:v.clientId,client_secret:v.clientSecret,token:v.accessToken}),d);await d.run(store.write(row,{phase:'revoked',revokedAtMs:clock()}));return{phase:'revoked'};}finally{d.close();}},
 async complete({state,binding,code,error}){const d=createDeadline(15000);try{
  const [stateHash,bindingHash]=await d.run(Promise.all([hash(state),hash(binding)]));requireValue(error==='access_denied'&&!code||!error&&secret(code),'CALLBACK_INVALID');
  let row=await d.run(store.read()),v=row?.value;requireValue(v?.phase==='pending'&&v.stateHash===stateHash&&v.bindingHash===bindingHash&&v.expiresAtMs>clock(),'ATTEMPT_INVALID');
  // Validate and win the durable one-time claim BEFORE invoking a potentially
  // consumable approval hook. Invalid, expired, replayed and racing callbacks
  // cannot spend an approval. A provider denial requires no approval at all.
  row=await d.run(store.write(row,{...v,phase:error?'declined':'authorization_outcome_unknown'}));if(error)return{phase:'declined'};
  requireValue(v.expiresAtMs>clock(),'ATTEMPT_EXPIRED');
  await permit('exchange_code_and_store_publishing',d,v.expiresAtMs);
  requireValue(v.expiresAtMs>clock(),'ATTEMPT_EXPIRED');
  row=await d.run(store.write(row,{...v,phase:'exchange_outcome_unknown'}));
  const token=await call('/oauth/token',post({grant_type:'authorization_code',code,client_id:v.clientId,client_secret:v.clientSecret,redirect_uri:config.callback,code_verifier:v.verifier}),d);
  requireValue(secret(token.access_token),'TOKEN_INVALID');
  row=await d.run(store.write(row,{phase:'verification_pending',accessToken:token.access_token,clientId:v.clientId,clientSecret:v.clientSecret,receivedAtMs:clock()}));
  requireValue(typeof token.token_type==='string'&&token.token_type.toLowerCase()==='bearer'&&token.scope===SCOPE&&!token.refresh_token,'TOKEN_INVALID');
  requireValue(token.expires_in===undefined||Number.isSafeInteger(token.expires_in)&&token.expires_in>0&&token.expires_in<=31536000,'TOKEN_EXPIRY_INVALID');
  const expiresAt=token.expires_in===undefined?null:clock()+token.expires_in*1000;
  const account=await call('/api/v1/accounts/verify_credentials',{method:'GET',headers:{Authorization:'Bearer '+token.access_token}},d);
  requireValue(typeof account.id==='string'&&/^\d{1,40}$/.test(account.id)&&typeof account.acct==='string'&&/^[A-Za-z0-9_]{1,100}$/.test(account.acct),'PROFILE_INVALID');
  const linked={phase:'linked',accessToken:token.access_token,clientId:v.clientId,clientSecret:v.clientSecret,subject:account.id,acct:account.acct,verifiedAtMs:clock(),expiresAt,scope:SCOPE,purpose:'publishing'};
  await d.run(store.write(row,linked));return{phase:'linked'};
 }finally{d.close();}}
 };
}
