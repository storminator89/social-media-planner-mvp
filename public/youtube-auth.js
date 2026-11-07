/** Browser-side checks of a server-issued Google URL. No credentials or URL synthesis. */
export const YOUTUBE_SCOPES=Object.freeze(['openid','https://www.googleapis.com/auth/youtube.upload','https://www.googleapis.com/auth/youtube.readonly']);
export function youtubeUIError(){return new Error('YouTube-Daten konnten nicht sicher geprüft werden.');}
export const ytRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const ytExact=(value,keys)=>ytRecord(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
export const ytInteger=value=>Number.isSafeInteger(value)&&value>=0;
export const ytScopes=value=>Array.isArray(value)&&value.length===YOUTUBE_SCOPES.length&&new Set(value).size===YOUTUBE_SCOPES.length&&value.every(scope=>YOUTUBE_SCOPES.includes(scope));
export function validateYouTubeAuthorization(value,{now=()=>Date.now(),siteOrigin=globalThis.location?.origin}={}){
  const fail=()=>{throw youtubeUIError();};
  if(!ytExact(value,['authorizationUrl','expiresAtMs'])||typeof value.authorizationUrl!=='string'||value.authorizationUrl.length>8192||!ytInteger(value.expiresAtMs)||value.expiresAtMs<=now())fail();
  const raw=value.authorizationUrl;
  if(!raw.startsWith('https://accounts.google.com/o/oauth2/v2/auth?')||raw.includes('#')||/[\u0000-\u0020\u007f]/.test(raw))fail();
  let url;try{url=new URL(raw);}catch{fail();}
  if(url.protocol!=='https:'||url.hostname!=='accounts.google.com'||url.port||url.username||url.password||url.hash||url.pathname!=='/o/oauth2/v2/auth')fail();
  const keys=['response_type','client_id','redirect_uri','scope','state','nonce','code_challenge','code_challenge_method','access_type','include_granted_scopes','prompt'];
  const entries=[...url.searchParams.entries()];
  if(entries.length!==keys.length||keys.some(key=>url.searchParams.getAll(key).length!==1)||entries.some(([key])=>!keys.includes(key)))fail();
  const params=url.searchParams;
  if(params.get('response_type')!=='code'||params.get('code_challenge_method')!=='S256'||params.get('access_type')!=='online'||params.get('include_granted_scopes')!=='false'||params.get('prompt')!=='select_account')fail();
  if(!/^[0-9]{3,30}(?:-[A-Za-z0-9_-]{1,128})?\.apps\.googleusercontent\.com$/.test(params.get('client_id')))fail();
  for(const key of ['state','nonce','code_challenge'])if(!/^[A-Za-z0-9_-]{43}$/.test(params.get(key)))fail();
  if(!ytScopes(params.get('scope').split(' ')))fail();
  let origin;try{origin=new URL(siteOrigin);}catch{fail();}
  if(typeof siteOrigin!=='string'||origin.protocol!=='https:'||origin.username||origin.password||origin.port||origin.search||origin.hash||siteOrigin!==origin.origin)fail();
  if(params.get('redirect_uri')!==siteOrigin+'/api/providers/youtube/oauth/callback')fail();
  return {authorizationUrl:raw,expiresAtMs:value.expiresAtMs};
}
