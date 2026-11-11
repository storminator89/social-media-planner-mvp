import assert from 'node:assert/strict';
export const landingAssets={'/index.html':{type:'text/html',body:'<h1>Static planner</h1>'}};
export const landingHeaders={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'};
export async function followLanding(response,fetchLanding,{provider,owner='alice'}={}){
 assert.equal(response.status,303);
 const url=new URL(response.headers.get('Location'));
 assert.equal(url.pathname,'/');assert.equal(url.hash,'#connections');
 assert.match(url.search,new RegExp('^\\?'+provider+'=(linked|cancelled|failed|unconfirmed)$'));
 url.hash=''; // Browser fragments never reach HTTP.
 const landing=await fetchLanding(new Request(url,{headers:{...landingHeaders,...(owner?{'oai-authenticated-user-id':owner}:{})}}));
 assert.equal(landing.status,owner?200:401);
 assert.match(landing.headers.get('Content-Type'),/text\/html/);
 return response;
}
export function checkCallbackLandings(handler,provider,countCalls){
 const fetch=handler.fetch.bind(handler);
 handler.fetch=async(request,env)=>{
  const response=await fetch(request,env);
  if(response.status===303&&new URL(request.url).pathname===`/api/providers/${provider}/oauth/callback`){
   const before=countCalls();await followLanding(response,req=>fetch(req,env),{provider,owner:request.headers.get('oai-authenticated-user-id')});assert.equal(countCalls(),before,'landing must not call provider');
  }
  return response;
 };
 return handler;
}
