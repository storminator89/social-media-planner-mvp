import {LINKEDIN_REQUIRED_SCOPES,LINKEDIN_OAUTH_CAPABILITIES} from './linkedin-contract.mjs';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'oai-authenticated-user-id'};
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
/** Static preparation facts, not environment/credential discovery or OAuth initiation. */
export async function handleOAuthReadiness(request){
  if(new URL(request.url).pathname!=='/api/providers/linkedin/oauth/readiness')return null;
  const owner=request.headers.get('oai-authenticated-user-id');
  if(!owner||!owner.trim()||owner.length>256)return response({error:{code:'SIGN_IN_REQUIRED',message:'Bitte mit ChatGPT anmelden.'}},401);
  if(request.method!=='GET')return response({error:{code:'METHOD_NOT_ALLOWED',message:'Nur lesender Zugriff ist verfügbar.'}},405);
  if(request.headers.get('Sec-Fetch-Site')==='cross-site'||(request.headers.has('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin))return response({error:{code:'CROSS_ORIGIN_REQUEST',message:'Diese Anfrage ist nicht erlaubt.'}},403);
  return response({schemaVersion:1,provider:'linkedin',stage:'offline_preparation',capabilities:LINKEDIN_OAUTH_CAPABILITIES,proposedAccountType:'personal',targetConfirmed:false,requiredScopes:LINKEDIN_REQUIRED_SCOPES,blockerCodes:['SITE_CALLBACK_IDENTITY_UNVERIFIED','REGISTERED_APP_CONFIGURATION_REQUIRED','AUTHORIZATION_RESPONSE_PROTECTION_UNVERIFIED','SECURE_TOKEN_LIFECYCLE_UNAVAILABLE','ACCOUNT_TARGET_UNCONFIRMED'],authorizationUrl:null});
}
