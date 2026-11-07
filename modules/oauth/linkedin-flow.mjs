import {OAuthStateRepository} from './state-repository.mjs';
import {assertLinkedInOfflineConfiguration,createOfflineNonce,parseLinkedInCallback,OAuthContractError} from './linkedin-contract.mjs';

/** Deliberately outside the HTTP/Worker import graph. This factory owns BOTH the
 * parser configuration and matching repository context. No independently injected
 * repository can accidentally claim another app/Site/redirect's state. */
export function createOfflineLinkedInFlow(db,config,{clock=Date.now}={}){
  assertLinkedInOfflineConfiguration(config);
  const repository=new OAuthStateRepository(db,{siteId:config.siteId,provider:config.provider,redirectUri:config.redirectUri,scopeFingerprint:config.scopeFingerprint,configFingerprint:config.configFingerprint,contextFingerprint:config.contextFingerprint,flowVersion:config.flowVersion,clock});
  function requireOwner(owner){if(typeof owner!=='string'||!owner||owner.trim()!==owner||owner.length>256||!owner.isWellFormed()||/[\u0000-\u001f\u007f]/.test(owner))throw new OAuthContractError('INVALID_CALLBACK_CONTEXT','Der OAuth-Vorbereitungsvertrag wurde nicht erfüllt.');}
  return Object.freeze({
    /** Server-internal transient values only. Never log, expose or persist raw values. */
    async begin(trustedOwner,browserBinding){
      requireOwner(trustedOwner);const {nonce,nonceFingerprint}=await createOfflineNonce();
      const attempt=await repository.begin(trustedOwner,browserBinding,{nonceFingerprint});
      return Object.freeze({...attempt,nonce});
    },
    /** trustedOwner must come from the same verified Dispatch session as begin.
     * A code receipt is NOT a valid token, verified account, grant or connection. */
    async claimCallback({trustedOwner,callbackUrl,browserBinding}={}){
      requireOwner(trustedOwner);const parsed=parseLinkedInCallback(config,callbackUrl);
      let result;try{result=await repository.claim(trustedOwner,parsed.state,browserBinding);}catch{return Object.freeze({status:'claim_outcome_unknown',connected:false});}
      if(result===false)return Object.freeze({status:'invalid_attempt',connected:false});
      if(!result||result.claimed!==true||typeof result.nonceFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(result.nonceFingerprint))return Object.freeze({status:'claim_outcome_unknown',connected:false});
      if(parsed.kind==='denied')return Object.freeze({status:'provider_denied',connected:false});
      return Object.freeze({status:'code_validated_not_exchanged',connected:false,authorizationCode:parsed.authorizationCode,nonceFingerprint:result.nonceFingerprint});
    }
  });
}
