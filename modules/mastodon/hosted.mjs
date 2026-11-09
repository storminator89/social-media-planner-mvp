import {readMastodonProfile} from './profile.mjs';
import {MastodonPreflightError,preflightFailure} from './diagnostics.mjs';
import {handleMastodonOAuth} from './http-router.mjs';
import {configuration,createMastodonFlow,INSTANCE,CALLBACK,SCOPE} from './oauth.mjs';
import {createKanoaSitesTransport,probeKanoaSitesMetadata} from './sites-transport.mjs';
import {createMastodonCipher} from './cipher.mjs';
import {MastodonStore} from './store.mjs';
import {trustedRequestOwner,boundedJSON,OAUTH_HTTP_HEADERS} from '../oauth/http-primitives.mjs';
const prefix='/api/providers/mastodon/oauth/';
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{...OAUTH_HTTP_HEADERS,'Content-Type':'application/json'}});
/** Hosted exclusively behind Sites Dispatch. Browser consent is explicit per
 * operation; no agent approval is inferred from configuration. Agent-driven
 * registration/exchange still requires its own action-time authorization.
 */
export async function handleHostedMastodon(request,env={}, {clock=Date.now,fetchImpl}={}){
 const url=new URL(request.url);if(!url.pathname.startsWith(prefix))return null;
 try{
  const owner=trustedRequestOwner(request);
  // This read-only endpoint lets the signed-in owner obtain the actual Site-scoped
  // identity for server configuration. A service bypass never supplies identity.
  if(url.pathname===prefix+'identity'){
   if(request.method!=='GET'||url.search||request.headers.get('Sec-Fetch-Site')==='cross-site')return response({error:'REQUEST_REJECTED'},403);
   return response({ownerId:owner});
  }
  if(!env.TAKT_MASTODON_OWNER_ID||owner!==env.TAKT_MASTODON_OWNER_ID){
   if(url.pathname===prefix+'readiness')return response({provider:'mastodon',phase:'not_configured',canStart:false,canPublish:false,instance:INSTANCE,scope:SCOPE});
   return response({error:'OWNER_NOT_CONFIGURED'},403);
  }
  // Explicit authenticated, same-origin, read-only diagnostic. No registration,
  // approval consumption, state reset, secret output, or DB writes.
  if(url.pathname===prefix+'diagnostics'){
   if(request.method!=='GET'||url.search||request.headers.get('Sec-Fetch-Site')==='cross-site'||request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin||request.headers.get('X-Planner-Request')!=='1')return response({error:'REQUEST_REJECTED'},403);
   let stage='configuration';
   try{
    if(env.TAKT_MASTODON_ENABLED!=='true')throw Error();
    const config=configuration(JSON.parse(env.TAKT_MASTODON_CONFIGURATION));
    if(url.origin!==config.siteOrigin)return response({error:'REQUEST_REJECTED'},403);
    stage='encryption';const cipher=await createMastodonCipher(env.TAKT_MASTODON_KEYRING_JSON);
    stage='storage_read';const store=new MastodonStore(env.DB,cipher,{provider:'mastodon',siteId:config.siteId,ownerId:owner,instance:INSTANCE,callback:config.callback,scope:SCOPE});await store.read();
    stage='metadata';await probeKanoaSitesMetadata({fetchImpl});
    return response({provider:'mastodon',diagnostic:'preflight_passed',registrationAttempted:false,canPublish:false});
   }catch(error){return response(preflightFailure(new MastodonPreflightError(stage,error)),503);}
  }
  if(url.pathname===prefix+'profile'){
   if(env.TAKT_MASTODON_ENABLED!=='true')return response({error:'NOT_CONFIGURED'},503);
   const config=configuration(JSON.parse(env.TAKT_MASTODON_CONFIGURATION));
   if(request.method!=='GET'||url.origin!==config.siteOrigin||url.search||url.hash||request.headers.get('Sec-Fetch-Site')==='cross-site'||request.headers.has('Origin')&&request.headers.get('Origin')!==config.siteOrigin||request.headers.get('X-Planner-Request')!=='1')return response({error:'REQUEST_REJECTED'},403);
   const cipher=await createMastodonCipher(env.TAKT_MASTODON_KEYRING_JSON),store=new MastodonStore(env.DB,cipher,{provider:'mastodon',siteId:config.siteId,ownerId:owner,instance:INSTANCE,callback:config.callback,scope:SCOPE});
   return response(await readMastodonProfile({store,transport:createKanoaSitesTransport({fetchImpl}),clock}));
  }
  const transport=createKanoaSitesTransport({fetchImpl});
  const authorizeAction=async action=>action.ownerId===owner&&action.instance===INSTANCE&&action.scope===SCOPE&&action.redirectUri===url.origin+CALLBACK&&(
   action.action==='register_application_and_start'&&url.pathname===prefix+'start'&&request.method==='POST'||
   action.action==='exchange_code_and_store_profile'&&url.pathname===CALLBACK&&request.method==='GET'||
   action.action==='revoke_profile'&&url.pathname===prefix+'revoke'&&request.method==='POST');
  // Start body and origin are verified by the router before registration.
  // Callback can invoke authorization only after durable one-time state claim,
  // owner-bound encrypted storage, browser cookie, PKCE and expiry checks.
  if(![prefix+'revoke',prefix+'recover'].includes(url.pathname))return await handleMastodonOAuth(request,env,{transport,authorizeAction,requireExplicitConsent:true,clock,httpOptions:{requestCache:false,requestRedirect:'manual'}});
  if(env.TAKT_MASTODON_ENABLED!=='true')return response({error:'NOT_CONFIGURED'},503);
  const config=configuration(JSON.parse(env.TAKT_MASTODON_CONFIGURATION));
  if(request.method!=='POST'||url.origin!==config.siteOrigin||url.search||request.headers.get('Origin')!==config.siteOrigin||request.headers.get('Sec-Fetch-Site')==='cross-site'||request.headers.get('X-Planner-Request')!=='1'||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type')||''))return response({error:'REQUEST_REJECTED'},403);
  const body=await boundedJSON(request),recover=url.pathname===prefix+'recover';
  if(recover){if(Object.keys(body).sort().join(',')!=='consent,expectedPhase,expectedVersion'||!['pending','registration_outcome_unknown','authorization_outcome_unknown','exchange_outcome_unknown','declined','linked','verification_pending','revocation_pending','recovery_pending'].includes(body.expectedPhase)||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<1||body.consent!==(body.expectedPhase==='recovery_pending'?'confirmed-manual-kanoa-profile-revocation-v2':'fence-kanoa-profile-v2'))return response({error:'NEW_RECOVERY_REVIEW_REQUIRED'},409);}
  else if(Object.keys(body).length!==1||body.consent!=='revoke-kanoa-profile-v1')return response({error:'CONSENT_REQUIRED'},400);
  const cipher=await createMastodonCipher(env.TAKT_MASTODON_KEYRING_JSON),store=new MastodonStore(env.DB,cipher,{provider:'mastodon',siteId:config.siteId,ownerId:owner,instance:INSTANCE,callback:config.callback,scope:SCOPE});
  if(recover){
   const row=await store.read();
   if(!row||row.version!==body.expectedVersion||row.value.phase!==body.expectedPhase)return response({error:'RECOVERY_STATE_CHANGED'},409);
   if(['revoked','recovered'].includes(row.value.phase))return response({error:'RECOVERY_NOT_REQUIRED'},409);
   try{
    if(row.value.phase!=='recovery_pending'){
     await store.write(row,{...row.value,phase:'recovery_pending',recoveryFencedAtMs:clock(),priorPhase:row.value.phase});
     return response({phase:'recovery_pending'});
    }
    if(!Number.isSafeInteger(row.value.recoveryFencedAtMs)||clock()-row.value.recoveryFencedAtMs<60000)return response({error:'WAIT_AND_RECONCILE_PROVIDER'},409);
    await store.write(row,{phase:'recovered',recoveredAtMs:clock(),manualProviderRevocationConfirmed:true});
    return response({phase:'recovered'});
   }catch(error){if(error?.message==='STORE_CONFLICT')return response({error:'RECOVERY_STATE_CHANGED'},409);throw error;}
  }
  return response(await createMastodonFlow({config,store,transport,authorizeAction,clock,httpOptions:{requestCache:false,requestRedirect:'manual'}}).revoke());
 }catch{return response({error:'MASTODON_UNCONFIRMED'},503);}
}
