/** Offline parser only. It does not authorize exchange, consume state, establish
 * a connection or prove that Meta bound the code to this browser attempt. */
export const INSTAGRAM_CALLBACK_PATH='/api/providers/instagram/oauth/callback';
export class InstagramCallbackError extends Error {
 constructor(){super('Instagram callback rejected.');this.code='INVALID_CALLBACK';}
}
const fail=()=>{throw new InstagramCallbackError();};
export function parseInstagramCallback(redirectUri,rawUrl){
 let redirect;
 try{redirect=new URL(redirectUri);}catch{fail();}
 if(redirect.protocol!=='https:'||redirect.href!==redirectUri||redirect.pathname!==INSTAGRAM_CALLBACK_PATH||redirect.username||redirect.password||redirect.port||redirect.search||redirect.hash)fail();
 if(typeof rawUrl!=='string'||rawUrl.length>8192||!rawUrl.startsWith(redirectUri+'?')||/[\s\x00-\x1f\x7f]/u.test(rawUrl)||/%(?![0-9a-f]{2})/i.test(rawUrl))fail();
 let url;try{url=new URL(rawUrl);decodeURIComponent(url.search.replaceAll('+',' '));}catch{fail();}
 if(url.origin+url.pathname!==redirectUri||url.hash||url.username||url.password)fail();
 const allowed=new Set(['state','code','error','error_reason','error_description']);
 for(const key of url.searchParams.keys())if(!allowed.has(key)||url.searchParams.getAll(key).length!==1)fail();
 const get=name=>url.searchParams.get(name),state=get('state'),code=get('code'),error=get('error');
 if(!state||!/^[A-Za-z0-9_-]{43}$/.test(state)||(code===null)===(error===null))fail();
 if(code!==null){
  if(!/^[\x21-\x7e]{1,4096}$/.test(code)||get('error_reason')!==null||get('error_description')!==null)fail();
  return Object.freeze({kind:'code',state,authorizationCode:code});
 }
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(error))fail();
 for(const name of ['error_reason','error_description']){const value=get(name);if(value!==null&&(value.length>1024||/[\x00-\x1f\x7f]/.test(value)))fail();}
 // No untrusted provider text is returned or logged.
 return Object.freeze({kind:'denied',state});
}
