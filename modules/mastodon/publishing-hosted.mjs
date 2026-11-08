import {configuration,createMastodonPublishingFlow,INSTANCE,CALLBACK,SCOPE} from './publishing-oauth.mjs';
import {handlePublishingOAuth} from './publishing-oauth-router.mjs';
import {createMastodonCipher} from './cipher.mjs';
import {MastodonStore} from './store.mjs';
import {MastodonPublishingGrantStore} from './publishing-grant-store.mjs';
import {MastodonPublishingLedger} from './publishing-ledger.mjs';
import {PublishingPreviewStore} from './publishing-preview-store.mjs';
import {createKanoaSitesTransport} from './sites-transport.mjs';
import {createPublishingProvider} from './publishing-provider.mjs';
import {preparePublication,createPublicationCandidate} from './publishing-preparation.mjs';
import {trustedRequestOwner,boundedJSON,OAUTH_HTTP_HEADERS} from '../oauth/http-primitives.mjs';
const prefix='/api/providers/mastodon/publishing/';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{...OAUTH_HTTP_HEADERS,'Content-Type':'application/json'}});
export async function handleHostedPublishing(request,env={}, {clock=Date.now,fetchImpl}={}) {
 const u=new URL(request.url);if(!u.pathname.startsWith(prefix))return null;
 let sending=false;
 try{
  const owner=trustedRequestOwner(request);
  if(!env.TAKT_MASTODON_OWNER_ID||owner!==env.TAKT_MASTODON_OWNER_ID)return json({error:'OWNER_REQUIRED'},403);
  const enabled=env.TAKT_MASTODON_PUBLISHING_ENABLED==='true';
  if(!enabled&&![prefix+'readiness',prefix+'revoke',prefix+'recover'].includes(u.pathname))return json({error:'PUBLISHING_DISABLED'},503);
  const config=configuration(JSON.parse(env.TAKT_MASTODON_CONFIGURATION));
  if(u.origin!==config.siteOrigin)return json({error:'ORIGIN_REQUIRED'},403);
  const cipher=await createMastodonCipher(env.TAKT_MASTODON_KEYRING_JSON),context={provider:'mastodon',siteId:config.siteId,ownerId:owner,instance:INSTANCE,callback:config.callback,scope:SCOPE,purpose:'publishing'};
  const store=new MastodonPublishingGrantStore(env.DB,cipher,context);
  const profileStore=new MastodonStore(env.DB,cipher,{provider:'mastodon',siteId:config.siteId,ownerId:owner,instance:INSTANCE,callback:config.siteOrigin+'/api/providers/mastodon/oauth/callback',scope:'profile'});
  const profile=(await profileStore.read())?.value;
  if(u.pathname.includes('/oauth/')&&profile?.phase!=='linked')return json({error:'PROFILE_CONNECTION_REQUIRED'},409);
  const oauth=await handlePublishingOAuth(request,env,{owner,config,store,transport:createKanoaSitesTransport({fetchImpl}),clock});if(oauth)return oauth;
  if(u.search||request.headers.get('Sec-Fetch-Site')==='cross-site'||request.headers.has('Origin')&&request.headers.get('Origin')!==config.siteOrigin)return json({error:'REQUEST_REJECTED'},403);
  const row=await store.read(),v=row?.value;
  const linked=enabled&&profile?.phase==='linked'&&v?.phase==='linked'&&v.purpose==='publishing'&&v.scope===SCOPE&&v.subject===profile?.subject&&(v.expiresAt==null||v.expiresAt>clock());
  const canRevoke=['linked','verification_pending'].includes(v?.phase)&&!!v.accessToken;
  const canRecover=!!row&&!['revoked','recovered'].includes(v.phase);
  if(u.pathname===prefix+'readiness')return request.method==='GET'?json({phase:v?.phase||(enabled?'not_connected':'not_configured'),account:profile?.acct,canStart:enabled&&profile?.phase==='linked'&&(!row||['revoked','recovered'].includes(v.phase)),canPublish:!!linked,canRevoke,canRecover,recoveryPending:v?.phase==='recovery_pending',recoveryReady:v?.phase==='recovery_pending'&&clock()-v.recoveryFencedAtMs>=60000,accountMismatch:v?.phase==='linked'&&v.subject!==profile?.subject,expired:v?.expiresAt!=null&&v.expiresAt<=clock()}):json({error:'METHOD_NOT_ALLOWED'},405);
  if(request.method!=='POST'||request.headers.get('Origin')!==config.siteOrigin||request.headers.get('X-Planner-Request')!=='1'||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type')||''))return json({error:'REQUEST_REJECTED'},403);
  const body=await boundedJSON(request,8192),previews=new PublishingPreviewStore(env.DB,cipher,context);
  const previous=await previews.read();
  if([prefix+'revoke',prefix+'recover'].includes(u.pathname)){
   const recover=u.pathname===prefix+'recover';
   if(Object.keys(body).length!==1||body.consent!==(recover?(v?.phase==='recovery_pending'?'confirmed-manual-kanoa-publishing-revocation-v1':'fence-kanoa-publishing-v1'):'revoke-kanoa-publishing-v1'))return json({error:'CONSENT_REQUIRED'},400);
   if(recover){
    if(!canRecover)return json({error:'RECOVERY_NOT_REQUIRED'},409);
    if(v.phase!=='recovery_pending'){
     // Fence callbacks/registration completion by CAS before abandoning secrets.
     // The second deliberate confirmation is after all 15s network deadlines.
     await store.write(row,{...v,phase:'recovery_pending',recoveryFencedAtMs:clock()});
     await previews.write(previous,{cancelled:true});
     return json({phase:'recovery_pending'});
    }
    if(clock()-v.recoveryFencedAtMs<60000)return json({error:'WAIT_AND_RECONCILE_PROVIDER'},409);
    await store.write(row,{phase:'recovered',recoveredAtMs:clock(),manualProviderRevocationConfirmed:true});
    await previews.write(previous,{cancelled:true});
    return json({phase:'recovered'});
   }
   if(!canRevoke)return json({error:'MANUAL_RECOVERY_REQUIRED'},409);
   // Revocation reserves its own phase before network. A timeout is not retried;
   // use explicit manual recovery. Profile store and publication ledger untouched.
   await previews.write(previous,{cancelled:true});
   const flow=createMastodonPublishingFlow({config,store,transport:createKanoaSitesTransport({fetchImpl}),runtimeEnabled:true,clock,httpOptions:{requestCache:false,requestRedirect:'manual'},authorizeAction:async action=>action.action==='revoke_publishing'&&action.ownerId===owner&&action.scope===SCOPE});
   return json(await flow.revoke());
  }
  if(u.pathname===prefix+'cancel'){if(Object.keys(body).length)throw Error('FIELDS_INVALID');await previews.write(previous,{cancelled:true});return json({state:'cancelled'});}
  if(!linked)return json({error:'SEPARATE_PUBLISHING_GRANT_REQUIRED'},409);
  if(u.pathname===prefix+'preview'){
   if(Object.keys(body).some(k=>!['text','visibility','sensitive','spoilerText'].includes(k)))throw Error('TEXT_ONLY_REQUIRED');
   const plan=await preparePublication({...body,ownerId:owner,subject:v.subject});
   await previews.write(previous,{plan,grantVersion:row.version,expiresAt:clock()+300000});return json({...plan,account:profile.acct});
  }
  if(u.pathname!==prefix+'submit')return json({error:'NOT_FOUND'},404);
  if(Object.keys(body).sort().join(',')!=='confirmedReviewId,explicitAction'||body.explicitAction!=='publish_now'||previous?.value?.plan?.reviewId!==body.confirmedReviewId||previous.value.expiresAt<=clock()||previous.value.grantVersion!==row.version)return json({error:'NEW_PREVIEW_REQUIRED'},409);
  const plan=previous.value.plan;
  // Consume preview before any external calls. Identical content remains fenced
  // by the permanent ledger even across fresh previews, browsers and reloads.
  await previews.write(previous,{consumed:true});
  const provider=createPublishingProvider({token:v.accessToken,subject:v.subject,fetchImpl});await provider.verify();
  const ledger=new MastodonPublishingLedger(env.DB,context);
  sending=true;
  const result=await createPublicationCandidate({ledger,provider,clock,authorize:async a=>{const latest=await store.read(),currentProfile=await profileStore.read();return a.reviewId===body.confirmedReviewId&&a.ownerId===owner&&latest?.version===row.version&&latest.value.phase==='linked'&&currentProfile?.value.phase==='linked'&&currentProfile.value.subject===v.subject;}}).execute({plan,identity:{ownerId:owner},grant:{ownerId:owner,subject:v.subject,instance:INSTANCE,phase:'linked',scopes:SCOPE.split(' '),expiresAt:v.expiresAt},confirmedReviewId:body.confirmedReviewId,explicitAction:body.explicitAction});
  return json(result);
 }catch{return json({error:sending?'PUBLICATION_UNCONFIRMED':'REQUEST_UNCONFIRMED',message:'Nicht automatisch wiederholen. Prüfe dein Mastodon-Profil.'},409);}
}
