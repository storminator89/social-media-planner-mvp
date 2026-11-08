import {handleHostedPublishing} from '../modules/mastodon/publishing-hosted.mjs';
import {handleHostedMastodon} from '../modules/mastodon/hosted.mjs';
import {handleXOAuth,X_CALLBACK_PATH} from '../modules/oauth/x/http-router.mjs';
import {handleInstagramOAuth} from '../modules/instagram/http-router.mjs';
import {handleHostedWorkspaces} from '../modules/workspaces/runtime.mjs';
import {handleYouTube} from '../modules/youtube/http-router.mjs';
import {YOUTUBE_CALLBACK_PATH} from '../modules/oauth/youtube-contract.mjs';
import {handleLinkedInOAuth} from '../modules/oauth/http-router.mjs';
import {LINKEDIN_CALLBACK_PATH} from '../modules/oauth/linkedin-contract.mjs';
import {handleProviderStatus} from '../modules/providers/status-api.mjs';
import { handlePlannerRequest } from '../modules/data/api.mjs';

const SECURITY = Object.freeze({
  'Cache-Control':'private, no-store',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'Vary':'oai-authenticated-user-id',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
});
const reserved = new Set(['/signin-with-chatgpt','/signout-with-chatgpt','/callback']);
function error(status,code,message){return new Response(JSON.stringify({error:{code,message}}),{status,headers:{...SECURITY,'Content-Type':'application/json; charset=utf-8'}});}
function validIdentity(request){const owner=request.headers.get('oai-authenticated-user-id');return typeof owner==='string'&&owner.trim().length>0&&owner.length<=256;}
function secure(response){const headers=new Headers(response.headers);for(const [key,value] of Object.entries(SECURITY)){if(!headers.has(key))headers.set(key,value);}return new Response(response.body,{status:response.status,headers});}

/** Hosted-only entry: trust identity solely behind Sites Dispatch, never expose directly. */
export function createSitesHandler({assets={},providerStatus=handleProviderStatus,oauthTransport,xAuthorizeAction,clock=Date.now}={}){
  return {
    async fetch(request,env={}){
      const url=new URL(request.url);
      // Dispatch owns these endpoints; this Worker must not implement another login flow.
      if(reserved.has(url.pathname))return error(404,'DISPATCH_ROUTE','Dieser Pfad wird vom Sites-Zugang verwaltet.');
      // Exact provider callback only; the router independently requires full server
      // configuration, matching Dispatch identity, per-attempt cookie and state.
      if(url.pathname==='/api/providers/mastodon/publishing/oauth/callback'&&request.method==='GET'){return secure(await handleHostedPublishing(request,env,{clock}));}
      if(url.pathname==='/api/providers/mastodon/oauth/callback'&&request.method==='GET'){return secure(await handleHostedMastodon(request,env,{clock}));}
      if(url.pathname===LINKEDIN_CALLBACK_PATH&&request.method==='GET'){try{return secure(await handleLinkedInOAuth(request,env,{transport:oauthTransport,clock}));}catch{return error(503,'OAUTH_UNAVAILABLE','Die Kontoverbindung ist nicht verfügbar.');}}
      if(url.pathname===X_CALLBACK_PATH&&request.method==='GET'){try{return secure(await handleXOAuth(request,env,{transport:oauthTransport,authorizeAction:xAuthorizeAction,clock}));}catch{return error(503,'X_OAUTH_UNAVAILABLE','Die X-Verbindung ist nicht verfügbar.');}}
      if(url.pathname===YOUTUBE_CALLBACK_PATH&&request.method==='GET'){try{return secure(await handleYouTube(request,env,{transport:oauthTransport,clock}));}catch{return error(503,'YOUTUBE_UNAVAILABLE','Die YouTube-Verbindung ist nicht verfügbar.');}}
      if(!validIdentity(request)){
        if(url.pathname==='/'&&request.method==='GET')return new Response('<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Takt · Anmelden</title><main><h1>Dein geschützter Planer</h1><p>Melde dich mit ChatGPT an, um deine Planung zu öffnen.</p><a href="/signin-with-chatgpt?return_to=%2F" target="_top">Mit ChatGPT anmelden</a><p>Social-Media-Konten werden dadurch nicht verbunden.</p></main></html>',{status:401,headers:{...SECURITY,'Content-Type':'text/html; charset=utf-8'}});
        return error(401,'SIGN_IN_REQUIRED','Bitte mit ChatGPT anmelden.');
      }
      // A provider redirect retains cross-site fetch metadata on its landing GET.
      // Permit only the authenticated static result document, never an API,
      // subresource, frame, mutation or foreign-Origin request. The document
      // reads readiness; the outcome query is not evidence of a connection.
      const mastodonReturnDocument=request.method==='GET'&&['/mastodon.html','/mastodon-publish.html'].includes(url.pathname)&&
        request.headers.get('Sec-Fetch-Mode')==='navigate'&&request.headers.get('Sec-Fetch-Dest')==='document';
      if((request.headers.get('Sec-Fetch-Site')==='cross-site'&&!mastodonReturnDocument)||(request.headers.has('Origin')&&request.headers.get('Origin')!==url.origin))return error(403,'CROSS_ORIGIN_REQUEST','Diese Anfrage ist nicht erlaubt.');
      // Fail closed. Hosted schema installation is a deployment step, not a request side effect.
      if(!env.DB?.prepare||!env.DB?.batch)return error(503,'STORAGE_UNAVAILABLE','Der serverseitige Speicher ist noch nicht verfügbar.');
      try{
        if(url.pathname==='/api/providers/status'){
          if(request.method!=='GET')return error(405,'METHOD_NOT_ALLOWED','Nur lesender Zugriff ist verfügbar.');
          if(!providerStatus)return error(503,'PROVIDER_STATUS_UNAVAILABLE','Der Verbindungsstatus ist noch nicht verfügbar.');
          return secure(await providerStatus(request,env));
        }
        const publishing=await handleHostedPublishing(request,env,{clock});if(publishing)return secure(publishing);
        const mastodon=await handleHostedMastodon(request,env,{clock});if(mastodon)return secure(mastodon);
        const instagram=await handleInstagramOAuth(request);if(instagram)return secure(instagram);
        const x=await handleXOAuth(request,env,{transport:oauthTransport,authorizeAction:xAuthorizeAction,clock});if(x)return secure(x);
        const youtube=await handleYouTube(request,env,{transport:oauthTransport,clock});if(youtube)return secure(youtube);
        const oauth=await handleLinkedInOAuth(request,env,{transport:oauthTransport,clock});if(oauth)return secure(oauth);
        const workspace=await handleHostedWorkspaces(request,env,{clock});if(workspace)return secure(workspace);
        const api=await handlePlannerRequest(request,env);if(api)return secure(api);
        if(url.pathname.startsWith('/api/'))return error(404,'NOT_FOUND','Endpunkt nicht vorhanden.');
        if(!['GET','HEAD'].includes(request.method))return error(405,'METHOD_NOT_ALLOWED','Methode nicht erlaubt.');
        const path=url.pathname==='/'?'/index.html':url.pathname;
        const asset=Object.hasOwn(assets,path)?assets[path]:null;
        if(!asset)return error(404,'NOT_FOUND','Datei nicht vorhanden.');
        return new Response(request.method==='HEAD'?null:asset.body,{headers:{...SECURITY,'Content-Type':asset.type}});
      }catch{return error(503,'SERVICE_UNAVAILABLE','Die Anfrage konnte nicht sicher verarbeitet werden. Bitte später erneut prüfen.');}
    }
  };
}
