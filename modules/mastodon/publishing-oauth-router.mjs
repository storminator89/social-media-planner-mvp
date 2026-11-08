import {createMastodonPublishingFlow,INSTANCE,CALLBACK,SCOPE} from './publishing-oauth.mjs';
import {trustedRequestOwner,boundedJSON,OAUTH_HTTP_HEADERS,randomBrowserBinding,hashOAuthState} from '../oauth/http-primitives.mjs';
const START='/api/providers/mastodon/publishing/oauth/start';
const json=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{...OAUTH_HTTP_HEADERS,'Content-Type':'application/json',...extra}});
const fail=(status=503)=>json({error:'PUBLISHING_OAUTH_UNCONFIRMED'},status);
const cookie=(hash,binding)=>`__Host-takt-publishing-${hash}=${binding}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${binding?300:0}`;
/** Server-owned context only. Start consent is a deliberate browser action;
 * callback exchanges only the one-use browser-bound grant from that action.
 * Agent use still requires separate action-time authorization. */
export async function handlePublishingOAuth(request,env={}, {owner,config,store,transport,clock=Date.now}={}) {
 const u=new URL(request.url),callback=u.pathname===CALLBACK;
 if(!callback&&u.pathname!==START)return null;
 if(request.method!==(callback?'GET':'POST'))return fail(405);
 try{
  if(!owner||trustedRequestOwner(request)!==owner||store?.context?.ownerId!==owner)return fail(403);
  if(env.TAKT_MASTODON_PUBLISHING_ENABLED!=='true')return fail(503);
  if(!config||u.origin!==config.siteOrigin||config.scope!==SCOPE||config.callback!==u.origin+CALLBACK)return fail(403);
 }catch{return fail(403);}
 let stateHash;
 const redirect=outcome=>new Response(null,{status:303,headers:{...OAUTH_HTTP_HEADERS,Location:config.siteOrigin+'/mastodon-publish.html?outcome='+outcome,...(stateHash?{'Set-Cookie':cookie(stateHash,'')}:{})}});
 try{
  let startApproved=false;
  const authorizeAction=async action=>action.ownerId===owner&&action.instance===INSTANCE&&action.scope===SCOPE&&action.redirectUri===config.callback&&(
   startApproved&&action.action==='register_separate_publishing_application_and_start'||
   callback&&action.action==='exchange_code_and_store_publishing');
  const flow=createMastodonPublishingFlow({config,store,transport,authorizeAction,clock,runtimeEnabled:true,httpOptions:{requestCache:false,requestRedirect:'manual'}});
  if(callback){
   if(request.url.length>8192||u.hash)return redirect('unconfirmed');
   const keys=[...u.searchParams.keys()];
   if(keys.length!==new Set(keys).size||keys.some(k=>!['state','code','error','error_description'].includes(k))||u.searchParams.has('code')===u.searchParams.has('error'))return redirect('unconfirmed');
   const state=u.searchParams.get('state');stateHash=await hashOAuthState(state);
   const raw=request.headers.get('Cookie')||'';if(raw.length>16384)return redirect('unconfirmed');
   const name='__Host-takt-publishing-'+stateHash+'=',values=raw.split(';').map(v=>v.trim()).filter(v=>v.startsWith(name)).map(v=>v.slice(name.length));
   if(values.length!==1||!/^[A-Za-z0-9_-]{43}$/.test(values[0]))return redirect('unconfirmed');
   const result=await flow.complete({state,binding:values[0],code:u.searchParams.get('code'),error:u.searchParams.get('error')});
   return redirect(result.phase==='linked'?'linked':'cancelled');
  }
  if(u.search||u.hash||request.headers.get('Origin')!==config.siteOrigin||request.headers.get('Sec-Fetch-Site')==='cross-site'||request.headers.get('X-Planner-Request')!=='1')return fail(403);
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('Content-Type')||''))return fail(415);
  const body=await boundedJSON(request);
  if(Object.keys(body).length!==1||body.consent!=='kanoa-publishing-v1')return fail(400);
  startApproved=true;
  const binding=randomBrowserBinding(),result=await flow.begin(binding);
  stateHash=await hashOAuthState(new URL(result.authorizationUrl).searchParams.get('state'));
  return json(result,200,{'Set-Cookie':cookie(stateHash,binding)});
 }catch{return callback?redirect('unconfirmed'):fail();}
}
