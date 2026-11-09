import {preflightFailure} from './diagnostics.mjs';
import {configuration,createMastodonFlow,INSTANCE,CALLBACK,SCOPE} from './oauth.mjs';
import {createMastodonCipher} from './cipher.mjs';
import {MastodonStore} from './store.mjs';
import {trustedRequestOwner,boundedJSON,OAUTH_HTTP_HEADERS,randomBrowserBinding,hashOAuthState} from '../oauth/http-primitives.mjs';
const prefix='/api/providers/mastodon/oauth/';
const json=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{...OAUTH_HTTP_HEADERS,'Content-Type':'application/json',...extra}});
const fail=(status=503)=>json({error:{code:'MASTODON_UNAVAILABLE',message:'Verbindung nicht bestätigt. Nicht automatisch wiederholen.'}},status);
const cookie=(h,v)=>`__Host-takt-mastodon-${h}=${v}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${v?300:0}`;
export async function handleMastodonOAuth(request,env={}, {transport,authorizeAction,requireExplicitConsent=false,clock=Date.now,httpOptions}={}){
 const u=new URL(request.url);if(![prefix+'readiness',prefix+'start',CALLBACK].includes(u.pathname))return null;
 const callback=u.pathname===CALLBACK,readiness=u.pathname===prefix+'readiness';
 if(request.method!==(callback||readiness?'GET':'POST'))return fail(405);
 let owner;try{owner=trustedRequestOwner(request);}catch{return fail(401);}
 if(!callback&&(request.headers.get('Sec-Fetch-Site')==='cross-site'||request.headers.has('Origin')&&request.headers.get('Origin')!==u.origin))return fail(403);
 let config,cipher;
 try{if(env.TAKT_MASTODON_ENABLED!=='true'||typeof transport!=='function'||typeof authorizeAction!=='function')throw Error();config=configuration(JSON.parse(env.TAKT_MASTODON_CONFIGURATION));cipher=await createMastodonCipher(env.TAKT_MASTODON_KEYRING_JSON);}catch{return readiness?json({provider:'mastodon',phase:'not_configured',canStart:false,canPublish:false,instance:INSTANCE,scope:SCOPE}):fail();}
 if(u.origin!==config.siteOrigin)return fail(403);
 const store=new MastodonStore(env.DB,cipher,{provider:'mastodon',siteId:config.siteId,ownerId:owner,instance:INSTANCE,callback:config.callback,scope:SCOPE});
 let stateHash;
 const redirect=outcome=>new Response(null,{status:303,headers:{...OAUTH_HTTP_HEADERS,Location:config.siteOrigin+'/mastodon.html?outcome='+outcome,...(stateHash?{'Set-Cookie':cookie(stateHash,'')}:{})}});
 try{
  if(readiness){if(u.search)return fail(400);const row=await store.read();return json({provider:'mastodon',phase:row?.value.phase||'not_connected',recoveryVersion:row?.version??null,canStart:!row||['revoked','recovered'].includes(row.value.phase),canPublish:false,instance:INSTANCE,scope:SCOPE,...(row?.value.phase==='linked'?{account:row.value.acct,verifiedAtMs:row.value.verifiedAtMs}:{})});}
  const flow=createMastodonFlow({config,store,transport,authorizeAction,clock,httpOptions});
  if(callback){
   if(request.url.length>8192||u.hash)return redirect('unconfirmed');
   const keys=[...u.searchParams.keys()];if(keys.length!==new Set(keys).size||keys.some(k=>!['state','code','error','error_description'].includes(k))||u.searchParams.has('code')===u.searchParams.has('error'))return redirect('unconfirmed');
   const state=u.searchParams.get('state');stateHash=await hashOAuthState(state);
   const cookies=request.headers.get('Cookie')||'';if(cookies.length>16384)return redirect('unconfirmed');
   const name='__Host-takt-mastodon-'+stateHash+'=',values=cookies.split(';').map(x=>x.trim()).filter(x=>x.startsWith(name)).map(x=>x.slice(name.length));
   if(values.length!==1)return redirect('unconfirmed');
   const result=await flow.complete({state,binding:values[0],code:u.searchParams.get('code'),error:u.searchParams.get('error')});return redirect(result.phase==='linked'?'linked':'cancelled');
  }
  if(u.search||u.hash||request.headers.get('Origin')!==config.siteOrigin||request.headers.get('X-Planner-Request')!=='1')return fail(403);
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type')||''))return fail(415);
  if(!validStartBody(await boundedJSON(request),requireExplicitConsent))return fail(400);
  const binding=randomBrowserBinding(),result=await flow.begin(binding);stateHash=await hashOAuthState(new URL(result.authorizationUrl).searchParams.get('state'));
  return json(result,200,{'Set-Cookie':cookie(stateHash,binding)});
 }catch(error){return callback?redirect('unconfirmed'):preflightFailure(error)?json(preflightFailure(error),503):fail();}
}

function validStartBody(body,explicit){return explicit?Object.keys(body).length===1&&body.consent==='kanoa-profile-v1':Object.keys(body).length===0;}
