import {X_ENDPOINTS,assertConfiguration,snapshot,freeze,opaque,hash,challenge,fingerprint,textId,xId,localId,binding,verifier,token,now,ownerContext,parseCallback,tokenResponse,scopesFromResponse,fail,XOAuthError} from './contract.mjs';
import {createDeadline,createHTTP} from './http.mjs';
export const X_OAUTH_CAPABILITIES=Object.freeze({provider:'x',version:'0.6.0-candidate',liveVerified:false,httpRoutesImplemented:false,durableStoreImplemented:false,credentialEncryptionImplemented:false,publishing:false,automaticRefresh:false,automaticRetries:false});
const STORE_METHODS=['beginAttempt','claimAttempt','commitNewGrant','reserveRefresh','commitRefresh','disconnect','finishRevocation'];
const SENSITIVE_CODES=new Set(['ACTION_NOT_AUTHORIZED','INVALID_CALLBACK','ATTEMPT_INVALID','TOKEN_RESPONSE_INVALID','SCOPES_INVALID','REFRESH_TOKEN_INVALID','UNREQUESTED_REFRESH_TOKEN','IDENTITY_INVALID','SUBJECT_CHANGED','TOKEN_EXPIRED','INVALID_STORED_GRANT','STORE_OUTCOME_UNKNOWN','STORAGE_RECEIPT_INVALID','TRANSPORT_OUTCOME_UNKNOWN','DEADLINE_EXCEEDED','RESPONSE_ORIGIN_INVALID','REDIRECT_REJECTED','RESPONSE_TYPE_INVALID','RESPONSE_TOO_LARGE','RESPONSE_MALFORMED','RESPONSE_LENGTH_INVALID','CLOCK_INVALID','PROVIDER_REJECTED','PROVIDER_AUTH_REQUIRED','PROVIDER_RATE_LIMITED','PROVIDER_CREDITS_REQUIRED']);
const publicError=error=>error instanceof XOAuthError&&SENSITIVE_CODES.has(error.code)?error.code:'LIFECYCLE_FAILED';
function receipt(value,grant,expectedRevision=null){
  const v=snapshot(value,['committed','connectionId','revision','subject','expiresAtMs'],'STORAGE_RECEIPT_INVALID');
  if(v.committed!==true||!localId(v.connectionId)||!Number.isSafeInteger(v.revision)||v.revision<1||(expectedRevision!==null&&v.revision!==expectedRevision+1)||v.subject!==grant.subject||v.expiresAtMs!==grant.expiresAtMs)fail('STORAGE_RECEIPT_INVALID');return v;
}
function savedGrant(input,config){
  const g=snapshot(input,['accessToken','refreshToken','tokenType','scope','expiresAtMs','subject'],'INVALID_STORED_GRANT');
  if(!token(g.accessToken)||!token(g.refreshToken)||g.tokenType!=='Bearer'||!xId(g.subject)||!Number.isSafeInteger(g.expiresAtMs)||g.expiresAtMs<0)fail('INVALID_STORED_GRANT');
  scopesFromResponse(g.scope,config);return freeze(g);
}
function providerStatus(status){if(status===401)fail('PROVIDER_AUTH_REQUIRED');if(status===402)fail('PROVIDER_CREDITS_REQUIRED');if(status===429)fail('PROVIDER_RATE_LIMITED');if(status!==200)fail('PROVIDER_REJECTED');}
function inputConnection(value,keys){const v=snapshot(value,keys);if(!textId(v.ownerId)||!localId(v.connectionId)||!Number.isSafeInteger(v.expectedRevision)||v.expectedRevision<1)fail('INVALID_INPUT');return Object.freeze(v);}

/** Server-only orchestration candidate. No default fetch, runtime-env discovery,
 * secrets, D1 migrations or HTTP endpoints. Store contract is mandatory and must
 * be implemented/reviewed before production. Fixtures are not a connection. */
