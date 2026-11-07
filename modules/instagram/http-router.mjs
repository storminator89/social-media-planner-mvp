import {INSTAGRAM_SCOPES,INSTAGRAM_API_VERSION} from './contract.mjs';
export const INSTAGRAM_READINESS_PATH='/api/providers/instagram/oauth/readiness';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Vary':'oai-authenticated-user-id'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
/** Deliberately no start/callback route until reviewed state, credential lifecycle
 * and authorization-code injection protection are integrated. Env flags alone
 * cannot turn protocol implementation into a live account connection. */
export async function handleInstagramOAuth(request){
 const url=new URL(request.url);if(url.pathname!==INSTAGRAM_READINESS_PATH)return null;
 const owner=request.headers.get('oai-authenticated-user-id');
 if(!owner||owner.trim()!==owner||owner.length>256)return json({error:{code:'SIGN_IN_REQUIRED'}},401);
 if(request.headers.get('Sec-Fetch-Site')==='cross-site'||request.headers.has('Origin')&&request.headers.get('Origin')!==url.origin)return json({error:{code:'CROSS_ORIGIN_REQUEST'}},403);
 if(request.method!=='GET')return json({error:{code:'METHOD_NOT_ALLOWED'}},405);
 return json({schemaVersion:1,provider:'instagram',stage:'not_configured',apiVersion:INSTAGRAM_API_VERSION,requiredScopes:INSTAGRAM_SCOPES,connected:false,canPublish:false,authorizationUrl:null,connection:null,callbackPath:null,capabilities:{initiation:false,callback:false,tokenExchange:false,accountVerification:false,publishing:false},blockerCodes:['REGISTERED_APP_CONFIGURATION_REQUIRED','AUTHORIZATION_RESPONSE_PROTECTION_UNVERIFIED','DURABLE_STATE_INTEGRATION_REQUIRED','SECURE_TOKEN_LIFECYCLE_UNAVAILABLE','PUBLISHING_DISABLED']});
}
