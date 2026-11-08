import {createHTTP,createDeadline} from '../oauth/x/http.mjs';
import {INSTANCE,SCOPE} from './oauth.mjs';
const invalid=()=>{throw new Error('PROFILE_UNAVAILABLE');};
// Explicit response allowlist. Never forward CredentialAccount.source, roles,
// arbitrary provider fields, credential material, or provider error bodies.
export function projectProfile(account,subject){
 if(!account||typeof account!=='object'||account.id!==subject||!/^\d{1,40}$/.test(account.id)||typeof account.acct!=='string'||!/^[A-Za-z0-9_]{1,100}$/.test(account.acct))invalid();
 const result={id:account.id,acct:account.acct};
 for(const key of ['username','display_name','note','created_at','last_status_at']){
  const v=account[key];if(v==null)continue;if(typeof v!=='string'||v.length>(key==='note'?12000:500))invalid();result[key]=v;
 }
 for(const key of ['followers_count','following_count','statuses_count']){const v=account[key];if(v==null)continue;if(!Number.isSafeInteger(v)||v<0)invalid();result[key]=v;}
 for(const key of ['locked','bot','discoverable']){const v=account[key];if(v==null)continue;if(typeof v!=='boolean')invalid();result[key]=v;}
 // No remote image loads or arbitrary links. Bio HTML is delivered as text only.
 return result;
}
export async function readMastodonProfile({store,transport,clock=Date.now}){
 const deadline=createDeadline(15000);
 try{
  const row=await deadline.run(store.read()),v=row?.value;
  if(v?.phase!=='linked'||v.scope!==SCOPE||typeof v.accessToken!=='string'||!/^[A-Za-z0-9._~+/-]{1,4096}$/.test(v.accessToken))invalid();
  const r=await createHTTP(transport,{requestCache:false,requestRedirect:'manual'})(INSTANCE+'/api/v1/accounts/verify_credentials',{method:'GET',headers:{Authorization:'Bearer '+v.accessToken}},deadline);
  if(r.status<200||r.status>=300)invalid();
  const profile=projectProfile(r.body,v.subject);
  // Do not display a stale grant's result after revocation/recovery/reconnection.
  const current=await deadline.run(store.read());if(current?.version!==row.version||current?.value.phase!=='linked')invalid();
  deadline.check();return{provider:'mastodon',scope:SCOPE,canPublish:false,fetchedAtMs:clock(),profile};
 }finally{deadline.close();}
}
