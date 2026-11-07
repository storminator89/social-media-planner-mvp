import {createXOAuthConfiguration,hash} from '../../modules/oauth/x/contract.mjs';
import {createXOAuthLifecycle} from '../../modules/oauth/x/lifecycle.mjs';
export const NOW=1794052800000,OWNER='sites-owner-fixture',BROWSER='B'.repeat(43),SUBJECT='1234567890123456789';
export const CALLBACK='https://planner.example.com/api/providers/x/oauth/callback';
export const input={siteId:'fixture-site',siteOrigin:'https://planner.example.com',clientId:'fixture_client_id',redirectUri:CALLBACK,appConfigVersion:'v1',offlineAccess:true};
export const grantBody=(overrides={})=>({access_token:'fixture-access-token',refresh_token:'fixture-refresh-token',token_type:'bearer',expires_in:7200,scope:'tweet.read tweet.write users.read offline.access',...overrides});
export function response(url,body,status=200,headers={}){const result=new Response(body===null?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...headers}});Object.defineProperty(result,'url',{value:url});return result;}
export function rawResponse(url,body,status=200,headers={}){const result=new Response(body,{status,headers:{'Content-Type':'application/json',...headers}});Object.defineProperty(result,'url',{value:url});return result;}
export const callback=url=>`${CALLBACK}?state=${new URL(url).searchParams.get('state')}&code=fixture-authorization-code`;
// In-memory TEST DOUBLE only. Does not model durable D1, encryption or crash recovery.
export function fixtureStore(){
  const attempts=new Map(),connections=new Map(),leases=new Map();let id=0;
  const key=c=>`${c.siteId}/${c.ownerId}/${c.provider}`;
  const match=(record,c)=>record?.context.contextFingerprint===c.contextFingerprint;
  const next=()=>`lease_${++id}`;
  const receipt=row=>({committed:true,connectionId:row.id,revision:row.revision,subject:row.grant.subject,expiresAtMs:row.grant.expiresAtMs});
  return {attempts,connections,leases,
    async beginAttempt(v,signal){if(signal.aborted)return false;const existing=connections.get(key(v.context));if(existing||attempts.has(v.stateHash))return false;attempts.set(v.stateHash,structuredClone(v));return true;},
    async claimAttempt(v,signal){const a=attempts.get(v.stateHash);if(signal.aborted||!match(a,v.context)||a.browserBindingHash!==v.browserBindingHash||a.used||a.createdAtMs>v.nowMs||a.expiresAtMs<=v.nowMs)return null;a.used=true;a.lease=next();leases.set(a.lease,a);return{contextFingerprint:a.context.contextFingerprint,stateHash:v.stateHash,lease:a.lease,verifier:a.verifier,challenge:a.challenge,expiresAtMs:a.expiresAtMs};},
    async commitNewGrant(v,signal){const a=leases.get(v.lease);if(signal.aborted||!match(a,v.context)||a.stateHash!==v.stateHash||a.closed||a.expiresAtMs<=v.nowMs||connections.has(key(v.context)))return null;a.closed=true;const row={context:structuredClone(v.context),id:`connection_${++id}`,revision:1,state:'active',grant:structuredClone(v.grant)};connections.set(key(v.context),row);return receipt(row);},
    async reserveRefresh(v,signal){const row=connections.get(key(v.context));if(signal.aborted||!match(row,v.context)||row.id!==v.connectionId||row.revision!==v.expectedRevision||row.state!=='active')return null;row.state='refresh_in_flight';row.lease=next();leases.set(row.lease,row);const g=row.grant;return{contextFingerprint:row.context.contextFingerprint,connectionId:row.id,revision:row.revision,lease:row.lease,grant:{accessToken:g.accessToken,refreshToken:g.refreshToken,tokenType:g.tokenType,scope:g.scopes.join(' '),expiresAtMs:g.expiresAtMs,subject:g.subject}};},
    async commitRefresh(v,signal){const row=connections.get(key(v.context));if(signal.aborted||!match(row,v.context)||row.id!==v.connectionId||row.revision!==v.expectedRevision||row.state!=='refresh_in_flight'||row.lease!==v.lease)return null;row.revision++;row.state='active';row.grant=structuredClone(v.grant);return receipt(row);},
    async disconnect(v,signal){const row=connections.get(key(v.context));if(signal.aborted||!match(row,v.context)||row.id!==v.connectionId||row.revision!==v.expectedRevision||row.state==='disconnected')return null;const old=row.grant;row.state='disconnected';row.revision++;row.grant=null;row.lease=null;let revocation=null;if(v.revokeProviderAccess&&old?.accessToken){row.revocationLease=next();revocation={lease:row.revocationLease,accessToken:old.accessToken,refreshToken:old.refreshToken};}return{contextFingerprint:row.context.contextFingerprint,connectionId:row.id,revision:row.revision,localDisconnected:true,revocation};},
    async finishRevocation(v,signal){const row=connections.get(key(v.context));if(signal.aborted||!match(row,v.context)||row.id!==v.connectionId||row.revision!==v.revision||row.state!=='disconnected'||row.revocationLease!==v.lease||row.revocationDone)return false;row.revocationDone=true;return true;},
  };
}
export async function harness(overrides={}){
  const store=overrides.store??fixtureStore(),calls=[],actions=[];let time=NOW;
  const config=overrides.configuration??await createXOAuthConfiguration(input);
  const transport=async req=>{calls.push(req);if(req.url.endsWith('/users/me'))return response(req.url,{data:{id:SUBJECT,username:'discarded',name:'discarded'}});if(req.url.endsWith('/revoke'))return response(req.url,{});return response(req.url,grantBody());};
  const flow=createXOAuthLifecycle({enabled:true,configuration:config,clientSecret:'fixture-client-secret',store,transport,clock:()=>time,authorizeAction:async v=>{actions.push(v);return true;},...overrides});
  return{flow,store,calls,actions,config,setTime:v=>time=v,
    async connect(){const attempt=await flow.begin({ownerId:OWNER,browserBinding:BROWSER});const result=await flow.completeCallback({ownerId:OWNER,browserBinding:BROWSER,callbackUrl:callback(attempt.authorizationUrl)});return{attempt,result};},
  };
}