export function createXOAuthLifecycle({enabled=false,configuration,transport,clientSecret,store,authorizeAction,clock=Date.now,timeoutMs=10000}={}){
  if(enabled!==true)return Object.freeze({enabled:false,capabilities:X_OAUTH_CAPABILITIES});
  const config=assertConfiguration(configuration);
  if(typeof clientSecret!=='string'||clientSecret.length<1||clientSecret.length>4096||! /^[\x21-\x7e]+$/.test(clientSecret)||typeof authorizeAction!=='function'||typeof clock!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>20000)fail('INVALID_SERVER_CONFIGURATION');
  const methods={};for(const name of STORE_METHODS){const fn=store?.[name];if(typeof fn!=='function')fail('STORE_REQUIRED');methods[name]=fn.bind(store);}Object.freeze(methods);
  const request=createHTTP(transport),authorization=`Basic ${btoa(`${config.clientId}:${clientSecret}`)}`;
  async function database(method,input,deadline){
    deadline.check();try{return await deadline.run(Promise.resolve().then(()=>{deadline.check();return methods[method](freeze({...input}),deadline.signal);}));}
    catch(error){if(error instanceof XOAuthError&&error.code==='DEADLINE_EXCEEDED')throw error;fail('STORE_OUTCOME_UNKNOWN');}
  }
  async function permit(action,context,details,deadline){
    deadline.check();let ok;try{ok=await deadline.run(Promise.resolve().then(()=>{deadline.check();return authorizeAction(freeze({action,context,...details}),deadline.signal);}));}
    catch(error){if(error instanceof XOAuthError&&error.code==='DEADLINE_EXCEEDED')throw error;fail('ACTION_NOT_AUTHORIZED');}
    if(ok!==true)fail('ACTION_NOT_AUTHORIZED');
  }
  async function tokenRequest(form,context,purpose,deadline){
    await permit(purpose,context,{scopes:config.scopes,billableStatus:'must_be_approved'},deadline);
    const startedAt=now(clock),reply=await request(X_ENDPOINTS.token,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded',Authorization:authorization},body:new URLSearchParams(form).toString()},deadline);
    providerStatus(reply.status);return{body:reply.body,startedAt};
  }
  async function verifyIdentity(grant,context,deadline){
    if(grant.expiresAtMs<=now(clock))fail('TOKEN_EXPIRED');
    await permit('verify_x_identity',context,{billableStatus:'must_be_approved'},deadline);
    const reply=await request(X_ENDPOINTS.identity,{method:'GET',headers:{Accept:'application/json',Authorization:`Bearer ${grant.accessToken}`}},deadline);
    providerStatus(reply.status);
    if(!reply.body||Object.hasOwn(reply.body,'error')||Object.hasOwn(reply.body,'errors')||!xId(reply.body.data?.id))fail('IDENTITY_INVALID');
    if(grant.expiresAtMs<=now(clock))fail('TOKEN_EXPIRED');return reply.body.data.id;
  }
  const failure=(error,stage)=>Object.freeze({state:stage==='before_claim'?'blocked':'outcome_unknown',code:publicError(error),connected:false,canPublish:false,canRetryAutomatically:false,nextAction:stage==='before_claim'?'review_configuration_and_permissions':'inspect_durable_state_do_not_retry'});
  return Object.freeze({enabled:true,capabilities:X_OAUTH_CAPABILITIES,
    async begin(input){
      const v=snapshot(input,['ownerId','browserBinding']);if(!binding(v.browserBinding))fail('BROWSER_BINDING_REQUIRED');
      const deadline=createDeadline(timeoutMs);let stage='before_claim';
      try{
        const context=await deadline.run(ownerContext(config,v.ownerId));
        await permit('begin_x_authorization',context,{scopes:config.scopes,offlineAccess:config.offlineAccess},deadline);
        const state=opaque(),codeVerifier=opaque(64),createdAtMs=now(clock),expiresAtMs=createdAtMs+300000;
        const [stateHash,browserBindingHash,codeChallenge]=await deadline.run(Promise.all([hash(state),hash(v.browserBinding),challenge(codeVerifier)]));
        stage='claiming';
        const committed=await database('beginAttempt',{context,stateHash,browserBindingHash,verifier:codeVerifier,challenge:codeChallenge,createdAtMs,expiresAtMs},deadline);
        if(committed!==true)fail('STORAGE_RECEIPT_INVALID');
        const query=new URLSearchParams({response_type:'code',client_id:config.clientId,redirect_uri:config.redirectUri,scope:config.scopes.join(' '),state,code_challenge:codeChallenge,code_challenge_method:'S256'});
        return Object.freeze({state:'authorization_prepared',authorizationUrl:`${X_ENDPOINTS.authorize}?${query}`,expiresAtMs,connected:false,canPublish:false});
      }catch(error){return failure(error,stage);}finally{deadline.close();}
    },
    async completeCallback(input){
      const v=snapshot(input,['ownerId','browserBinding','callbackUrl']);if(!binding(v.browserBinding))fail('BROWSER_BINDING_REQUIRED');
      const deadline=createDeadline(timeoutMs);let stage='before_claim';
      try{
        const parsed=parseCallback(config,v.callbackUrl),context=await deadline.run(ownerContext(config,v.ownerId));
        await permit('complete_x_authorization',context,{scopes:config.scopes,offlineAccess:config.offlineAccess},deadline);
        const [stateHash,browserBindingHash]=await deadline.run(Promise.all([hash(parsed.state),hash(v.browserBinding)]));
        stage='claiming';
        const raw=await database('claimAttempt',{context,stateHash,browserBindingHash,nowMs:now(clock)},deadline);
        if(!raw)fail('ATTEMPT_INVALID');
        const claimed=snapshot(raw,['contextFingerprint','stateHash','lease','verifier','challenge','expiresAtMs'],'ATTEMPT_INVALID');
        if(claimed.contextFingerprint!==context.contextFingerprint||claimed.stateHash!==stateHash||!localId(claimed.lease)||!verifier(claimed.verifier)||!binding(claimed.challenge)||!Number.isSafeInteger(claimed.expiresAtMs)||claimed.expiresAtMs<=now(clock)||claimed.expiresAtMs>now(clock)+300000||await deadline.run(challenge(claimed.verifier))!==claimed.challenge)fail('ATTEMPT_INVALID');
        if(parsed.error)return Object.freeze({state:'authorization_declined',connected:false,canPublish:false,canRetryAutomatically:false});
        const {body,startedAt}=await tokenRequest({grant_type:'authorization_code',code:parsed.code,redirect_uri:config.redirectUri,code_verifier:claimed.verifier},context,'exchange_x_code',deadline);
        const tokenSet=tokenResponse(body,config,startedAt),subject=await verifyIdentity(tokenSet,context,deadline),grant=freeze({...tokenSet,subject});
        await permit('persist_x_credentials',context,{subject,scopes:config.scopes,offlineAccess:config.offlineAccess},deadline);
        if(now(clock)>=claimed.expiresAtMs||now(clock)>=grant.expiresAtMs)fail('TOKEN_EXPIRED');
        const stored=receipt(await database('commitNewGrant',{context,stateHash,lease:claimed.lease,grant,nowMs:now(clock)},deadline),grant);
        return Object.freeze({state:'credentials_committed',connectionId:stored.connectionId,revision:stored.revision,connected:false,canPublish:false,nextAction:'authenticated_encrypted_store_readback_required'});
      }catch(error){return failure(error,stage);}finally{deadline.close();}
    },
    async refreshOnce(input){
      const v=inputConnection(input,['ownerId','connectionId','expectedRevision']);
      if(!config.offlineAccess)return Object.freeze({state:'blocked',code:'OFFLINE_ACCESS_NOT_REQUESTED',connected:false,canPublish:false});
      const deadline=createDeadline(timeoutMs);let stage='before_claim';
      try{
        const context=await deadline.run(ownerContext(config,v.ownerId));
        await permit('refresh_x_credentials',context,{connectionId:v.connectionId,expectedRevision:v.expectedRevision,scopes:config.scopes},deadline);
        stage='claiming';const raw=await database('reserveRefresh',{context,connectionId:v.connectionId,expectedRevision:v.expectedRevision,nowMs:now(clock)},deadline);
        if(!raw)fail('ATTEMPT_INVALID');const claimed=snapshot(raw,['contextFingerprint','connectionId','revision','lease','grant'],'INVALID_STORED_GRANT');
        if(claimed.contextFingerprint!==context.contextFingerprint||claimed.connectionId!==v.connectionId||claimed.revision!==v.expectedRevision||!localId(claimed.lease))fail('INVALID_STORED_GRANT');
        const previous=savedGrant(claimed.grant,config);
        const {body,startedAt}=await tokenRequest({grant_type:'refresh_token',refresh_token:previous.refreshToken},context,'exchange_x_refresh',deadline);
        const tokenSet=tokenResponse(body,config,startedAt,previous.refreshToken),subject=await verifyIdentity(tokenSet,context,deadline);
        if(subject!==previous.subject)fail('SUBJECT_CHANGED');const grant=freeze({...tokenSet,subject});
        await permit('persist_x_refreshed_credentials',context,{connectionId:v.connectionId,expectedRevision:v.expectedRevision,subject,scopes:config.scopes},deadline);
        if(now(clock)>=grant.expiresAtMs)fail('TOKEN_EXPIRED');
        const stored=receipt(await database('commitRefresh',{context,connectionId:v.connectionId,expectedRevision:v.expectedRevision,lease:claimed.lease,grant,nowMs:now(clock)},deadline),grant,v.expectedRevision);
        if(stored.connectionId!==v.connectionId)fail('STORAGE_RECEIPT_INVALID');
        return Object.freeze({state:'credentials_committed',connectionId:stored.connectionId,revision:stored.revision,connected:false,canPublish:false,nextAction:'authenticated_encrypted_store_readback_required'});
      }catch(error){return failure(error,stage);}finally{deadline.close();}
    },
    async disconnectOnce(input){
      const v=inputConnection(input,['ownerId','connectionId','expectedRevision','revokeProviderAccess']);if(typeof v.revokeProviderAccess!=='boolean')fail('INVALID_INPUT');
      const deadline=createDeadline(timeoutMs);let stage='before_claim',disconnected=false;
      try{
        const context=await deadline.run(ownerContext(config,v.ownerId));
        await permit('disconnect_x_local',context,{connectionId:v.connectionId,expectedRevision:v.expectedRevision},deadline);
        if(v.revokeProviderAccess)await permit('revoke_x_provider_access',context,{connectionId:v.connectionId,expectedRevision:v.expectedRevision},deadline);
        stage='claiming';const raw=await database('disconnect',{context,connectionId:v.connectionId,expectedRevision:v.expectedRevision,revokeProviderAccess:v.revokeProviderAccess,nowMs:now(clock)},deadline);
        const result=snapshot(raw,['contextFingerprint','connectionId','revision','localDisconnected','revocation'],'STORAGE_RECEIPT_INVALID');
        if(result.contextFingerprint!==context.contextFingerprint||result.connectionId!==v.connectionId||result.revision!==v.expectedRevision+1||result.localDisconnected!==true)fail('STORAGE_RECEIPT_INVALID');
        disconnected=true;
        if(!v.revokeProviderAccess)return Object.freeze({state:'locally_disconnected',connected:false,canPublish:false,providerRevocation:'not_requested'});
        if(!result.revocation)return Object.freeze({state:'locally_disconnected',connected:false,canPublish:false,providerRevocation:'unknown',code:'REVOCATION_CREDENTIALS_UNAVAILABLE'});
        const r=snapshot(result.revocation,['lease','accessToken','refreshToken'],'INVALID_STORED_GRANT');if(!localId(r.lease)||!token(r.accessToken)||(r.refreshToken!==null&&!token(r.refreshToken)))fail('INVALID_STORED_GRANT');
        const items=[...(r.refreshToken?[['refresh',r.refreshToken]]:[]),['access',r.accessToken]],seen=new Set();
        for(const [kind,value]of items){if(seen.has(value))continue;seen.add(value);
          await permit(`revoke_x_${kind}_token`,context,{connectionId:v.connectionId,revision:result.revision,billableStatus:'must_be_approved'},deadline);
          const reply=await request(X_ENDPOINTS.revoke,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded',Authorization:authorization},body:new URLSearchParams({token:value}).toString()},deadline,{allowEmpty:true});
          providerStatus(reply.status);if(Object.hasOwn(reply.body,'error')||Object.hasOwn(reply.body,'errors'))fail('PROVIDER_REJECTED');
        }
        if(await database('finishRevocation',{context,connectionId:v.connectionId,revision:result.revision,lease:r.lease,result:'acknowledged',nowMs:now(clock)},deadline)!==true)fail('STORAGE_RECEIPT_INVALID');
        return Object.freeze({state:'locally_disconnected',connected:false,canPublish:false,providerRevocation:'responses_acknowledged',canRetryAutomatically:false});
      }catch(error){return disconnected?Object.freeze({state:'locally_disconnected',connected:false,canPublish:false,providerRevocation:'unknown',code:publicError(error),canRetryAutomatically:false}):failure(error,stage);}finally{deadline.close();}
    }
  });
}
