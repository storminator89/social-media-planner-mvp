import {handleProviderStatus} from '../modules/providers/status-api.mjs';
import { handlePlannerRequest } from '../modules/data/api.mjs';

const SECURITY = Object.freeze({
  'Cache-Control':'private, no-store',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'Vary':'oai-authenticated-user-id',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
});
const reserved = new Set(['/signin-with-chatgpt','/signout-with-chatgpt','/callback']);
function error(status,code,message){return new Response(JSON.stringify({error:{code,message}}),{status,headers:{...SECURITY,'Content-Type':'application/json; charset=utf-8'}});}
function validIdentity(request){const owner=request.headers.get('oai-authenticated-user-id');return typeof owner==='string'&&owner.trim().length>0&&owner.length<=256;}
function secure(response){const headers=new Headers(response.headers);for(const [key,value] of Object.entries(SECURITY)){if(!headers.has(key))headers.set(key,value);}return new Response(response.body,{status:response.status,headers});}

/** Hosted-only entry: trust identity solely behind Sites Dispatch, never expose directly. */
export function createSitesHandler({assets={},providerStatus=handleProviderStatus}={}){
  return {
    async fetch(request,env={}){
      const url=new URL(request.url);
      // Dispatch owns these endpoints; this Worker must not implement another login flow.
      if(reserved.has(url.pathname))return error(404,'DISPATCH_ROUTE','Dieser Pfad wird vom Sites-Zugang verwaltet.');
      if(!validIdentity(request)){
        if(url.pathname==='/'&&request.method==='GET')return new Response('<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Takt · Anmelden</title><main><h1>Dein geschützter Planer</h1><p>Melde dich mit ChatGPT an, um deine Planung zu öffnen.</p><a href="/signin-with-chatgpt?return_to=%2F" target="_top">Mit ChatGPT anmelden</a><p>Social-Media-Konten werden dadurch nicht verbunden.</p></main></html>',{status:401,headers:{...SECURITY,'Content-Type':'text/html; charset=utf-8'}});
        return error(401,'SIGN_IN_REQUIRED','Bitte mit ChatGPT anmelden.');
      }
      if(request.headers.get('Sec-Fetch-Site')==='cross-site'||(request.headers.has('Origin')&&request.headers.get('Origin')!==url.origin))return error(403,'CROSS_ORIGIN_REQUEST','Diese Anfrage ist nicht erlaubt.');
      // Fail closed. Hosted schema installation is a deployment step, not a request side effect.
      if(!env.DB?.prepare||!env.DB?.batch)return error(503,'STORAGE_UNAVAILABLE','Der serverseitige Speicher ist noch nicht verfügbar.');
      try{
        if(url.pathname==='/api/providers/status'){
          if(request.method!=='GET')return error(405,'METHOD_NOT_ALLOWED','Nur lesender Zugriff ist verfügbar.');
          if(!providerStatus)return error(503,'PROVIDER_STATUS_UNAVAILABLE','Der Verbindungsstatus ist noch nicht verfügbar.');
          return secure(await providerStatus(request,env));
        }
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
